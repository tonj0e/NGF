// Online repayment links: search a customer by the 4-digit pay code, make a link for the weeks due (or for the whole balance to
// close the loan), show it as WhatsApp text / QR, and settle it when the gateway's webhook confirms the money.
// All amounts are computed here on the server; the browser never sends an amount.
import QRCode from 'qrcode'
import { getSupabase, readTable, makeId, nowIso, invalidateCache } from './supabase-db'
import { getGateway, type GatewayEvent } from './gateway'
import { recordGatewayPayment } from './payments'
import { finalizeClosure } from './loanClosure'
import { notifyRole, notifyUser } from './notifications'
import { getThisSaturday } from './dateUtils'
import { normalizeIndianMobile } from './phone'
import { payCodeFromLoanId } from './payCode'
import { getBranchAccess, branchOfGuarantor, canApproveIn } from './branchAccess'
import { rateLimitKey } from './rate-limiter'
import type { Session } from '../types'

export const LINK_TTL_MS = 48 * 3600_000
export class LinkError extends Error {}

const money = (n: number) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
const niceDate = (ymd: string) => { const d = new Date(String(ymd).slice(0, 10) + 'T00:00:00'); return isNaN(d.getTime()) ? ymd : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) }

// ---------- fee (set in Dev > Payments) ----------
export async function getFeePercent(): Promise<number> {
  const rows = await readTable('Settings', { forceFresh: true })
  const n = Number(rows.find(r => r['Key'] === 'gateway:feePercent')?.['Value'])
  return Number.isFinite(n) ? Math.min(10, Math.max(0, n)) : 0
}
export function withFee(base: number, pct: number) {
  const fee = Math.round(base * pct) / 100           // base * pct is the fee in paise
  return { fee, total: Math.round((base + fee) * 100) / 100 }
}

// ---------- who may act on which loan ----------
async function loanAccess(session: Session, loan: { guarantor_id: string | null }) {
  if (session.role === 'Admin') return { allowed: true, canClose: true }
  if (session.role === 'Guarantor') {
    const g = (await readTable('Guarantors', { forceFresh: true })).find(x => x['User ID'] === session.userId)
    return { allowed: !!g && loan.guarantor_id === g['Guarantor ID'], canClose: false }   // guarantors send weekly links only
  }
  if (session.role === 'Staff') {
    const ok = canApproveIn(await getBranchAccess(session), await branchOfGuarantor(loan.guarantor_id || ''))
    return { allowed: ok, canClose: ok }
  }
  return { allowed: false, canClose: false }
}

type LoanRow = { loan_id: string; customer_id: string; guarantor_id: string | null; status: string; end_date: string; weekly_collection_amount: number }
type RepRow = { repayment_id: string; loan_id: string; week_no: number; due_date: string; amount: number; status: string }
type LinkRow = {
  link_id: string; kind: 'weeks' | 'closure'; loan_id: string; customer_id: string; guarantor_id: string | null; repayment_ids: string[]
  base_amount: number; fee_percent: number; fee_amount: number; total_amount: number; closure_mode: 'hold' | 'permanent' | null; closure_reason: string | null
  status: string; provider: string; provider_ref: string | null; short_url: string | null; gateway_payment_id: string | null; payment_method: string | null
  expires_at: string; paid_at: string | null; error_text: string | null; created_by: string; created_by_name: string | null; created_at: string
}

async function expireOld() {
  await getSupabase().from('payment_links').update({ status: 'Expired' }).eq('status', 'Created').lt('expires_at', new Date().toISOString())
}

// ---------- search by pay code ----------
export async function searchForLinks(session: Session, qRaw: string) {
  const q = String(qRaw || '').trim().toLowerCase()
  if (q.length < 3) throw new LinkError('Type the 4-digit code (or at least 3 letters of the name)')
  await expireOld()
  const sb = getSupabase()
  const [loansRes, customers, guarantors] = await Promise.all([
    sb.from('loans').select('loan_id, customer_id, guarantor_id, status, end_date, weekly_collection_amount').eq('status', 'Active'),
    readTable('Customers', { forceFresh: true }), readTable('Guarantors'),
  ])
  const loans = (loansRes.data || []) as LoanRow[]
  const byCode = /^\d{4}$/.test(q)
  const matched: LoanRow[] = []
  for (const l of loans) {
    const c = customers.find(x => x['Customer ID'] === l.customer_id)
    const hit = byCode ? payCodeFromLoanId(l.loan_id) === q : (c?.['Name'] || '').toLowerCase().includes(q) || String(c?.['Phone'] || '').includes(q) || l.loan_id.toLowerCase().includes(q)
    if (!hit) continue
    if (!(await loanAccess(session, l)).allowed) continue
    matched.push(l)
    if (matched.length >= 10) break
  }
  if (!matched.length) return { items: [], feePercent: await getFeePercent() }
  const ids = matched.map(l => l.loan_id)
  const [repsRes, linesRes, linksRes, feePercent] = await Promise.all([
    sb.from('repayments').select('repayment_id, loan_id, week_no, due_date, amount, status').in('loan_id', ids),
    sb.from('payment_lines').select('repayment_id'),
    sb.from('payment_links').select('*').in('loan_id', ids).eq('status', 'Created'),
    getFeePercent(),
  ])
  const reps = (repsRes.data || []) as RepRow[]
  const marked = new Set((linesRes.data || []).map(x => x.repayment_id as string))
  const saturday = getThisSaturday()
  const items = []
  for (const l of matched) {
    const c = customers.find(x => x['Customer ID'] === l.customer_id)
    const g = guarantors.find(x => x['Guarantor ID'] === l.guarantor_id)
    const unpaid = reps.filter(r => r.loan_id === l.loan_id && r.status !== 'Paid' && r.status !== 'Waived').sort((a, b) => a.week_no - b.week_no)
    const due = unpaid.filter(r => r.due_date <= saturday && !marked.has(r.repayment_id))
    const dueBase = due.reduce((s, r) => s + Number(r.amount), 0)
    const remBase = unpaid.reduce((s, r) => s + Number(r.amount), 0)
    const open = ((linksRes.data || []) as LinkRow[]).filter(k => k.loan_id === l.loan_id)
    items.push({
      loanId: l.loan_id, payCode: payCodeFromLoanId(l.loan_id), customerName: c?.['Name'] || '', phone: c?.['Phone'] || '',
      guarantorCode: g?.['Code'] || '', guarantorName: g?.['Name'] || '', endDate: String(l.end_date).slice(0, 10),
      due: due.map(r => ({ repaymentId: r.repayment_id, weekNo: r.week_no, dueDate: r.due_date, amount: Number(r.amount), overdue: r.due_date < new Date().toISOString().slice(0, 10) })),
      dueBase, dueFee: withFee(dueBase, feePercent).fee, dueTotal: withFee(dueBase, feePercent).total,
      remainingWeeks: unpaid.length, remainingBase: remBase, remainingFee: withFee(remBase, feePercent).fee, remainingTotal: withFee(remBase, feePercent).total,
      openLinks: open.map(k => ({ linkId: k.link_id, kind: k.kind, total: Number(k.total_amount), expiresAt: k.expires_at })),
      canClose: (await loanAccess(session, l)).canClose,
    })
  }
  return { items, feePercent }
}

// ---------- WhatsApp text, QR ----------
export function whatsappMessage(row: LinkRow, customerName: string, loanId: string, weeks: { weekNo: number; dueDate: string; amount: number }[]) {
  const lines = [
    '*NGF FINCORP*', `Hello ${customerName},`, '',
    row.kind === 'closure' ? `To close your loan ${loanId} you can pay the remaining balance online.` : `Your loan ${loanId} payment is due.`,
    ...weeks.map(w => `• Week ${w.weekNo} · ${niceDate(w.dueDate)} · ${money(w.amount)}`),
    '', `Amount: ${money(row.base_amount)}`,
  ]
  if (row.fee_amount > 0) lines.push(`Online payment fee (${row.fee_percent}%): ${money(row.fee_amount)}`)
  lines.push(`*Total to pay: ${money(row.total_amount)}*`, '', 'Pay securely here:', row.short_url || '', '', `This link is valid until ${new Date(row.expires_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })}.`, 'Never share OTPs or your UPI PIN with anyone.')
  return lines.join('\n')
}

async function view(row: LinkRow) {
  const sb = getSupabase()
  const [cust, reps] = await Promise.all([
    sb.from('customers').select('name, phone').eq('customer_id', row.customer_id).maybeSingle(),
    sb.from('repayments').select('repayment_id, week_no, due_date, amount').in('repayment_id', row.repayment_ids.length ? row.repayment_ids : ['-']),
  ])
  const weeks = ((reps.data || []) as { week_no: number; due_date: string; amount: number }[]).map(r => ({ weekNo: r.week_no, dueDate: r.due_date, amount: Number(r.amount) })).sort((a, b) => a.weekNo - b.weekNo)
  const name = cust.data?.name || 'Customer', mobile = normalizeIndianMobile(cust.data?.phone)
  const text = whatsappMessage(row, name, row.loan_id, weeks)
  return {
    linkId: row.link_id, kind: row.kind, status: row.status === 'Created' && Date.parse(row.expires_at) < Date.now() ? 'Expired' : row.status,
    loanId: row.loan_id, payCode: payCodeFromLoanId(row.loan_id), customerName: name, base: Number(row.base_amount), feePercent: Number(row.fee_percent), fee: Number(row.fee_amount), total: Number(row.total_amount),
    url: row.short_url || '', expiresAt: row.expires_at, paidAt: row.paid_at, method: row.payment_method, closureMode: row.closure_mode, provider: row.provider,
    weeks, message: text, whatsappUrl: mobile ? `https://wa.me/91${mobile}?text=${encodeURIComponent(text)}` : '',
    qr: row.short_url ? await QRCode.toDataURL(row.short_url, { margin: 1, width: 320 }) : '',
  }
}

// ---------- create ----------
export async function createLink(session: Session, input: { loanId: string; kind: 'weeks' | 'closure'; repaymentIds?: string[]; closureMode?: 'hold' | 'permanent'; reason?: string }) {
  const gateway = getGateway()
  if (!gateway) throw new LinkError('Online payment is not connected yet. It starts working once the bank gateway is set up.')
  const rl = rateLimitKey(`plink:${session.userId}`, 40, 3600_000)
  if (!rl.success) throw new LinkError(`Too many links created. Try again in ${Math.ceil(rl.retryAfterSec / 60)} minutes.`)
  await expireOld()
  const sb = getSupabase()
  const { data: loan } = await sb.from('loans').select('loan_id, customer_id, guarantor_id, status, end_date, weekly_collection_amount').eq('loan_id', input.loanId).maybeSingle()
  if (!loan) throw new LinkError('Loan not found')
  const acc = await loanAccess(session, loan as LoanRow)
  if (!acc.allowed) throw new LinkError('No permission for this customer')
  if (loan.status !== 'Active') throw new LinkError('This loan is not running')
  if (input.kind === 'closure' && !acc.canClose) throw new LinkError('Only the branch or admin can close a loan')

  const { data: allReps } = await sb.from('repayments').select('repayment_id, loan_id, week_no, due_date, amount, status').eq('loan_id', input.loanId)
  const { data: lines } = await sb.from('payment_lines').select('repayment_id').in('repayment_id', (allReps || []).map(r => r.repayment_id))
  const marked = new Set((lines || []).map(l => l.repayment_id as string))
  const unpaid = ((allReps || []) as RepRow[]).filter(r => r.status !== 'Paid' && r.status !== 'Waived')
  let chosen: RepRow[]
  if (input.kind === 'weeks') {
    const saturday = getThisSaturday()
    chosen = unpaid.filter(r => r.due_date <= saturday && !marked.has(r.repayment_id))
    if (input.repaymentIds?.length) { chosen = chosen.filter(r => input.repaymentIds!.includes(r.repayment_id)); if (chosen.length !== new Set(input.repaymentIds).size) throw new LinkError('A selected week is not due or is already marked paid') }
    if (!chosen.length) throw new LinkError('Nothing is due for this customer yet.')
  } else {
    if (!input.closureMode) throw new LinkError('Choose Close & Hold or Close permanently')
    if (input.closureMode === 'permanent' && String(input.reason || '').trim().length < 10) throw new LinkError('Give the reason for the permanent closure (at least 10 characters)')
    chosen = unpaid
    if (!chosen.length) throw new LinkError('All weeks are already paid')
    if (chosen.some(r => marked.has(r.repayment_id))) throw new LinkError('A week already has a payment recorded. Sort that out first.')
  }
  chosen.sort((a, b) => a.week_no - b.week_no)
  const base = chosen.reduce((s, r) => s + Number(r.amount), 0)
  const pct = await getFeePercent()
  const { fee, total } = withFee(base, pct)
  const ids = chosen.map(r => r.repayment_id)

  // One open link per loan and kind: reuse it when it is identical, otherwise replace it
  const { data: openRows } = await sb.from('payment_links').select('*').eq('loan_id', input.loanId).eq('kind', input.kind).eq('status', 'Created')
  const open = (openRows || [])[0] as LinkRow | undefined
  if (open) {
    const same = open.repayment_ids.length === ids.length && ids.every(i => open.repayment_ids.includes(i)) && Number(open.total_amount) === total && open.closure_mode === (input.closureMode ?? null)
    if (same) return view(open)
    await sb.from('payment_links').update({ status: 'Cancelled' }).eq('link_id', open.link_id)
  }

  const linkId = makeId('PLK')
  const expiresAt = new Date(Date.now() + LINK_TTL_MS).toISOString()
  const { error } = await sb.from('payment_links').insert({
    link_id: linkId, kind: input.kind, loan_id: input.loanId, customer_id: loan.customer_id, guarantor_id: loan.guarantor_id, repayment_ids: ids,
    base_amount: base, fee_percent: pct, fee_amount: fee, total_amount: total, closure_mode: input.kind === 'closure' ? input.closureMode : null,
    closure_reason: input.kind === 'closure' ? (input.reason || '').slice(0, 300) : null, status: 'Created', provider: gateway.name,
    expires_at: expiresAt, created_by: session.userId, created_by_name: session.name,
  })
  if (error) throw new LinkError(error.code === '23505' ? 'A link for this loan was just created. Try again.' : error.message)
  try {
    const cust = await sb.from('customers').select('name, phone').eq('customer_id', loan.customer_id).maybeSingle()
    const base0 = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '')
    const made = await gateway.createLink({
      linkId, amount: total, customerName: cust.data?.name || 'Customer', phone: normalizeIndianMobile(cust.data?.phone) || '',
      description: input.kind === 'closure' ? `Loan ${input.loanId} closure` : `Loan ${input.loanId} weekly payment`, expiresAt, callbackUrl: `${base0}/api/gateway/webhook`,
    })
    await sb.from('payment_links').update({ provider_ref: made.providerRef, short_url: made.url }).eq('link_id', linkId)
  } catch (e) {
    await sb.from('payment_links').delete().eq('link_id', linkId)
    throw new LinkError(e instanceof Error ? e.message : 'The gateway could not create the link')
  }
  const { data: row } = await sb.from('payment_links').select('*').eq('link_id', linkId).single()
  return view(row as LinkRow)
}

/** A link's current state for the person who made it (and admin / branch / the loan's guarantor) */
export async function getLink(session: Session, linkId: string) {
  await expireOld()
  const { data: row } = await getSupabase().from('payment_links').select('*').eq('link_id', linkId).maybeSingle()
  if (!row) throw new LinkError('Link not found')
  const acc = await loanAccess(session, { guarantor_id: (row as LinkRow).guarantor_id })
  if (!acc.allowed) throw new LinkError('No permission')
  return view(row as LinkRow)
}

export async function recentLinks(limit = 25) {
  const { data } = await getSupabase().from('payment_links').select('link_id, kind, loan_id, base_amount, fee_amount, total_amount, status, provider, created_by_name, created_at, paid_at').order('created_at', { ascending: false }).limit(limit)
  return data || []
}

// ---------- settle (called by the webhook) ----------
const MODE: Record<string, string> = { upi: 'UPI', netbanking: 'Bank', card: 'Other', other: 'Other' }

export async function settleFromEvent(ev: GatewayEvent): Promise<{ status: number; message: string }> {
  const sb = getSupabase()
  const { data: found } = await sb.from('payment_links').select('*').eq('link_id', ev.linkId).maybeSingle()
  if (!found) return { status: 404, message: 'Unknown link' }
  const row = found as LinkRow
  if (ev.status === 'failed') {
    await sb.from('payment_links').update({ status: 'Failed' }).eq('link_id', row.link_id).eq('status', 'Created')
    return { status: 200, message: 'Recorded as failed' }
  }
  if (row.status === 'Paid' && row.gateway_payment_id === ev.gatewayPaymentId) return { status: 200, message: 'Already processed' }
  if (Math.abs(Number(ev.amount) - Number(row.total_amount)) > 0.009) {
    await sb.from('payment_links').update({ status: 'Mismatch', error_text: `Paid ${ev.amount}, expected ${row.total_amount} (ref ${ev.gatewayPaymentId})` }).eq('link_id', row.link_id)
    await notifyRole('Admin', 'Payment amount mismatch', `Link ${row.link_id}: gateway reported ${money(ev.amount)} but ${money(row.total_amount)} was expected. Nothing was credited. Check with the bank.`, 'PaymentLink', row.link_id)
    return { status: 200, message: 'Amount mismatch flagged' }
  }
  // Claim it so a repeated webhook cannot credit twice. A late payment on an expired link is still credited: the money is in.
  const { data: claimed } = await sb.from('payment_links').update({ status: 'Paid', gateway_payment_id: ev.gatewayPaymentId, payment_method: ev.method, paid_at: ev.paidAt || nowIso() })
    .eq('link_id', row.link_id).in('status', ['Created', 'Expired']).select('link_id')
  if (!claimed || claimed.length === 0) return { status: 200, message: 'Already processed' }

  let recorded = false
  try {
    await recordGatewayPayment({
      repaymentIds: row.repayment_ids, mode: MODE[ev.method] || 'Other', utr: ev.gatewayPaymentId, guarantorId: row.guarantor_id,
      createdBy: row.created_by, createdByName: row.created_by_name || 'Payment link',
      notes: `Online payment, link ${row.link_id}${row.fee_amount > 0 ? ` (customer paid ${money(row.total_amount)} including ${money(row.fee_amount)} gateway fee)` : ''}`,
    })
    recorded = true
    if (row.kind === 'closure' && row.closure_mode) {
      const { data: loan } = await sb.from('loans').select('end_date').eq('loan_id', row.loan_id).maybeSingle()
      await finalizeClosure({ loanId: row.loan_id, customerId: row.customer_id, mode: row.closure_mode, weeksRemaining: row.repayment_ids.length, amountCollected: Number(row.base_amount), paymentMode: MODE[ev.method] || 'Other', endDate: String(loan?.end_date || ''), reason: row.closure_reason || '', closedBy: row.created_by })
    }
    for (const t of ['Repayments', 'Collections', 'Loans', 'Customers'] as const) invalidateCache(t)
    const who = (await sb.from('customers').select('name').eq('customer_id', row.customer_id).maybeSingle()).data?.name || 'Customer'
    try { await notifyUser(row.created_by, row.created_by_name ? 'Staff' : 'Admin', 'Payment received', `${who}: ${money(row.total_amount)} paid online${row.kind === 'closure' ? ' (loan closed)' : ''}.`, 'PaymentLink', row.link_id) } catch { /* best effort */ }
    return { status: 200, message: 'Credited' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'failed'
    if (!recorded) {
      // Nothing was credited: release the claim and let the gateway retry
      await sb.from('payment_links').update({ status: 'Created', gateway_payment_id: null, payment_method: null, paid_at: null, error_text: msg.slice(0, 300) }).eq('link_id', row.link_id)
      await notifyRole('Admin', 'Online payment could not be applied', `Link ${row.link_id}: ${money(ev.amount)} was paid but could not be credited (${msg}). The gateway will retry; if it keeps failing, credit it by hand.`, 'PaymentLink', row.link_id)
      return { status: 500, message: 'Could not apply the payment' }
    }
    await sb.from('payment_links').update({ status: 'Error', error_text: `Credited but closing the account failed: ${msg}`.slice(0, 300) }).eq('link_id', row.link_id)
    await notifyRole('Admin', 'Online payment credited, closure incomplete', `Link ${row.link_id}: the weeks were credited but the account closure failed (${msg}). Finish it from the customer page.`, 'PaymentLink', row.link_id)
    return { status: 200, message: 'Credited; closure needs attention' }
  }
}
