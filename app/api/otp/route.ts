import { NextRequest } from 'next/server'
import { apiHandler, getSession, ok, err } from '@/lib/api'
import { readTable, updateById, findRecord, nowIso, invalidateCache } from '@/lib/supabase-db'
import { csrfProtection } from '@/lib/csrf'
import { createAuditLogger } from '@/lib/audit'
import { normalizeIndianMobile, maskMobile } from '@/lib/phone'
import { issueCustomerOtp, verifyCustomerOtp, recordSendResult, otpStatus, CUSTOMER_OTP_TTL_MS, CUSTOMER_OTP_COOLDOWN_MS, type OtpPurpose } from '@/lib/customerOtp'
import { sendCustomerOtp } from '@/lib/sms'
import { getBranchAccess, branchOfGuarantor, canApproveIn, canOverrideIn, clientIp } from '@/lib/branchAccess'
import { customerForRenewalLead } from '@/lib/renewalRules'
import { isProductionEnv } from '@/lib/devOnly'
import type { Session } from '@/types'

// Customer OTP endpoint.
//  purpose lead_verification: the field agent at the customer's house (new customer).
//  purpose renewal_approval:  branch staff on the phone with the customer (renewal).
// Actions: request (send code), verify (check code), override (SMS failed / no signal: needs a written reason).

const PURPOSES: OtpPurpose[] = ['lead_verification', 'renewal_approval']
const VERIFIED_FRESH_MS = 12 * 60 * 60 * 1000

type Ctx = { lead: Record<string, string>; phone: string | null; branchId: string; canOverride: boolean; customerName: string }

async function load(session: Session, purpose: OtpPurpose, leadId: string): Promise<Ctx | { error: string; status: number }> {
  const leads = await readTable('Leads', { forceFresh: true })
  const lead = findRecord(leads, 'Lead ID', leadId)
  if (!lead) return { error: 'Lead not found', status: 404 }
  const branchId = await branchOfGuarantor(lead['Guarantor ID'])

  if (purpose === 'lead_verification') {
    if (session.role !== 'NGF AGENT') return { error: 'Only the assigned field agent can verify a new customer', status: 403 }
    const agent = (await readTable('Agents')).find(a => a['User ID'] === session.userId)
    if (!agent || lead['Assigned Agent ID'] !== agent['Agent ID']) return { error: 'No permission', status: 403 }
    if (lead['Status'] !== 'Agent Assigned') return { error: 'This lead is not waiting for verification', status: 400 }
    return { lead, phone: null, branchId, canOverride: true, customerName: lead['Customer Name'] }
  }

  // renewal_approval
  if (session.role !== 'Admin' && session.role !== 'Staff') return { error: 'No permission', status: 403 }
  if (lead['Loan Product'] !== 'RENEWAL') return { error: 'This is not a renewal request', status: 400 }
  if (lead['Status'] !== 'Pending') return { error: 'This renewal is not waiting for approval', status: 400 }
  const access = await getBranchAccess(session)
  if (!canApproveIn(access, branchId)) return { error: 'This renewal belongs to another branch', status: 403 }
  const customer = customerForRenewalLead(lead, await readTable('Customers', { forceFresh: true }))
  return { lead, phone: normalizeIndianMobile(customer?.['Phone']), branchId, canOverride: canOverrideIn(access, branchId), customerName: customer?.['Name'] || lead['Customer Name'] }
}

export const GET = apiHandler(async (req: NextRequest) => {
  const session = await getSession(req)
  const { searchParams } = new URL(req.url)
  const purpose = searchParams.get('purpose') as OtpPurpose, leadId = searchParams.get('leadId') || ''
  if (!PURPOSES.includes(purpose) || !leadId) return err('purpose and leadId required')
  const ctx = await load(session, purpose, leadId)
  if ('error' in ctx) return err(ctx.error, ctx.status)
  const st = await otpStatus(purpose, leadId)
  const l = ctx.lead
  return ok({
    phoneMasked: maskMobile(purpose === 'renewal_approval' ? ctx.phone : (ctx.phone || l['Phone'])),
    hasValidPhone: purpose === 'renewal_approval' ? !!ctx.phone : true,
    canOverride: ctx.canOverride,
    verified: !!l['Otp Verified At'] && Date.now() - Date.parse(l['Otp Verified At']) < VERIFIED_FRESH_MS,
    overrideReason: l['Otp Override Reason'] || '',
    last: st, cooldownMs: CUSTOMER_OTP_COOLDOWN_MS,
  })
})

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await getSession(req)
  const csrfError = csrfProtection(req, session.userId)
  if (csrfError) return csrfError
  const body = await req.json().catch(() => ({}))
  const { action, purpose, leadId } = body as { action: string; purpose: OtpPurpose; leadId: string }
  if (!PURPOSES.includes(purpose) || !leadId) return err('purpose and leadId required')

  const ctx = await load(session, purpose, leadId)
  if ('error' in ctx) return err(ctx.error, ctx.status)
  const audit = createAuditLogger(req, session)

  // The number: renewals use the customer's registered mobile (staff cannot change it); the agent may correct the number at the house.
  const phone = purpose === 'renewal_approval' ? ctx.phone : normalizeIndianMobile(body.phone || ctx.lead['Phone'])

  if (action === 'request') {
    if (!phone) return err(purpose === 'renewal_approval' ? 'This customer has no valid registered mobile number. Use the override with a reason.' : 'Enter a valid 10-digit mobile number')
    const issued = await issueCustomerOtp({ purpose, subjectId: leadId, phone, requestedBy: session.userId, ip: clientIp(req) })
    if (!issued.issued) {
      const msg = issued.reason === 'cooldown' ? 'Please wait a minute before asking for another code' : issued.reason === 'hourly_cap' ? 'Too many codes for this customer in the last hour. Try later or use the override with a reason.' : 'Could not create a code. Try again.'
      return err(msg, 429)
    }
    const sent = await sendCustomerOtp(phone, issued.otp, CUSTOMER_OTP_TTL_MS / 60000, ctx.customerName || 'customer')
    await recordSendResult(issued.id, sent.status === 'sent' ? 'sent' : sent.status, 'provider' in sent ? sent.provider : undefined, 'ref' in sent ? sent.ref : undefined)
    await audit.log('CUSTOMER_OTP_REQUESTED', 'Lead', leadId, { purpose, phone: maskMobile(phone), sendStatus: sent.status })
    const delivered = sent.status === 'sent' || sent.status === 'test_email'
    return ok({
      sent: delivered, sendStatus: sent.status, phoneMasked: maskMobile(phone),
      message: sent.status === 'sent' ? 'Code sent to the customer by SMS' : sent.status === 'test_email' ? 'TEST MODE: the code was emailed to the testing mailbox' : sent.status === 'not_configured' ? 'SMS is not set up yet' : 'The SMS could not be sent',
      canOverride: ctx.canOverride, expiresInSec: CUSTOMER_OTP_TTL_MS / 1000, cooldownSec: CUSTOMER_OTP_COOLDOWN_MS / 1000,
      // Local development only, when no SMS and no test mailbox is available. Never present on the live site.
      ...(!delivered && !isProductionEnv() ? { devOtp: issued.otp } : {}),
    })
  }

  if (action === 'verify') {
    const r = await verifyCustomerOtp({ purpose, subjectId: leadId, code: String(body.code || '') })
    if (!r.ok) {
      await audit.log('CUSTOMER_OTP_FAILED', 'Lead', leadId, { purpose, reason: r.reason }, false)
      return err(r.reason === 'locked' ? 'Too many wrong tries. Ask for a new code.' : r.reason === 'none' ? 'No active code. Ask for a new one.' : 'That code is not correct', 400)
    }
    await updateById('Leads', leadId, { 'Otp Verified At': nowIso(), 'Otp Phone': r.phone, 'Otp Override Reason': null, 'Otp Override By': null, 'Updated At': nowIso() })
    invalidateCache('Leads')
    await audit.log('CUSTOMER_OTP_VERIFIED', 'Lead', leadId, { purpose, phone: maskMobile(r.phone) })
    return ok({ verified: true })
  }

  if (action === 'override') {
    const reason = String(body.reason || '').trim()
    if (reason.length < 10) return err('Write the reason (at least 10 characters): for example "customer has no signal, called twice"')
    if (!ctx.canOverride) return err('Only the branch manager or assistant manager can approve without an OTP', 403)
    await updateById('Leads', leadId, { 'Otp Verified At': null, 'Otp Override Reason': reason.slice(0, 300), 'Otp Override By': session.userId, 'Updated At': nowIso() })
    invalidateCache('Leads')
    await audit.log('CUSTOMER_OTP_OVERRIDDEN', 'Lead', leadId, { purpose, reason: reason.slice(0, 300) })
    return ok({ overridden: true })
  }

  return err('Unknown action')
})
