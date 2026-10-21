import { getSupabase, makeId, nowIso, invalidateCache } from './supabase-db'

// The customer-side bookkeeping of an early closure, shared by the cash route (app/api/loans/close) and the payment-link webhook.
// The loan itself becomes Completed when every week is Paid (done by the caller / applyGroup).
export async function finalizeClosure(p: {
  loanId: string; customerId: string; mode: 'hold' | 'permanent'; weeksRemaining: number; amountCollected: number
  paymentMode: string | null; endDate: string; reason: string; closedBy: string
}) {
  const sb = getSupabase()
  const holdUntil = p.mode === 'hold' ? String(p.endDate).slice(0, 10) : null
  const patch: Record<string, unknown> = { active_loan_id: '', hold_until: holdUntil, updated_at: nowIso() }
  if (p.mode === 'permanent') { patch.permanent_block = true; patch.block_reason = p.reason.slice(0, 300) }
  const { error } = await sb.from('customers').update(patch).eq('customer_id', p.customerId)
  if (error) throw new Error(error.message)
  const { error: e2 } = await sb.from('loan_closures').insert({
    closure_id: makeId('CLS'), loan_id: p.loanId, customer_id: p.customerId, mode: p.mode, weeks_remaining: p.weeksRemaining,
    amount_collected: p.amountCollected, payment_mode: p.paymentMode, hold_until: holdUntil, reason: p.reason || null, closed_by: p.closedBy,
  })
  if (e2) throw new Error(e2.message)
  invalidateCache('Customers')
  return { holdUntil }
}
