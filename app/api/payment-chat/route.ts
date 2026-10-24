import { NextRequest } from 'next/server'
import { apiHandler, getSession, ok, err } from '@/lib/api'
import { getAccess, PaymentError } from '@/lib/payments'
import { listMessages, submitSlip, postNote, approveMessage, slipSettings, saveSlipSettings, slipUsage } from '@/lib/paymentChat'
import { createAuditLogger } from '@/lib/audit'

// Payment Chat (screenshots sent by guarantors). The customer list for the search box comes from /api/payments?view=collect.
export const GET = apiHandler(async (req: NextRequest) => {
  const session = await getSession(req)
  const access = await getAccess(session)
  const sp = new URL(req.url).searchParams
  const view = sp.get('view') || 'messages'
  try {
    if (view === 'messages') return ok(await listMessages(session, access, sp.get('guarantorId') || ''))
    if (view === 'settings') { if (!access.isAdmin) return err('Only an Admin can see this', 403); return ok({ settings: await slipSettings(), usage: await slipUsage(access) }) }
    return err('Unknown view')
  } catch (e) {
    if (e instanceof PaymentError) return err(e.message)
    throw e
  }
})

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await getSession(req)
  const access = await getAccess(session)
  const body = await req.json().catch(() => ({}))
  const audit = createAuditLogger(req, session)
  try {
    switch (body.action) {
      case 'submit': {
        const msg = await submitSlip(session, access, { guarantorId: body.guarantorId, mode: body.mode, repaymentIds: body.repaymentIds, messageId: body.messageId, image: body.image, manualUtr: body.manualUtr })
        await audit.log('PAYMENT_CHAT_SUBMIT', 'PaymentChat', msg.messageId, { status: msg.status, amount: msg.amountRead, utr: msg.utr, customers: msg.lines.length })
        return ok({ message: msg })
      }
      case 'note': await postNote(session, access, String(body.guarantorId || ''), String(body.text || ''), body.parentId); return ok({ success: true })
      case 'approve': {
        await approveMessage(session, access, String(body.messageId || ''), String(body.utr || ''))
        await audit.log('PAYMENT_CHAT_APPROVE', 'PaymentChat', String(body.messageId), {})
        return ok({ success: true })
      }
      case 'settings': {
        const settings = await saveSlipSettings(access, { enabled: body.enabled, dailyCap: body.dailyCap, guarantorCap: body.guarantorCap, payee: body.payee })
        await audit.log('PAYMENT_CHAT_SETTINGS', 'PaymentChat', 'settings', { enabled: settings.enabled, dailyCap: settings.dailyCap, guarantorCap: settings.guarantorCap })
        return ok({ settings })
      }
      default: return err('Unknown action')
    }
  } catch (e) {
    if (e instanceof PaymentError) return err(e.message)
    throw e
  }
})
