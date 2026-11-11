/* eslint-disable @typescript-eslint/no-explicit-any -- tool inputs and API answers are checked by each tool */
import { NextRequest } from 'next/server'
import { getSupabase, getRowById } from '@/lib/supabase-db'
import { getTodayIST, addDaysIST } from '@/lib/dateUtils'
import { notifyUser } from '@/lib/notifications'
import { findLoanProduct } from '@/lib/loanProducts'
import { bankIssues } from '@/lib/bankFile'
import { addBrain, searchBrain, searchDocs, readDoc, BrainKind } from './brain'
import { callApi } from './api'
import { Tier, ToolDef } from './models'

// Oreo's hands. Three risk levels:
//  read  - looks things up, runs freely
//  low   - small reversible actions (a notification, an agent assignment, returning a lead): run at once, audited
//  money - approve, reject, bank files, disburse: Oreo only PREPARES. The owner sees a confirm card built from the database and must confirm.
export type Risk = 'read' | 'low' | 'money'
export type Ctx = { req: NextRequest; userId: string; userName: string; threadId: string; tier: Tier }
export type Prepared = { summary: string; error?: string; input?: Record<string, unknown> }
export type ToolSpec = {
  def: ToolDef; risk: Risk
  run?: (a: Record<string, any>, c: Ctx) => Promise<unknown>        // read / low
  prepare?: (a: Record<string, any>, c: Ctx) => Promise<Prepared>    // money: builds the confirm card
  execute?: (a: Record<string, any>, c: Ctx) => Promise<string>      // money: runs after the owner confirms
}

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false })
const str = (description: string) => ({ type: 'string', description })
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`
const sb = () => getSupabase()
const last4 = (s: string) => (s ? `••••${String(s).slice(-4)}` : '')
const sum = (rows: { amount?: number | string | null }[] | null) => (rows || []).reduce((t, r) => t + Number(r.amount || 0), 0)
const saturdayOnOrAfter = (d: string) => { const dow = new Date(`${d}T00:00:00Z`).getUTCDay(); return addDaysIST(d, (6 - dow + 7) % 7) }
const istStartUtc = (ymd: string) => new Date(`${ymd}T00:00:00+05:30`).toISOString()

async function guarantorNames(ids: string[]) {
  const u = [...new Set(ids.filter(Boolean))]
  if (!u.length) return new Map<string, { name: string; code: string }>()
  const { data } = await sb().from('guarantors').select('guarantor_id, name, code').in('guarantor_id', u)
  return new Map((data || []).map(g => [g.guarantor_id as string, { name: String(g.name || '').trim(), code: String(g.code || '') }]))
}
async function guarantorIdByCode(code?: string) {
  if (!code) return ''
  const { data } = await sb().from('guarantors').select('guarantor_id').ilike('code', code.trim()).limit(1)
  return data?.[0]?.guarantor_id || ''
}

// ───────────────────────── numbers for the live map and for "how is business?"
export async function businessCounts() {
  const today = getTodayIST(), sat = saturdayOnOrAfter(today)
  const monday = addDaysIST(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7))
  const cnt = async (q: PromiseLike<{ count: number | null }>) => (await q).count || 0
  const [customers, loansActive, pending, assigned, submitted, approved, returned, dueSat, overdue, paidWeek, chatPending, chatStale, batchesLive, failedAi, aiToday, linesOpen] = await Promise.all([
    cnt(sb().from('customers').select('customer_id', { count: 'exact', head: true })),
    cnt(sb().from('loans').select('loan_id', { count: 'exact', head: true }).eq('status', 'Active')),
    cnt(sb().from('leads').select('lead_id', { count: 'exact', head: true }).eq('status', 'Pending')),
    cnt(sb().from('leads').select('lead_id', { count: 'exact', head: true }).in('status', ['Agent Assigned', 'Verification In Progress'])),
    cnt(sb().from('leads').select('lead_id', { count: 'exact', head: true }).eq('status', 'Verification Submitted')),
    cnt(sb().from('leads').select('lead_id', { count: 'exact', head: true }).eq('status', 'Approved').is('disbursed_at', null)),
    cnt(sb().from('leads').select('lead_id', { count: 'exact', head: true }).eq('status', 'Returned')),
    sb().from('repayments').select('amount').eq('status', 'Pending').eq('due_date', sat).limit(5000),
    sb().from('repayments').select('amount').eq('status', 'Pending').lt('due_date', today).limit(5000),
    sb().from('repayments').select('amount').eq('status', 'Paid').gte('paid_date', monday).lte('paid_date', today).limit(5000),
    cnt(sb().from('payment_chat').select('message_id', { count: 'exact', head: true }).eq('status', 'Pending Staff').gte('created_at', istStartUtc(addDaysIST(today, -7)))),   // still fresh: staff should act now
    cnt(sb().from('payment_chat').select('message_id', { count: 'exact', head: true }).eq('status', 'Pending Staff').lt('created_at', istStartUtc(addDaysIST(today, -7)))),   // older than a week, never closed: usually re-sent and recorded since
    cnt(sb().from('bank_payout_batches').select('batch_id', { count: 'exact', head: true }).eq('status', 'created')),
    cnt(sb().from('ai_usage').select('id', { count: 'exact', head: true }).eq('status', 'error').gte('created_at', istStartUtc(today))),
    sb().from('ai_usage').select('cost_usd').gte('created_at', istStartUtc(today)).limit(5000),
    cnt(sb().from('bank_payout_lines').select('line_id', { count: 'exact', head: true }).is('disbursed_at', null)),
  ])
  return {
    today, nextSaturday: sat, customers, loansActive,
    leads: { pending, verificationInProgress: assigned, awaitingApproval: submitted, approvedWaitingDisbursement: approved, returned },
    collection: { dueSaturdayCount: (dueSat.data || []).length, dueSaturdayAmount: sum(dueSat.data), overdueCount: (overdue.data || []).length, overdueAmount: sum(overdue.data), paidThisWeekCount: (paidWeek.data || []).length, paidThisWeekAmount: sum(paidWeek.data) },
    paymentScreenshotsNeedingStaff: chatPending, oldScreenshotsNeverClosed: chatStale, bankFilesLive: batchesLive, bankFileLinesNotDisbursed: linesOpen,
    aiCallsFailedToday: failedAi, aiSpendTodayUsd: Number((aiToday.data || []).reduce((t, r) => t + Number(r.cost_usd || 0), 0).toFixed(5)),
  }
}

// ───────────────────────── per guarantor numbers (the tool and the live map both use this)
export async function guarantorStats(code?: string) {
  const today = getTodayIST()
  const [{ data: gs }, { data: loans }, { data: reps }] = await Promise.all([
    sb().from('guarantors').select('guarantor_id, name, code, status, guarantor_number'), sb().from('loans').select('loan_id, guarantor_id').eq('status', 'Active').limit(5000),
    sb().from('repayments').select('loan_id, amount').eq('status', 'Pending').lt('due_date', today).limit(5000),
  ])
  const lg = new Map((loans || []).map(l => [l.loan_id, l.guarantor_id as string]))
  return (gs || []).filter(g => !code || String(g.code).toLowerCase() === code.toLowerCase()).map(g => {
    const mine = (loans || []).filter(l => l.guarantor_id === g.guarantor_id); const od = (reps || []).filter(r => lg.get(r.loan_id) === g.guarantor_id)
    return { name: String(g.name).trim(), code: g.code as string, number: g.guarantor_number, status: g.status, activeLoans: mine.length, overdueWeeks: od.length, overdueAmount: sum(od) }
  })
}

// ───────────────────────── read tools
const READ: ToolSpec[] = [
  { risk: 'read', def: { name: 'business_snapshot', description: 'Live numbers for the whole business right now: customers, active loans, leads at each stage, this Saturday\'s collection due, overdue amount, payments needing staff, bank files, AI spend. Use this first for "how is business", "what needs attention".', input_schema: obj({}) },
    run: async () => businessCounts() },

  { risk: 'read', def: { name: 'find_customer', description: 'Find customers by name, phone, 4-digit customer number (like 7425), loan id or customer id. Returns up to 8 with their loan and overdue status.', input_schema: obj({ query: str('name, phone, 4-digit number, loan id or customer id') }, ['query']) },
    run: async ({ query }) => {
      const q = String(query || '').trim().replace(/[%,()]/g, '').slice(0, 60)
      if (!q) return { error: 'Give a name, phone or number' }
      let qb = sb().from('customers').select('customer_id, name, phone, place, status, guarantor_id, pay_number, active_loan_id').limit(8)
      qb = /^\d{4}$/.test(q) ? qb.eq('pay_number', q) : /^\d{6,}$/.test(q) ? qb.ilike('phone', `%${q}%`) : qb.or(`name.ilike.%${q}%,customer_id.ilike.%${q}%,active_loan_id.ilike.%${q}%`)
      const { data } = await qb
      const rows = data || []
      const gmap = await guarantorNames(rows.map(r => r.guarantor_id))
      const today = getTodayIST()
      const { data: reps } = rows.length ? await sb().from('repayments').select('customer_id, amount').eq('status', 'Pending').lt('due_date', today).in('customer_id', rows.map(r => r.customer_id)) : { data: [] }
      return rows.map(r => ({ customerId: r.customer_id, name: r.name, phone: r.phone, place: r.place, customerNumber: r.pay_number, status: r.status, activeLoan: r.active_loan_id, guarantor: gmap.get(r.guarantor_id)?.name || '', overdueWeeks: (reps || []).filter(x => x.customer_id === r.customer_id).length, overdueAmount: sum((reps || []).filter(x => x.customer_id === r.customer_id)) }))
    } },

  { risk: 'read', def: { name: 'customer_detail', description: 'Full picture of one customer: loans, the week-by-week repayment table of the current loan, guarantor, bank details (IFSC and last 4 digits only).', input_schema: obj({ customer_id: str('customer id from find_customer') }, ['customer_id']) },
    run: async ({ customer_id }) => {
      const c = await getRowById('Customers', String(customer_id))
      if (!c) return { error: 'Customer not found' }
      const [loans, g] = await Promise.all([sb().from('loans').select('loan_id, status, principal_amount, net_disbursed, weekly_collection_amount, duration_weeks, start_date, end_date').eq('customer_id', customer_id).order('created_at', { ascending: false }).limit(6), getRowById('Guarantors', c['Guarantor ID'])])
      const active = (loans.data || [])[0]
      const { data: reps } = active ? await sb().from('repayments').select('week_no, due_date, amount, status, paid_date, payment_mode').eq('loan_id', active.loan_id).order('week_no') : { data: [] }
      const today = getTodayIST()
      return {
        name: c['Name'], phone: c['Phone'], place: c['Place'], customerNumber: c['Pay Number'], status: c['Status'], guarantor: g?.['Name'], guarantorCode: g?.['Code'],
        bank: { ifsc: c['IFSC Code'] || '', account: last4(c['Account Number']), holder: c['Account Holder'] || '' }, loans: loans.data,
        repayments: (reps || []).map(r => ({ week: r.week_no, due: r.due_date, amount: Number(r.amount), status: r.status === 'Pending' && r.due_date < today ? 'Overdue' : r.status, paid: r.paid_date, mode: r.payment_mode })),
      }
    } },

  { risk: 'read', def: { name: 'find_leads', description: 'List leads, optionally by status (Pending, Agent Assigned, Verification Submitted, Approved, Returned, Converted) or name/phone text.', input_schema: obj({ status: str('lead status'), query: str('name or phone text') }) },
    run: async ({ status, query }) => {
      let qb = sb().from('leads').select('lead_id, customer_name, phone, place, status, loan_product, guarantor_id, submitted_date, disbursed_at, return_reason, bank_verified_at').order('submitted_date', { ascending: false }).limit(15)
      if (status) qb = qb.eq('status', String(status))
      if (query) { const q = String(query).replace(/[%,()]/g, '').slice(0, 50); qb = qb.or(`customer_name.ilike.%${q}%,phone.ilike.%${q}%`) }
      const { data } = await qb; const gm = await guarantorNames((data || []).map(l => l.guarantor_id))
      return (data || []).map(l => ({ leadId: l.lead_id, name: l.customer_name, phone: l.phone, place: l.place, status: l.status, product: l.loan_product, guarantor: gm.get(l.guarantor_id)?.name, submitted: l.submitted_date, disbursed: !!l.disbursed_at, returnReason: l.return_reason || undefined, bankVerified: !!l.bank_verified_at }))
    } },

  { risk: 'read', def: { name: 'collection_report', description: 'Collection for one Saturday (due date): expected, paid, still pending, per guarantor. Default is the coming Saturday. Use for "how is Saturday collection".', input_schema: obj({ date: str('YYYY-MM-DD (a Saturday); default the next Saturday'), guarantor_code: str('optional guarantor code like GBN') }) },
    run: async ({ date, guarantor_code }) => {
      const d = /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? String(date) : saturdayOnOrAfter(getTodayIST())
      const { data: reps } = await sb().from('repayments').select('loan_id, amount, status, payment_mode').eq('due_date', d).limit(5000)
      const loanIds = [...new Set((reps || []).map(r => r.loan_id))]
      const { data: loans } = loanIds.length ? await sb().from('loans').select('loan_id, guarantor_id').in('loan_id', loanIds.slice(0, 1000)) : { data: [] }
      const lg = new Map((loans || []).map(l => [l.loan_id, l.guarantor_id as string]))
      const gm = await guarantorNames([...lg.values()])
      const want = await guarantorIdByCode(guarantor_code)
      const by = new Map<string, { guarantor: string; expected: number; paid: number; pending: number; customers: number }>()
      for (const r of reps || []) {
        const gid = lg.get(r.loan_id) || ''; if (want && gid !== want) continue
        const e = by.get(gid) || { guarantor: gm.get(gid)?.name || gid, expected: 0, paid: 0, pending: 0, customers: 0 }
        e.expected += Number(r.amount); e.customers++; if (r.status === 'Paid') e.paid += Number(r.amount); else e.pending += Number(r.amount); by.set(gid, e)
      }
      const rows = [...by.values()].sort((a, b) => b.expected - a.expected)
      return { date: d, expected: rows.reduce((t, r) => t + r.expected, 0), paid: rows.reduce((t, r) => t + r.paid, 0), pending: rows.reduce((t, r) => t + r.pending, 0), byGuarantor: rows }
    } },

  { risk: 'read', def: { name: 'overdue_customers', description: 'Customers with unpaid weeks whose due date has passed, biggest first. Optional guarantor code.', input_schema: obj({ guarantor_code: str('optional, like GBN'), limit: { type: 'integer', description: 'max rows, default 15' } }) },
    run: async ({ guarantor_code, limit }) => {
      const today = getTodayIST()
      const { data: reps } = await sb().from('repayments').select('customer_id, loan_id, amount, due_date').eq('status', 'Pending').lt('due_date', today).limit(5000)
      const by = new Map<string, { customerId: string; loanId: string; weeks: number; amount: number; oldest: string }>()
      for (const r of reps || []) { const e = by.get(r.customer_id) || { customerId: r.customer_id, loanId: r.loan_id, weeks: 0, amount: 0, oldest: r.due_date }; e.weeks++; e.amount += Number(r.amount); if (r.due_date < e.oldest) e.oldest = r.due_date; by.set(r.customer_id, e) }
      let rows = [...by.values()].sort((a, b) => b.amount - a.amount)
      const ids = rows.slice(0, 200).map(r => r.customerId)
      const { data: cs } = ids.length ? await sb().from('customers').select('customer_id, name, phone, pay_number, guarantor_id').in('customer_id', ids) : { data: [] }
      const gm = await guarantorNames((cs || []).map(c => c.guarantor_id)); const cm = new Map((cs || []).map(c => [c.customer_id, c]))
      const want = await guarantorIdByCode(guarantor_code)
      const out = rows.filter(r => !want || cm.get(r.customerId)?.guarantor_id === want).slice(0, Math.min(40, Number(limit) || 15)).map(r => { const c = cm.get(r.customerId); return { name: c?.name, customerNumber: c?.pay_number, phone: c?.phone, guarantor: gm.get(c?.guarantor_id || '')?.name, weeksOverdue: r.weeks, amount: r.amount, oldestDue: r.oldest, customerId: r.customerId } })
      rows = rows.filter(r => !want || cm.get(r.customerId)?.guarantor_id === want)
      return { totalCustomers: rows.length, totalAmount: rows.reduce((t, r) => t + r.amount, 0), top: out }
    } },

  { risk: 'read', def: { name: 'disbursement_queue', description: 'Approved leads waiting for the money to be handed over, with their bank details status and bank file.', input_schema: obj({}) },
    run: async () => {
      const { data } = await sb().from('leads').select('lead_id, customer_name, loan_product, guarantor_id, bank_verified_at, ifsc_code, account_number, account_holder, pay_number').eq('status', 'Approved').is('disbursed_at', null).limit(60)
      const ids = (data || []).map(l => l.lead_id)
      const { data: lines } = ids.length ? await sb().from('bank_payout_lines').select('lead_id, reference_number, batch_id').in('lead_id', ids) : { data: [] }
      const { data: bs } = (lines || []).length ? await sb().from('bank_payout_batches').select('batch_id, file_name, status').in('batch_id', [...new Set((lines || []).map(x => x.batch_id))]) : { data: [] }
      const gm = await guarantorNames((data || []).map(l => l.guarantor_id))
      return (data || []).map(l => { const ln = (lines || []).find(x => x.lead_id === l.lead_id && (bs || []).find(b => b.batch_id === x.batch_id)?.status === 'created'); const issues = bankIssues({ ifsc: l.ifsc_code, account: l.account_number, name: l.account_holder }); return { leadId: l.lead_id, name: l.customer_name, guarantor: gm.get(l.guarantor_id)?.name, product: l.loan_product, bank: issues.length ? `needs fixing: ${issues[0]}` : l.bank_verified_at ? 'verified' : 'not verified yet', inBankFile: ln ? (bs || []).find(b => b.batch_id === ln.batch_id)?.file_name : null } })
    } },

  { risk: 'read', def: { name: 'guarantor_overview', description: 'Per guarantor: customers, active loans, overdue weeks and amount. Optional single guarantor code.', input_schema: obj({ code: str('optional guarantor code') }) },
    run: async ({ code }) => guarantorStats(code ? String(code) : undefined) },

  { risk: 'read', def: { name: 'payments_overview', description: 'Recent recorded payments (UPI/cash) and payment screenshots waiting for staff, for the last N days (default 14).', input_schema: obj({ days: { type: 'integer', description: 'default 14' } }) },
    run: async ({ days }) => {
      const since = addDaysIST(getTodayIST(), -Math.min(90, Number(days) || 14))
      const [{ data: groups }, { data: waiting }] = await Promise.all([
        sb().from('payment_groups').select('saturday_date, mode, total_amount, status').gte('saturday_date', since).limit(3000),
        sb().from('payment_chat').select('message_id, guarantor_id, amount_read, utr, created_at, problem').eq('status', 'Pending Staff').order('created_at', { ascending: false }).limit(15),
      ])
      const gm = await guarantorNames((waiting || []).map(w => w.guarantor_id))
      const byMode: Record<string, { count: number; amount: number }> = {}; for (const g of groups || []) { const k = g.mode || '?'; byMode[k] = byMode[k] || { count: 0, amount: 0 }; byMode[k].count++; byMode[k].amount += Number(g.total_amount || 0) }
      const ageDays = (at: string) => Math.floor((Date.now() - new Date(at).getTime()) / 86400000)
      return { since, byMode, note: 'Screenshots older than 7 days that staff never closed are usually duplicates that were re-sent and recorded; say so, do not call them urgent.', waitingForStaff: (waiting || []).map(w => ({ guarantor: gm.get(w.guarantor_id)?.name, amount: w.amount_read, utr: w.utr, problem: w.problem, at: w.created_at, ageDays: ageDays(w.created_at), old: ageDays(w.created_at) > 7 })) }
    } },

  { risk: 'read', def: { name: 'ai_spend', description: 'AI usage and cost for the last N days (default 7), by category (payment screenshots, Aadhaar reading, Oreo) with rupees at the saved rate.', input_schema: obj({ days: { type: 'integer' } }) },
    run: async ({ days }) => {
      const since = istStartUtc(addDaysIST(getTodayIST(), -(Math.min(90, Number(days) || 7) - 1)))
      const { data } = await sb().from('ai_usage').select('purpose, cost_usd, tokens_in, tokens_out, status').gte('created_at', since).limit(20000)
      const { data: rate } = await sb().from('settings').select('value').eq('key', 'ai:usdInr').maybeSingle()
      const r = Number(rate?.value) || 90; const by: Record<string, { calls: number; usd: number; tokens: number; failed: number }> = {}
      for (const x of data || []) { const e = (by[x.purpose] = by[x.purpose] || { calls: 0, usd: 0, tokens: 0, failed: 0 }); e.calls++; e.usd += Number(x.cost_usd || 0); e.tokens += (x.tokens_in || 0) + (x.tokens_out || 0); if (x.status === 'error') e.failed++ }
      return { rupeesPerDollar: r, byCategory: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, { ...v, usd: Number(v.usd.toFixed(4)), inr: Number((v.usd * r).toFixed(2)) }])) }
    } },

  { risk: 'read', def: { name: 'search_brain', description: 'Search Oreo\'s own brain (rules, facts, preferences, playbooks) and the NGF documentation for how things work or what the owner prefers. Use before answering "how do we..." questions.', input_schema: obj({ query: str('words to look for') }, ['query']) },
    run: async ({ query }) => ({ brain: (await searchBrain(String(query), 6)).map(b => ({ kind: b.kind, title: b.title, body: b.body })), docs: searchDocs(String(query), 3) }) },

  { risk: 'read', def: { name: 'read_doc', description: 'Read one NGF documentation file (path from search_brain results).', input_schema: obj({ path: str('relative path like "04 Money/Bank Payout File.md"') }, ['path']) },
    run: async ({ path }) => readDoc(String(path)) ?? { error: 'Document not found' } },

  { risk: 'low', def: { name: 'remember', description: 'Save something to Oreo\'s brain so it is remembered later: a fact about the business, a preference of the owner, or a playbook (steps). Use kind "rule" only when the owner states a new standing rule: rules wait for the owner\'s approval. Never save passwords, keys or full account numbers.', input_schema: obj({ kind: { type: 'string', enum: ['rule', 'fact', 'preference', 'playbook'] }, title: str('short title'), body: str('the note, clear and complete') }, ['kind', 'title', 'body']) },
    run: async ({ kind, title, body }, c) => {
      const r = await addBrain({ kind: kind as BrainKind, title: String(title), body: String(body), source: 'oreo', status: kind === 'rule' ? 'pending' : 'active', by: c.userId })
      return r.ok ? { saved: true, note: kind === 'rule' ? 'Saved as a pending rule: the owner must approve it in the Brain screen.' : 'Saved to the brain.' } : { saved: false, error: r.error }
    } },
]

// ───────────────────────── low-risk actions
const LOW: ToolSpec[] = [
  { risk: 'low', def: { name: 'notify_guarantor', description: 'Send an in-app notification to a guarantor (find the code with guarantor_overview). Short and polite.', input_schema: obj({ guarantor_code: str('like GBN'), title: str('short title'), message: str('the message') }, ['guarantor_code', 'title', 'message']) },
    run: async ({ guarantor_code, title, message }, c) => {
      const gid = await guarantorIdByCode(String(guarantor_code)); if (!gid) return { error: 'Guarantor not found' }
      const g = await getRowById('Guarantors', gid); if (!g) return { error: 'Guarantor not found' }
      await notifyUser(g['User ID'], 'Guarantor', String(title).slice(0, 80), `${String(message).slice(0, 400)}`, 'Oreo', c.threadId)
      return { sent: true, to: g['Name'] }
    } },
  { risk: 'low', def: { name: 'assign_agent', description: 'Assign a field agent to a lead for verification. Find agent ids with agent_list.', input_schema: obj({ lead_id: str(''), agent_id: str('') }, ['lead_id', 'agent_id']) },
    run: async ({ lead_id, agent_id }, c) => { const r = await callApi(c.req, 'PATCH', `/api/leads/${encodeURIComponent(String(lead_id))}`, { action: 'assignAgent', agentId: String(agent_id) }); return r.ok ? { done: true } : { error: r.error } } },
  { risk: 'low', def: { name: 'agent_list', description: 'List field agents (id, name, type, status).', input_schema: obj({}) },
    run: async () => { const { data } = await sb().from('agents').select('agent_id, name, agent_type, status').limit(50); return data || [] } },
  { risk: 'low', def: { name: 'return_lead', description: 'Return a lead to its guarantor with a reason (e.g. missing cheque). The guarantor sees it under Returned.', input_schema: obj({ lead_id: str(''), reason: str('why it is returned, at least 3 characters') }, ['lead_id', 'reason']) },
    run: async ({ lead_id, reason }, c) => { const r = await callApi(c.req, 'POST', '/api/routes', { action: 'returnLead', leadId: String(lead_id), reason: String(reason) }); return r.ok ? { done: true } : { error: r.error } } },
]

// ───────────────────────── money / irreversible actions: prepare → confirm card → execute
async function leadCard(id: string) {
  const l = await getRowById('Leads', String(id)); if (!l) return { error: 'Lead not found' as const }
  const g = await getRowById('Guarantors', l['Guarantor ID'])
  return { l, g }
}
const MONEY: ToolSpec[] = [
  { risk: 'money', def: { name: 'approve_lead', description: 'PREPARE approval of a lead whose verification is submitted (status Verification Submitted). The owner must confirm on a card; you cannot approve by yourself. Look the lead up first.', input_schema: obj({ lead_id: str(''), loan_product: str('optional product key, default the lead\'s own') }, ['lead_id']) },
    prepare: async ({ lead_id, loan_product }) => {
      const c = await leadCard(lead_id); if ('error' in c) return { summary: '', error: c.error }
      if (c.l['Status'] !== 'Verification Submitted') return { summary: '', error: `This lead is "${c.l['Status']}", not Verification Submitted, so it cannot be approved now.` }
      const p = await findLoanProduct(String(loan_product || c.l['Loan Product']))
      return { summary: `Approve loan for ${c.l['Customer Name']} (guarantor ${c.g?.['Name'] || '?'}). Product ${p?.label || c.l['Loan Product']}${p ? `, pays out ${inr(p.netDisbursed)}` : ''}. Customer OTP ${c.l['Otp Verified At'] ? 'verified' : 'NOT verified'}.`, input: { lead_id: String(lead_id), loan_product: p?.key || c.l['Loan Product'] } }
    },
    execute: async ({ lead_id, loan_product }, c) => { const r = await callApi(c.req, 'PATCH', `/api/leads/${encodeURIComponent(lead_id)}`, { action: 'adminReview', decision: 'Approve Loan', loanProduct: loan_product }); if (!r.ok) throw new Error(r.error); return 'Approved. The lead is now waiting in To Disburse.' } },

  { risk: 'money', def: { name: 'reject_lead', description: 'PREPARE rejection of a lead (cannot be undone). The owner must confirm on a card.', input_schema: obj({ lead_id: str(''), reason: str('why') }, ['lead_id', 'reason']) },
    prepare: async ({ lead_id, reason }) => {
      const c = await leadCard(lead_id); if ('error' in c) return { summary: '', error: c.error }
      if (['Converted', 'Rejected'].includes(c.l['Status'])) return { summary: '', error: `This lead is already ${c.l['Status']}.` }
      return { summary: `Reject ${c.l['Customer Name']} (guarantor ${c.g?.['Name'] || '?'}), status ${c.l['Status']}. Reason: ${String(reason).slice(0, 200)}. This cannot be undone.`, input: { lead_id: String(lead_id), reason: String(reason).slice(0, 300) } }
    },
    execute: async ({ lead_id, reason }, c) => { const r = await callApi(c.req, 'PATCH', `/api/leads/${encodeURIComponent(lead_id)}`, { action: 'adminReview', decision: 'Reject Lead', notes: reason }); if (!r.ok) throw new Error(r.error); return 'Rejected.' } },

  { risk: 'money', def: { name: 'create_bank_files', description: 'PREPARE the bank payment files (renewals and new customers are separate files) for approved leads whose bank details are verified. The owner must confirm on a card. Get lead ids from disbursement_queue.', input_schema: obj({ lead_ids: { type: 'array', items: { type: 'string' }, description: 'lead ids' } }, ['lead_ids']) },
    prepare: async ({ lead_ids }) => {
      const ids: string[] = Array.isArray(lead_ids) ? [...new Set<string>(lead_ids.map(String))].slice(0, 100) : []
      if (!ids.length) return { summary: '', error: 'No leads given' }
      const rows: string[] = []; const problems: string[] = []; let total = 0
      for (const id of ids) {
        const l = await getRowById('Leads', id); if (!l) { problems.push(`${id}: not found`); continue }
        const isRen = l['Loan Product'] === 'RENEWAL'
        const src = isRen ? await (await import('@/lib/renewalRules')).customerForRenewalLead(l) : l
        const issues = bankIssues({ ifsc: src?.['IFSC Code'], account: src?.['Account Number'], name: src?.['Account Holder'] })
        if (l['Status'] !== 'Approved' || l['Disbursed At']) problems.push(`${l['Customer Name']}: not waiting to be disbursed`)
        else if (issues.length) problems.push(`${l['Customer Name']}: ${issues[0]}`)
        else if (!l['Bank Verified At']) problems.push(`${l['Customer Name']}: bank details not verified with the customer`)
        else { const amt = isRen ? 0 : (await findLoanProduct(l['Loan Product']))?.netDisbursed || 0; total += amt; rows.push(`${l['Customer Name']} (${isRen ? 'renewal' : 'new'})`) }
      }
      if (problems.length) return { summary: '', error: `Cannot make the files yet: ${problems.join('; ')}` }
      return { summary: `Create bank files for ${rows.length} customers: ${rows.join(', ')}${total ? `. New-customer payout about ${inr(total)}` : ''}. Files are made, not paid; you upload them in the bank portal.`, input: { lead_ids: ids } }
    },
    execute: async ({ lead_ids }, c) => { const r = await callApi(c.req, 'POST', '/api/disbursements/bank', { action: 'createFiles', leadIds: lead_ids }); if (!r.ok) throw new Error(r.error); return `Made ${(r.data?.created || []).map((b: { fileName: string; count: number }) => `${b.fileName} (${b.count})`).join(' and ')}. Download them in Leads > Disbursements > Bank files.` } },

  { risk: 'money', def: { name: 'disburse_lead', description: 'PREPARE marking one customer as disbursed (creates the loan). Only after the bank has paid. The owner must confirm on a card.', input_schema: obj({ lead_id: str('') }, ['lead_id']) },
    prepare: async ({ lead_id }) => {
      const c = await leadCard(lead_id); if ('error' in c) return { summary: '', error: c.error }
      if (c.l['Status'] !== 'Approved' || c.l['Disbursed At']) return { summary: '', error: 'This lead is not waiting to be disbursed.' }
      const { data: ln } = await sb().from('bank_payout_lines').select('batch_id, reference_number').eq('lead_id', String(lead_id))
      const { data: bs } = (ln || []).length ? await sb().from('bank_payout_batches').select('batch_id, file_name, status').in('batch_id', (ln || []).map(x => x.batch_id)) : { data: [] }
      const live = (bs || []).find(b => b.status === 'created')
      const p = c.l['Loan Product'] === 'RENEWAL' ? null : await findLoanProduct(c.l['Loan Product'])
      return { summary: `Mark ${c.l['Customer Name']} (guarantor ${c.g?.['Name'] || '?'}) as DISBURSED${p ? ` (${inr(p.netDisbursed)})` : ''}. This creates the loan. ${live ? `In bank file ${live.file_name}.` : 'WARNING: not in any bank file.'} Confirm only if the bank has paid.`, input: { lead_id: String(lead_id) } }
    },
    execute: async ({ lead_id }, c) => { const r = await callApi(c.req, 'PATCH', `/api/leads/${encodeURIComponent(lead_id)}`, { action: 'disburse' }); if (!r.ok) throw new Error(r.error); return `Disbursed. First payment ${r.data?.firstPayment || ''}.` } },

  { risk: 'money', def: { name: 'cancel_bank_file', description: 'PREPARE cancelling a bank file that was not paid. The owner must confirm on a card.', input_schema: obj({ batch_id: str(''), reason: str('') }, ['batch_id', 'reason']) },
    prepare: async ({ batch_id, reason }) => {
      const { data: b } = await sb().from('bank_payout_batches').select('batch_id, file_name, status, lead_count, total_amount').eq('batch_id', String(batch_id)).maybeSingle()
      if (!b) return { summary: '', error: 'File not found' }
      if (b.status !== 'created') return { summary: '', error: 'This file is already cancelled.' }
      return { summary: `Cancel bank file ${b.file_name} (${b.lead_count} customers, ${inr(Number(b.total_amount))}). Only if it was NOT paid at the bank. Reason: ${String(reason).slice(0, 200)}.`, input: { batch_id: String(batch_id), reason: String(reason).slice(0, 300) } }
    },
    execute: async ({ batch_id, reason }, c) => { const r = await callApi(c.req, 'POST', '/api/disbursements/bank', { action: 'cancelBatch', batchId: batch_id, reason }); if (!r.ok) throw new Error(r.error); return 'Cancelled.' } },
]

const META: ToolSpec = { risk: 'read', def: { name: 'suggest_model_switch', description: 'Call this when the question needs a different model than the one in use: "opus" for complex multi-step analysis, audits, forecasts, long reasoning over many records; "haiku" when the owner only wants something trivial. After calling, tell the owner in one sentence why, and stop; the screen shows a switch button.', input_schema: obj({ to: { type: 'string', enum: ['haiku', 'sonnet', 'opus'] }, reason: str('one short reason') }, ['to', 'reason']) },
  run: async ({ to, reason }) => ({ suggested: to, reason }) }

export const TOOLS: ToolSpec[] = [...READ, ...LOW, ...MONEY, META]
export const TOOL_BY_NAME = new Map(TOOLS.map(t => [t.def.name, t]))
export const toolDefs = (): ToolDef[] => TOOLS.map(t => t.def)
