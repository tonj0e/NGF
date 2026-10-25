import { NextRequest } from 'next/server'
import { apiHandler, requireRole, ok, err } from '@/lib/api'
import { requireFeature } from '@/lib/access'
import { readTable, appendRow, updateById, findRecord, makeId, nowIso, invalidateCache } from '@/lib/supabase-db'
import { getTodayIST } from '@/lib/dateUtils'
import { getBranchAccess, canSeeBranch, guarantorBranchMap, type BranchAccess } from '@/lib/branchAccess'

// Staff may only handle settlements of guarantors and agents in their own branches. Returns null for Admin (no limit).
async function staffEntityScope(session: { userId: string; role: string }): Promise<{ access: BranchAccess; ids: Set<string> } | null> {
  if (session.role !== 'Staff') return null
  const [access, gMap, agents] = await Promise.all([getBranchAccess(session as any), guarantorBranchMap(), readTable('Agents', { forceFresh: true })])
  const ids = new Set<string>()
  for (const [gid, b] of gMap) if (canSeeBranch(access, b)) ids.add(gid)
  for (const a of agents) if (canSeeBranch(access, String(a['Branch ID'] || ''))) ids.add(a['Agent ID'])
  return { access, ids }
}

export const GET = apiHandler(async (req: NextRequest) => {
  const session = await requireFeature(req, ['settlements'])
  const { searchParams } = new URL(req.url)
  const saturday = searchParams.get('saturday') || ''

  const [settlements, guarantors] = await Promise.all([
    readTable('Settlements', { forceFresh: true }), readTable('Guarantors', { forceFresh: true }),
  ])

  let rows = settlements
  if (saturday) rows = rows.filter(s => s['Saturday Date'] === saturday)
  const scope = await staffEntityScope(session)
  if (scope) rows = rows.filter(s => scope.ids.has(s['Entity ID']))

  const enriched = rows.map(s => {
    const g = s['Entity Type'] === 'Guarantor'
      ? guarantors.find(g => g['Guarantor ID'] === s['Entity ID'])
      : null
    return { ...s, entityPhone: g?.['Phone'] || '' }
  })

  return ok({ settlements: enriched })
})

export const POST = apiHandler(async (req: NextRequest) => {
  await requireFeature(req, ['settlements'])
  const body = await req.json()
  const { entityType, entityId, entityName, saturdayDate, notes } = body
  const session = await requireFeature(req, ['settlements'])
  // Amounts must be real, non-negative numbers; the recorder is always the signed-in user
  const money = (v: unknown) => { const n = Number(v ?? 0); return Number.isFinite(n) && n >= 0 && n < 1e9 ? n : NaN }
  const totalCashDue = money(body.totalCashDue), totalUpiDue = money(body.totalUpiDue), amountSubmitted = money(body.amountSubmitted)
  if ([totalCashDue, totalUpiDue, amountSubmitted].some(Number.isNaN)) return err('Amounts must be valid numbers')
  const recordedBy = session.userId

  if (!entityId || !saturdayDate) return err('entityId and saturdayDate required')
  const scope = await staffEntityScope(session)
  if (scope && !scope.ids.has(entityId)) return err('This settlement belongs to another branch', 403)

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
  const session = await requireFeature(req, ['settlements'])
  const { settlementId, amountSubmitted, notes } = await req.json()
  if (!settlementId) return err('settlementId required')

  const settlements = await readTable('Settlements', { forceFresh: true })
  const s = findRecord(settlements, 'Settlement ID', settlementId)
  if (!s) return err('Settlement not found')
  const scope = await staffEntityScope(session)
  if (scope && !scope.ids.has(s['Entity ID'])) return err('This settlement belongs to another branch', 403)

  const submitted = Number(amountSubmitted ?? 0)
  if (!Number.isFinite(submitted) || submitted < 0 || submitted >= 1e9) return err('Amount must be a valid number')
  const cashDue = Number(s['Total Cash Due']) || 0
  const newBalance = cashDue - submitted

  await updateById('Settlements', settlementId, {
    'Amount Submitted': String(submitted),
    'Balance': String(Math.max(0, newBalance)),
    'Status': newBalance <= 0 ? 'Settled' : 'Partial',
    'Notes': notes || s['Notes'],
  })
  invalidateCache('Settlements')

  return ok({ success: true })
})
