import { NextRequest } from 'next/server'
import { apiHandler, getSession, ok, err } from '@/lib/api'
import { getTodayIST, getThisSaturday } from '@/lib/dateUtils'
import {
  getAccess, need, PaymentError, listGuarantors, collectSheet, lookupUtr, records, markPayment, editUtr, overrideGroup,
  discardGroup, uploadBank, bankReport,
} from '@/lib/payments'
import { createAuditLogger } from '@/lib/audit'

// Payment matching. Access is decided in lib/payments.ts from the session, never from the request body.
export const GET = apiHandler(async (req: NextRequest) => {
  const session = await getSession(req)
  const access = await getAccess(session)
  need(access.canView)
  const sp = new URL(req.url).searchParams
  const view = sp.get('view') || 'me'
  const date = sp.get('date') || getThisSaturday()

  try {
    if (view === 'me') {
      return ok({
        today: getTodayIST(), saturday: getThisSaturday(),
        access: { canMark: access.canMark, canBank: access.canBank, canOverride: access.canOverride, isGuarantor: access.isGuarantor, isAdmin: access.isAdmin, guarantorId: access.guarantorId },
        guarantors: access.isGuarantor ? [] : await listGuarantors(),
      })
    }
    if (view === 'collect') { need(access.canMark); return ok(await collectSheet(sp.get('guarantorId') || '', date)) }
    if (view === 'utr') { need(access.canMark); return ok(await lookupUtr(sp.get('utr') || '', access)) }
    if (view === 'records') return ok(await records(access, sp.get('guarantorId') || '', date))
    if (view === 'bank') return ok(await bankReport(access))
    return err('Unknown view')
  } catch (e) {
    if (e instanceof PaymentError) return err(e.message)
    throw e
  }
})

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await getSession(req)
  const access = await getAccess(session)
  need(access.canView)
  const body = await req.json()
  const audit = createAuditLogger(req, session)

  try {
    switch (body.action) {
      case 'mark': {
        const r = await markPayment(session, access, body)
        await audit.log(r.flagged ? 'PAYMENT_FLAGGED' : 'PAYMENT_MARKED', 'PaymentGroup', r.group.groupId, { utr: r.group.utr, total: r.group.total, mode: r.group.mode })
        return ok(r)
      }
      case 'editUtr': {
        const r = await editUtr(session, access, String(body.groupId || ''), body.utr)
        await audit.log('PAYMENT_UTR_EDITED', 'PaymentGroup', r.group.groupId, { utr: r.group.utr })
        return ok(r)
      }
      case 'override': {
        const r = await overrideGroup(session, access, String(body.groupId || ''), body.reason)
        await audit.log('PAYMENT_OVERRIDDEN', 'PaymentGroup', r.group.groupId, { utr: r.group.utr, reason: body.reason })
        return ok(r)
      }
      case 'discard': {
        const r = await discardGroup(session, access, String(body.groupId || ''))
        await audit.log('PAYMENT_DISCARDED', 'PaymentGroup', String(body.groupId || ''), {})
        return ok(r)
      }
      case 'bankUpload': {
        const r = await uploadBank(session, access, body.rows, String(body.fileName || ''))
        await audit.log('BANK_STATEMENT_UPLOADED', 'BankTransactions', String(body.fileName || ''), r)
        return ok(r)
      }
      default:
        return err('Unknown action')
    }
  } catch (e) {
    if (e instanceof PaymentError) return err(e.message)
    throw e
  }
})
