import { NextRequest } from 'next/server'
import { apiHandler, requireRole, ok, err } from '@/lib/api'
import { readTable, appendRow, updateById, findRecord, makeId, nowIso, invalidateCache } from '@/lib/supabase-db'
import { getTodayIST } from '@/lib/dateUtils'

export const GET = apiHandler(async (req: NextRequest) => {
  await requireRole(req, ['Admin', 'Staff'])
  const { searchParams } = new URL(req.url)
  const saturday = searchParams.get('saturday') || ''

  const [settlements, guarantors] = await Promise.all([
    readTable('Settlements', { forceFresh: true }), readTable('Guarantors', { forceFresh: true }),
  ])

  let rows = settlements
  if (saturday) rows = rows.filter(s => s['Saturday Date'] === saturday)

  const enriched = rows.map(s => {
    const g = s['Entity Type'] === 'Guarantor'
      ? guarantors.find(g => g['Guarantor ID'] === s['Entity ID'])
      : null
    return { ...s, entityPhone: g?.['Phone'] || '' }
  })

  return ok({ settlements: enriched })
})

export const POST = apiHandler(async (req: NextRequest) => {
  await requireRole(req, ['Admin', 'Staff'])
  const body = await req.json()
  const { entityType, entityId, entityName, saturdayDate, notes } = body
  const session = await requireRole(req, ['Admin', 'Staff'])
  // Amounts must be real, non-negative numbers; the recorder is always the signed-in user
  const money = (v: unknown) => { const n = Number(v ?? 0); return Number.isFinite(n) && n >= 0 && n < 1e9 ? n : NaN }
  const totalCashDue = money(body.totalCashDue), totalUpiDue = money(body.totalUpiDue), amountSubmitted = money(body.amountSubmitted)
  if ([totalCashDue, totalUpiDue, amountSubmitted].some(Number.isNaN)) return err('Amounts must be valid numbers')
  const recordedBy = session.userId

  if (!entityId || !saturdayDate) return err('entityId and saturdayDate required')

  // Prevent duplicate QR payout settlements for the same payout ID
  if (notes && notes.includes('QR Payout')) {
    const payoutIdMatch = notes.match(/PYOUT\d+/)
    if (payoutIdMatch) {
      const existing = await readTable('Settlements', { forceFresh: true })
      const dupe = existing.find(s => s['Notes']?.includes(payoutIdMatch[0]) && s['Entity ID'] === entityId)
      if (dupe) return err('Payout already recorded for this QR')
    }
  }

  const [collections, repayments, loans] = await Promise.all([
    readTable('Collections', { forceFresh: true }), readTable('Repayments', { forceFresh: true }), readTable('Loans', { forceFresh: true }),
  ])

  // Exclude Closed/Completed loans from settlement calculations (per business logic in settlements/due)
  const inactiveLoanIds = new Set(
    loans.filter(l => l['Status'] === 'Closed' || l['Status'] === 'Completed').map(l => l['Loan ID'])
  )

  const today = getTodayIST()

  const settlementId = makeId('STL')
  await appendRow('Settlements', {
    'Settlement ID': settlementId,
    'Entity Type': entityType || 'GuarantorCommission',
    'Entity ID': entityId,
    'Entity Name': entityName || '',
    'Settlement Date': today,
    'Saturday Date': saturdayDate,
    'Total Cash Due': String(totalCashDue || 0),
    'Total UPI Due': String(totalUpiDue || 0),
    'Amount Submitted': String(amountSubmitted || 0),
    'Balance': String(Math.max(0, (totalCashDue || 0) - (amountSubmitted || 0))),
    'Status': (amountSubmitted || 0) >= (totalCashDue || 0) ? 'Settled' : 'Partial',
    'Notes': notes || '',
    'Recorded By': recordedBy || '',
    'Created At': nowIso(),
  })

  return ok({ success: true, settlementId })
})

export const PATCH = apiHandler(async (req: NextRequest) => {
  await requireRole(req, ['Admin', 'Staff'])
  const { settlementId, amountSubmitted, notes } = await req.json()
  if (!settlementId) return err('settlementId required')

  const settlements = await readTable('Settlements', { forceFresh: true })
  const s = findRecord(settlements, 'Settlement ID', settlementId)
  if (!s) return err('Settlement not found')

  const cashDue = Number(s['Total Cash Due']) || 0
  const newBalance = cashDue - (amountSubmitted || 0)

  await updateById('Settlements', settlementId, {
    'Amount Submitted': String(amountSubmitted || 0),
    'Balance': String(newBalance),
    'Status': newBalance <= 0 ? 'Settled' : 'Partial',
    'Notes': notes || s['Notes'],
  })
  invalidateCache('Settlements')

  return ok({ success: true })
})
