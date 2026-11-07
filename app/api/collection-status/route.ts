import { NextRequest } from 'next/server'
import { apiHandler, getSession, ok, err } from '@/lib/api'
import { needFeature } from '@/lib/access'
import { coll } from '@/lib/features'
import { readTable, getSupabase, selectAll } from '@/lib/supabase-db'
import { getThisSaturday, getTodayIST } from '@/lib/dateUtils'
import { pageQuery, cleanSearch, scopeOf, withScope } from '@/lib/db'

// GET /api/collection-status?date=YYYY-MM-DD&status=paid|unpaid|cash&guarantorId=&q=&page=&pageSize=
// Paid and not paid customers for one collection Saturday, with totals. Read only: it changes nothing.
// Admin and Staff may pick a guarantor (Staff only among their branches' guarantors). A guarantor always gets
// their own customers: the guarantorId they send is ignored and no guarantor list is returned to them.
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))
// Any date -> the Saturday of its Monday-to-Sunday week (due dates are Saturdays)
const saturdayOf = (d: string) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7) + 5); return t.toISOString().slice(0, 10) }

export const GET = apiHandler(async (req: NextRequest) => {
  const session = await getSession(req)
  await needFeature(session, coll('collectionView'))
  const sp = new URL(req.url).searchParams
  const picker = session.role === 'Admin' || session.role === 'Staff'   // who may choose a guarantor
  const dateIn = sp.get('date') || ''
  const date = isDate(dateIn) ? saturdayOf(dateIn) : getThisSaturday()
  const st = sp.get('status')
  const status = st === 'paid' ? 'paid' : st === 'cash' ? 'cash' : 'unpaid'   // cash = the paid ones that were collected in cash
  const page = Math.max(1, Math.floor(Number(sp.get('page') || 1)) || 1)
  const pageSize = Math.min(200, Math.max(1, Math.floor(Number(sp.get('pageSize') || 50)) || 50))
  const text = cleanSearch(sp.get('q'))

  // Who may see which customers
  let scope = await scopeOf(session)
  let agentId = ''
  if (session.role === 'NGF AGENT') {
    const a = (await readTable('Agents')).find(x => x['User ID'] === session.userId)
    agentId = a?.['Agent ID'] || '__none__'
    scope = { kind: 'all' }
  }
  let guarantorFilter = ''
  const wanted = picker ? sp.get('guarantorId') || '' : ''
  if (wanted) {
    if (scope.kind === 'guarantors' && !scope.ids.includes(wanted)) return err('This guarantor belongs to another branch')
    guarantorFilter = wanted
  }
  const limit = guarantorFilter ? [guarantorFilter] : scope.kind === 'guarantors' ? scope.ids : scope.kind === 'none' ? ['__none__'] : null

  const filters = (qb: any) => {
    let q = withScope(qb, scope)
    if (agentId) q = q.eq('assigned_agent_id', agentId)
    if (guarantorFilter) q = q.eq('guarantor_id', guarantorFilter)
    q = q.eq('due_date', date)
    q = status === 'paid' ? q.eq('status', 'Paid') : status === 'cash' ? q.eq('status', 'Paid').ilike('payment_mode', 'cash') : q.neq('status', 'Paid')
    if (text) {
      // 4 digits = the last 4 digits of the loan id (the customer's code); otherwise name, mobile or loan id
      q = /^\d{4}$/.test(text) ? q.ilike('loan_id', `%${text}`) : q.or(`customer_name.ilike.%${text}%,customer_phone.ilike.%${text}%,loan_id.ilike.%${text}%`)
    }
    return q
  }
  const r = await pageQuery('RepaymentsEnriched', {
    filters, page, pageSize,
    order: [{ column: 'guarantor_name' }, { column: 'customer_name' }, { column: 'repayment_id' }],
  })
  const utrOf = (notes: string) => /UTR\s+([A-Za-z0-9]{6,40})/i.exec(notes || '')?.[1] || ''
  const rows = r.rows.map(x => ({
    repaymentId: x['Repayment ID'], name: x['Customer Name'] || '', code: String(x['Loan ID'] || '').slice(-4), phone: x['Customer Phone'] || '',
    amount: Number(x['Amount']) || 0, weekNo: Number(x['Week No']) || 0, guarantorName: x['Guarantor Name'] || '',
    paidDate: x['Paid Date'] || '', mode: x['Payment Mode'] || '', utr: utrOf(x['Notes'] || ''),
    overdue: x['Status'] !== 'Paid' && date < getTodayIST(),
  }))

  // Totals for the whole day (not just this page): everyone due, and who is still unpaid; paid is the difference
  const sb = getSupabase()
  const sum = async (unpaidOnly: boolean) => {
    const { data } = await sb.rpc('repayment_day_summary', { p_date: date, p_unpaid_only: unpaidOnly, p_guarantors: limit, p_agent: agentId || null })
    const s = (data && data[0]) || {}
    return { count: Number(s.customer_count || 0), total: Number(s.total_amount || 0) }
  }
  // Cash collected for the day: the paid customers whose payment mode is Cash
  const cashRows = selectAll('RepaymentsEnriched', qb => {
    let c = withScope(qb, scope)
    if (agentId) c = c.eq('assigned_agent_id', agentId)
    if (guarantorFilter) c = c.eq('guarantor_id', guarantorFilter)
    return c.eq('due_date', date).eq('status', 'Paid').ilike('payment_mode', 'cash')
  })
  const [all, unpaid, cash] = await Promise.all([sum(false), sum(true), cashRows])
  const summary = {
    dueCount: all.count, dueTotal: all.total,
    paidCount: Math.max(0, all.count - unpaid.count), paidTotal: Math.max(0, all.total - unpaid.total),
    unpaidCount: unpaid.count, unpaidTotal: unpaid.total,
    cashCount: cash.length, cashTotal: cash.reduce((t, x) => t + (Number(x['Amount']) || 0), 0),
  }

  // The guarantor list for the dropdown: Admin and Staff only
  let guarantors: { guarantorId: string; name: string; code: string }[] = []
  if (picker) {
    guarantors = (await readTable('Guarantors')).filter(g => g['Status'] !== 'Inactive' && (scope.kind !== 'guarantors' || scope.ids.includes(g['Guarantor ID'])))
      .map(g => ({ guarantorId: g['Guarantor ID'], name: g['Name'], code: g['Code'] || '' })).sort((a, b) => a.name.localeCompare(b.name))
  }
  return ok({ date, status, rows, summary, guarantors, page: r.page, pageSize: r.pageSize, total: r.total, totalPages: r.totalPages })
})
