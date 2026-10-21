// Per-customer loan history: every loan the customer has taken, each weekly payment with the time it was recorded in the system,
// and the repayment score built from it (see lib/creditScore.ts). Access is decided here from the session.
import { getSupabase } from './supabase-db'
import { computeScore, type LoanInput } from './creditScore'
import { parseReview } from './reviews'
import type { Session } from '../types'

export class HistoryError extends Error {}

async function allowed(session: Session, customer: { guarantor_id: string | null; customer_id: string }, loanAgentIds: (string | null)[]): Promise<boolean> {
  if (session.role === 'Admin' || session.role === 'Staff') return true
  const sb = getSupabase()
  if (session.role === 'Guarantor') {
    const { data } = await sb.from('guarantors').select('guarantor_id').eq('user_id', session.userId).maybeSingle()
    return !!data && data.guarantor_id === customer.guarantor_id
  }
  if (session.role === 'NGF AGENT') {
    const { data } = await sb.from('agents').select('agent_id').eq('user_id', session.userId).maybeSingle()
    return !!data && loanAgentIds.includes(data.agent_id)
  }
  return false
}

export async function customerHistory(session: Session, customerId: string) {
  if (!customerId) throw new HistoryError('customerId required')
  const sb = getSupabase()
  const { data: customer, error: ce } = await sb.from('customers').select('customer_id, name, guarantor_id, phone').eq('customer_id', customerId).maybeSingle()
  if (ce) throw new Error(ce.message)
  if (!customer) throw new HistoryError('Customer not found')

  const { data: loans, error: le } = await sb.from('loans')
    .select('loan_id, loan_account_no, status, principal_amount, weekly_collection_amount, duration_weeks, start_date, end_date, assigned_agent_id, created_at')
    .eq('customer_id', customerId)
  if (le) throw new Error(le.message)
  if (!(await allowed(session, customer, (loans || []).map(l => l.assigned_agent_id)))) throw new Error('No permission')

  const loanIds = (loans || []).map(l => l.loan_id)
  const { data: reps, error: re } = loanIds.length
    ? await sb.from('repayments').select('repayment_id, loan_id, due_date, week_no, amount, status, paid_date, payment_mode, notes').in('loan_id', loanIds)
    : { data: [], error: null }
  if (re) throw new Error(re.message)
  const repIds = (reps || []).map(r => r.repayment_id)

  const [cols, lines] = await Promise.all([
    repIds.length ? sb.from('collections').select('repayment_id, agent_id, created_at, payment_date, payment_mode').in('repayment_id', repIds) : Promise.resolve({ data: [], error: null }),
    repIds.length ? sb.from('payment_lines').select('repayment_id, group_id').in('repayment_id', repIds) : Promise.resolve({ data: [], error: null }),
  ])
  if (cols.error) throw new Error(cols.error.message)
  if (lines.error) throw new Error(lines.error.message)

  const groupIds = Array.from(new Set((lines.data || []).map(l => l.group_id)))
  const userIds = Array.from(new Set((cols.data || []).map(c => c.agent_id).filter(Boolean) as string[]))
  const [groups, users] = await Promise.all([
    groupIds.length ? sb.from('payment_groups').select('group_id, utr, status, mode, total_amount').in('group_id', groupIds) : Promise.resolve({ data: [], error: null }),
    userIds.length ? sb.from('users').select('user_id, name').in('user_id', userIds) : Promise.resolve({ data: [], error: null }),
  ])
  const groupOf = new Map((groups.data || []).map(g => [g.group_id, g]))
  const lineOf = new Map((lines.data || []).map(l => [l.repayment_id, l.group_id]))
  const nameOf = new Map((users.data || []).map(u => [u.user_id, u.name]))
  // earliest collection row per repayment = when the payment was first recorded
  const colOf = new Map<string, { agent_id: string | null; created_at: string; payment_mode: string | null }>()
  for (const c of cols.data || []) {
    const prev = colOf.get(c.repayment_id)
    if (!prev || c.created_at < prev.created_at) colOf.set(c.repayment_id, c)
  }

  const inputs: LoanInput[] = (loans || []).map(l => ({
    loanId: l.loan_id, status: l.status, startDate: l.start_date || '', durationWeeks: Number(l.duration_weeks) || 0,
    weeks: (reps || []).filter(r => r.loan_id === l.loan_id).map(r => ({
      weekNo: Number(r.week_no) || 0, dueDate: r.due_date, amount: Number(r.amount) || 0, status: r.status,
      paidDate: r.paid_date || null, recordedAt: colOf.get(r.repayment_id)?.created_at || null, rating: parseReview(r.notes || '')?.rating || 0,
    })),
  }))
  const score = computeScore(inputs)

  // Attach loan details and per-week extras for display
  const loanMeta = new Map((loans || []).map(l => [l.loan_id, l]))
  const repByKey = new Map((reps || []).map(r => [`${r.loan_id}:${Number(r.week_no)}`, r]))
  const loansOut = score.loans.map(l => {
    const m = loanMeta.get(l.loanId)!
    return {
      ...l, loanAccountNo: m.loan_account_no, principal: Number(m.principal_amount) || 0, weekly: Number(m.weekly_collection_amount) || 0,
      endDate: m.end_date || '',
      weeks: l.weeks.map(w => {
        const r = repByKey.get(`${l.loanId}:${w.weekNo}`)
        const col = r ? colOf.get(r.repayment_id) : undefined
        const g = r ? groupOf.get(lineOf.get(r.repayment_id) || '') : undefined
        return {
          ...w, mode: r?.payment_mode || col?.payment_mode || '', notes: r?.notes || '',
          recordedBy: col?.agent_id ? nameOf.get(col.agent_id) || '' : '',
          utr: g?.utr || '', utrStatus: g?.status || '',
        }
      }),
    }
  }).reverse() // newest loan first

  return {
    customer: { customerId: customer.customer_id, name: customer.name },
    score: { value: score.value, max: score.max, band: score.band, completedLoans: score.completedLoans, onTimeRate: score.onTimeRate, inProgress: score.inProgress, parts: score.parts, reviews: score.reviews, rules: score.rules },
    loans: loansOut,
  }
}

/** NGF Score for many customers at once (customer lists). Same rules as the History tab. */
export async function bulkScores(customerIds: string[]): Promise<Map<string, { value: number; band: string; reviews: number; average: number | null }>> {
  const out = new Map<string, { value: number; band: string; reviews: number; average: number | null }>()
  if (!customerIds.length) return out
  const sb = getSupabase()
  const { data: loans } = await sb.from('loans').select('loan_id, customer_id, status, start_date, duration_weeks').in('customer_id', customerIds)
  const loanIds = (loans || []).map(l => l.loan_id)
  const { data: reps } = loanIds.length ? await sb.from('repayments').select('repayment_id, loan_id, due_date, week_no, amount, status, paid_date, notes').in('loan_id', loanIds) : { data: [] }
  const repIds = (reps || []).map(r => r.repayment_id)
  const { data: cols } = repIds.length ? await sb.from('collections').select('repayment_id, created_at').in('repayment_id', repIds) : { data: [] }
  const first = new Map<string, string>()
  for (const c of cols || []) { const p = first.get(c.repayment_id); if (!p || c.created_at < p) first.set(c.repayment_id, c.created_at) }
  for (const id of customerIds) {
    const inputs: LoanInput[] = (loans || []).filter(l => l.customer_id === id).map(l => ({
      loanId: l.loan_id, status: l.status, startDate: l.start_date || '', durationWeeks: Number(l.duration_weeks) || 0,
      weeks: (reps || []).filter(r => r.loan_id === l.loan_id).map(r => ({
        weekNo: Number(r.week_no) || 0, dueDate: r.due_date, amount: Number(r.amount) || 0, status: r.status,
        paidDate: r.paid_date || null, recordedAt: first.get(r.repayment_id) || null, rating: parseReview(r.notes || '')?.rating || 0,
      })),
    }))
    const sc = computeScore(inputs)
    out.set(id, { value: sc.value, band: sc.band, reviews: sc.reviews.count, average: sc.reviews.average })
  }
  return out
}
