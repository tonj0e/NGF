import { NextRequest } from 'next/server'
import { apiHandler, getSession, ok, err } from '@/lib/api'
import { csrfProtection } from '@/lib/csrf'
import { createAuditLogger } from '@/lib/audit'
import { searchForLinks, createLink, LinkError } from '@/lib/paymentLinks'

const ROLES = ['Admin', 'Staff', 'Guarantor']

// Search a customer by the 4-digit pay code (or name / phone) and see what is due
export const GET = apiHandler(async (req: NextRequest) => {
  const session = await getSession(req)
  if (!ROLES.includes(session.role)) return err('No permission', 403)
  try { return ok(await searchForLinks(session, new URL(req.url).searchParams.get('q') || '')) }
  catch (e) { if (e instanceof LinkError) return err(e.message); throw e }
})

// Create (or reuse) a payment link for the weeks due, or for closing the loan
export const POST = apiHandler(async (req: NextRequest) => {
  const session = await getSession(req)
  if (!ROLES.includes(session.role)) return err('No permission', 403)
  const csrfError = csrfProtection(req, session.userId)
  if (csrfError) return csrfError
  const b = await req.json().catch(() => ({}))
  if (!b.loanId || (b.kind !== 'weeks' && b.kind !== 'closure')) return err('loanId and kind (weeks or closure) required')
  try {
    const link = await createLink(session, { loanId: String(b.loanId), kind: b.kind, repaymentIds: Array.isArray(b.repaymentIds) ? b.repaymentIds.map(String) : undefined, closureMode: b.closureMode === 'hold' || b.closureMode === 'permanent' ? b.closureMode : undefined, reason: typeof b.reason === 'string' ? b.reason : undefined })
    await createAuditLogger(req, session).log('PAYMENT_LINK_CREATED', 'PaymentLink', link.linkId, { loanId: link.loanId, kind: link.kind, total: link.total })
    return ok(link)
  } catch (e) { if (e instanceof LinkError) return err(e.message); throw e }
})
