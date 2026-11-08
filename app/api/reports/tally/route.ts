import { NextRequest } from 'next/server'
import { apiHandler, ok, err } from '@/lib/api'
import { requireFeature } from '@/lib/access'
import { getSupabase, readTable } from '@/lib/supabase-db'
import { scopeOf } from '@/lib/db'
import { getThisSaturday } from '@/lib/dateUtils'

// GET /api/reports/tally?date=YYYY-MM-DD[&guarantorId=]
// The accountant's summary for one collection Saturday, to enter in Tally: every recorded payment with the customer, the 4-digit code,
// the transaction id and (from the uploaded bank statement) the name the bank shows for that transaction id.
// Two statements, kept apart: `upi` (UPI / Bank payments, have a transaction id) and `cash` (Cash, Cheque, Other). Read only.
// Admin sees everyone; Staff only their branches' guarantors.
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))
const istDay = (iso: string) => new Date(new Date(iso).getTime() + 5.5 * 3600_000).toISOString().slice(0, 10)

type Row = {
  guarantorId: string; guarantor: string; guarantorCode: string; customer: string; code: string; amount: number; mode: string
  utr: string; paidDate: string; bankName: string; bankCheck: string; bankAmount: number | null; markedBy: string
}

export const GET = apiHandler(async (req: NextRequest) => {
  const session = await requireFeature(req, ['reports'])
  const sp = new URL(req.url).searchParams
  const dIn = sp.get('date') || ''
  const date = isDate(dIn) ? dIn : getThisSaturday()
  const wanted = (sp.get('guarantorId') || '').trim()
  const scope = await scopeOf(session)
  if (scope.kind === 'none') return ok({ date, upi: [], cash: [], guarantors: [], hasBankStatement: false, totals: { upi: 0, cash: 0 } })
  if (wanted && scope.kind === 'guarantors' && !scope.ids.includes(wanted)) return err('This guarantor belongs to another branch')

  const pick = readTable('Guarantors').then(rs => rs.filter(g => g['Status'] !== 'Inactive' && (scope.kind !== 'guarantors' || scope.ids.includes(g['Guarantor ID'])))
    .map(g => ({ guarantorId: g['Guarantor ID'], name: g['Name'], code: g['Code'] || '' })).sort((a, b) => a.name.localeCompare(b.name)))   // for the dropdown
  const sb = getSupabase()
  // The chosen Saturday = the customers whose week was DUE that day (payments recorded a day or two late still count; old weeks paid
  // later appear under their own due Saturday). Payment lines carry the due date; their group carries the mode, transaction id and status.
  let lq = sb.from('payment_lines').select('group_id, loan_id, customer_id, guarantor_id, amount').eq('due_date', date)
  if (wanted) lq = lq.eq('guarantor_id', wanted)
  else if (scope.kind === 'guarantors') lq = lq.in('guarantor_id', scope.ids)
  const { data: allLines, error: le } = await lq.limit(20000)
  if (le) return err(`Could not read payments: ${le.message}`)
  const lineGroupIds = Array.from(new Set((allLines || []).map(l => l.group_id)))
  const { data: groups, error: ge } = lineGroupIds.length
    ? await sb.from('payment_groups').select('group_id, guarantor_id, mode, utr, total_amount, created_at, marked_by_name, status').in('group_id', lineGroupIds).in('status', ['Verified', 'Overridden'])
    : { data: [] as any[], error: null }
  if (ge) return err(`Could not read payments: ${ge.message}`)
  const gs = groups || []
  if (!gs.length) {
    const { count } = await sb.from('bank_transactions').select('id', { count: 'exact', head: true })
    return ok({ date, upi: [], cash: [], guarantors: await pick, hasBankStatement: (count || 0) > 0, totals: { upi: 0, cash: 0 } })
  }

  const utrs = Array.from(new Set(gs.map(g => g.utr).filter(Boolean))) as string[]
  const [bankR, bankCountR, guarR, chatR] = await Promise.all([
    utrs.length ? sb.from('bank_transactions').select('utr, amount, payer').in('utr', utrs) : Promise.resolve({ data: [] as any[], error: null }),
    sb.from('bank_transactions').select('id', { count: 'exact', head: true }),
    sb.from('guarantors').select('guarantor_id, name, code').in('guarantor_id', Array.from(new Set(gs.map(g => g.guarantor_id).filter(Boolean))) as string[]),
    // the date on the payment screenshot (the real payment day); entries made through the chat carry it
    sb.from('payment_chat').select('group_id, txn_date').in('group_id', gs.map(g => g.group_id)),
  ])
  const lines = allLines || []   // lines whose payment is not Verified are skipped below
  const custIds = Array.from(new Set(lines.map(l => l.customer_id).filter(Boolean))) as string[]
  const { data: custs } = custIds.length ? await sb.from('customers').select('customer_id, name').in('customer_id', custIds) : { data: [] as any[] }
  const custName = new Map((custs || []).map((c: any) => [c.customer_id, c.name as string]))
  const guar = new Map((guarR.data || []).map((g: any) => [g.guarantor_id, g]))
  const bank = new Map<string, { amount: number; payer: string }>((bankR.data || []).map((b: any) => [b.utr, { amount: Number(b.amount), payer: b.payer || '' }]))
  const hasBank = (bankCountR.count || 0) > 0
  const slipDate = new Map<string, string>()
  for (const c of (chatR.data || []) as any[]) if (c.group_id && c.txn_date && !slipDate.has(c.group_id)) slipDate.set(c.group_id, String(c.txn_date).slice(0, 10))
  const byGroup = new Map(gs.map(g => [g.group_id, g]))

  const upi: Row[] = [], cash: Row[] = []
  for (const l of lines) {
    const g = byGroup.get(l.group_id)
    if (!g) continue
    const gu: any = guar.get(l.guarantor_id || g.guarantor_id) || {}
    const isUtr = (g.mode === 'UPI' || g.mode === 'Bank') && g.utr
    const b = isUtr ? bank.get(g.utr as string) : undefined
    const bankCheck = !isUtr ? '' : b ? (b.amount === Number(g.total_amount) ? 'Matched' : 'Amount differs') : hasBank ? 'Not in statement' : 'No statement uploaded'
    const row: Row = {
      guarantorId: l.guarantor_id || g.guarantor_id || '', guarantor: gu.name || '', guarantorCode: gu.code || '',
      customer: custName.get(l.customer_id) || '', code: String(l.loan_id || '').slice(-4), amount: Number(l.amount) || 0, mode: g.mode,
      utr: g.utr || '', paidDate: slipDate.get(g.group_id) || istDay(g.created_at), bankName: b?.payer || '', bankCheck, bankAmount: b ? b.amount : null, markedBy: g.marked_by_name || '',
    }
    ;(isUtr ? upi : cash).push(row)
  }
  const order = (a: Row, b: Row) => a.guarantor.localeCompare(b.guarantor) || a.customer.localeCompare(b.customer)
  upi.sort(order); cash.sort(order)
  const guarantors = await pick
  const sum = (rs: Row[]) => rs.reduce((t, r) => t + r.amount, 0)
  return ok({ date, upi, cash, guarantors, hasBankStatement: hasBank, totals: { upi: sum(upi), cash: sum(cash) } })
})
