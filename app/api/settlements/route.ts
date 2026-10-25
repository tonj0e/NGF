import { NextRequest } from 'next/server'
import { apiHandler, requireRole, ok, err } from '@/lib/api'
import { requireFeature } from '@/lib/access'
import { readTable, appendRow, updateById, getRowById, countRows, makeId, nowIso, invalidateCache } from '@/lib/supabase-db'
import { pageQuery, byIds, cleanSearch, scopeOf } from '@/lib/db'
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

// GET /api/settlements
//   ?saturday=DATE                 settlement records of one Saturday
//   ?entityId=ID&page=&pageSize=   one guarantor's settlement history, newest first
//   ?guarantorList=1&q=&page=      guarantors you may open the history of (name or code search)
export const GET = apiHandler(async (req: NextRequest) => {
  const session = await requireFeature(req, ['settlements'])
  const sp = new URL(req.url).searchParams
  const saturday = sp.get('saturday') || ''
  const entityId = sp.get('entityId') || ''
  const scope = await staffEntityScope(session)

  if (sp.get('guarantorList') === '1') {
    const sc = await scopeOf(session)
    const text = cleanSearch(sp.get('q'))
    const r = await pageQuery('Guarantors', {
      filters: qb => (sc.kind === 'guarantors' ? qb.in('guarantor_id', sc.ids) : sc.kind === 'none' ? qb.in('guarantor_id', ['__none__']) : qb),
      search: { columns: ['name', 'code'], text }, order: [{ column: 'name' }, { column: 'guarantor_id' }],
      page: sp.get('page') || 1, pageSize: sp.get('pageSize') || 50,
    })
    return ok({
      guarantors: r.rows.map(g => ({ guarantorId: g['Guarantor ID'], name: g['Name'], code: g['Code'], phone: g['Phone'] || '' })),
      total: r.total, page: r.page, pageSize: r.pageSize, totalPages: r.totalPages,
    })
  }

  // a Staff user only reads settlements of people in their own branches
  // Staff read one guarantor or agent at a time (the summary endpoint serves the per-Saturday overview)
  if (scope && (!entityId || !scope.ids.has(entityId))) return ok({ settlements: [], total: 0, page: 1, pageSize: 0, totalPages: 1 })
  const r = await pageQuery('Settlements', {
    filters: qb => {
      let q = qb
      if (saturday) q = q.eq('saturday_date', saturday)
      if (entityId) q = q.eq('entity_id', entityId)
      return q
    },
    order: [{ column: 'saturday_date', ascending: false }, { column: 'settlement_id' }],
    page: sp.get('page') || 1, pageSize: sp.get('pageSize') || 200,
  })
  const guarantors = await byIds('Guarantors', 'guarantor_id', r.rows.filter(s => s['Entity Type'] === 'Guarantor').map(s => s['Entity ID']))
  const phone = new Map(guarantors.map(g => [g['Guarantor ID'], g['Phone'] || '']))
  const enriched = r.rows.map(s => ({ ...s, entityPhone: s['Entity Type'] === 'Guarantor' ? phone.get(s['Entity ID']) || '' : '' }))
  return ok({ settlements: enriched, total: r.total, page: r.page, pageSize: r.pageSize, totalPages: r.totalPages })
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
      const dupes = await countRows('Settlements', qb => qb.eq('entity_id', entityId).ilike('notes', `%${payoutIdMatch[0]}%`))
      if (dupes > 0) return err('Payout already recorded for this QR')
    }
  }

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

  const s = await getRowById('Settlements', String(settlementId))
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
