import { getSupabase } from '@/lib/supabase-db'
import { getTodayIST, addDaysIST } from '@/lib/dateUtils'

// The page Oreo opens when you ask about one part of the business: how that part works, as columns of boxes joined by lines
// (who feeds it, what it holds, what comes out), with this moment's real numbers.
export type Level = 'calm' | 'info' | 'attention' | 'urgent'
export type TNode = { id: string; label: string; value: string; sub: string; level: Level; bar: number }
export type Topic = { key: string; title: string; line: string; page: string; columns: { title: string; nodes: TNode[] }[]; links: [string, string][] }

const sb = () => getSupabase()
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`
const sum = (rows: { amount?: number | string | null }[] | null) => (rows || []).reduce((t, r) => t + Number(r.amount || 0), 0)
const sat = (d: string) => { const dow = new Date(`${d}T00:00:00Z`).getUTCDay(); return addDaysIST(d, (6 - dow + 7) % 7) }
const startUtc = (ymd: string) => new Date(`${ymd}T00:00:00+05:30`).toISOString()
const nice = (s: string) => String(s || '').replace(/_/g, ' ').trim()
const short = (s: string, n = 22) => { const t = String(s || '').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t }
const node = (id: string, label: string, value: string | number, sub: string, level: Level = 'calm', bar = 0): TNode => ({ id, label: short(label), value: String(value), sub, level, bar: Math.max(0, Math.min(1, bar)) })

async function guarantorMap() {
  const { data } = await sb().from('guarantors').select('guarantor_id, name, code, status')
  return new Map((data || []).map(g => [g.guarantor_id as string, { name: String(g.name || '').trim(), code: String(g.code || ''), status: String(g.status || '') }]))
}

async function collection(): Promise<Topic> {
  const today = getTodayIST(), due = sat(today), monday = addDaysIST(today, -6)
  const [gm, br, gb, roles, loans, dueRows, overdueRows, paidRows] = await Promise.all([
    guarantorMap(),
    sb().from('branches').select('branch_id, name').eq('status', 'Active'),
    sb().from('guarantor_branches').select('guarantor_id, branch_id').eq('is_active', true),
    sb().from('branch_staff_roles').select('user_id, branch_id, role_in_branch').eq('is_active', true),
    sb().from('loans').select('loan_id, guarantor_id').eq('status', 'Active').limit(5000),
    sb().from('repayments').select('loan_id, amount').eq('status', 'Pending').eq('due_date', due).limit(5000),
    sb().from('repayments').select('loan_id, amount').eq('status', 'Pending').lt('due_date', today).limit(5000),
    sb().from('repayments').select('loan_id, amount, collection_agent_id').eq('status', 'Paid').gte('paid_date', monday).lte('paid_date', today).limit(5000),
  ])
  const lg = new Map((loans.data || []).map(l => [l.loan_id as string, l.guarantor_id as string]))
  const uids = [...new Set((roles.data || []).map(r => r.user_id as string))]
  const [users, logs] = await Promise.all([
    uids.length ? sb().from('users').select('user_id, name').in('user_id', uids) : Promise.resolve({ data: [] as { user_id: string; name: string }[] }),
    uids.length ? sb().from('logs').select('user_id').in('user_id', uids).gte('created_at', startUtc(monday)).limit(5000) : Promise.resolve({ data: [] as { user_id: string }[] }),
  ])
  const un = new Map((users.data || []).map(u => [u.user_id as string, String(u.name || '').trim()]))
  const totalDue = sum(dueRows.data), totalPaid = sum(paidRows.data), totalOver = sum(overdueRows.data)
  const gNodes = [...gm.entries()].map(([id, g]) => {
    const mine = (loans.data || []).filter(l => l.guarantor_id === id).length
    const d = (dueRows.data || []).filter(r => lg.get(r.loan_id) === id), o = (overdueRows.data || []).filter(r => lg.get(r.loan_id) === id), p = (paidRows.data || []).filter(r => lg.get(r.loan_id) === id)
    return { id, g, mine, dueAmt: sum(d), dueN: d.length, over: sum(o), paid: sum(p) }
  }).filter(x => x.mine > 0 || x.dueN).sort((a, b) => b.mine - a.mine).slice(0, 6)
  const cols: Topic['columns'] = [
    { title: 'Branch', nodes: (br.data || []).map(b => node(`b-${b.branch_id}`, b.name, (gb.data || []).filter(x => x.branch_id === b.branch_id).length, 'guarantors in this branch', 'info', 1)) },
    { title: 'Guarantors', nodes: gNodes.map(x => node(`g-${x.id}`, `${x.g.name} (${x.g.code})`, inr(x.dueAmt), `${x.mine} loans · ${x.dueN} due ${due.slice(5)}${x.over ? ` · ${inr(x.over)} overdue` : ''}`, x.over ? 'attention' : 'calm', x.dueAmt + x.paid > 0 ? x.paid / (x.dueAmt + x.paid) : 0)) },
    { title: 'Staff', nodes: (roles.data || []).map(r => {
      const recorded = (paidRows.data || []).filter(p => p.collection_agent_id === r.user_id).length, acts = (logs.data || []).filter(l => l.user_id === r.user_id).length
      return node(`s-${r.user_id}`, un.get(r.user_id as string) || 'Staff', recorded, `${nice(r.role_in_branch)} · ${recorded} payments recorded · ${acts} actions this week`, 'calm', Math.min(1, acts / 40))
    }) },
    { title: 'Result', nodes: [
      node('due', `Due ${due.slice(5)}`, inr(totalDue), `${(dueRows.data || []).length} weekly payments to collect`, 'info', totalDue / Math.max(1, totalDue + totalPaid)),
      node('paid', 'Collected this week', inr(totalPaid), `${(paidRows.data || []).length} payments recorded`, 'calm', totalPaid / Math.max(1, totalDue + totalPaid)),
      node('over', 'Overdue', inr(totalOver), `${(overdueRows.data || []).length} weeks not paid`, totalOver ? 'urgent' : 'calm', totalOver / Math.max(1, totalDue + totalOver)),
    ] },
  ]
  const links: Topic['links'] = []
  cols[0].nodes.forEach(b => cols[1].nodes.forEach(g => links.push([b.id, g.id])))
  cols[1].nodes.forEach(g => links.push([g.id, 'due']))
  cols[2].nodes.forEach(s => links.push([s.id, 'paid']))
  links.push(['due', 'paid'], ['due', 'over'])
  return { key: 'collection', title: 'Collection', line: `${gNodes.length} guarantors, ${cols[2].nodes.length} staff, due ${due.slice(5)}`, page: 'collection', columns: cols, links }
}

async function leadsFlow(kind: 'leads' | 'verification' | 'approval'): Promise<Topic> {
  const today = getTodayIST(), since = startUtc(addDaysIST(today, -30))
  const [gm, leads, agents, trips] = await Promise.all([
    guarantorMap(),
    sb().from('leads').select('lead_id, customer_name, place, guarantor_id, status, assigned_agent_id, submitted_date, verification_submitted_date, updated_at').in('status', ['Pending', 'Agent Assigned', 'Verification In Progress', 'Verification Submitted', 'Returned']).order('submitted_date', { ascending: false }).limit(300),
    sb().from('agents').select('agent_id, name, agent_type, status').eq('status', 'Active'),
    sb().from('agent_trips').select('agent_id').gte('trip_date', addDaysIST(today, -6)).limit(2000),
  ])
  const L = leads.data || [], by = (s: string[]) => L.filter(l => s.includes(l.status as string))
  const pend = by(['Pending']), prog = by(['Agent Assigned', 'Verification In Progress']), subm = by(['Verification Submitted']), ret = by(['Returned'])
  const gname = (id: string) => gm.get(id)?.name || 'Guarantor'
  const days = (d?: string | null) => d ? Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 86400000)) : 0
  if (kind === 'leads') {
    const per = [...new Set(L.map(l => l.guarantor_id as string))].map(id => ({ id, n: L.filter(l => l.guarantor_id === id).length })).sort((a, b) => b.n - a.n).slice(0, 5)
    const mx = Math.max(1, L.length)
    return { key: 'leads', title: 'Leads', line: `${L.length} open leads from ${per.length} guarantors`, page: 'leads', columns: [
      { title: 'Guarantors sending leads', nodes: per.map(p => node(`g-${p.id}`, gname(p.id), p.n, 'open leads', 'calm', p.n / mx)) },
      { title: 'Where the leads are', nodes: [node('pend', 'New', pend.length, 'not yet assigned to an agent', pend.length ? 'info' : 'calm', pend.length / mx), node('prog', 'Being verified', prog.length, 'an agent is checking them', 'calm', prog.length / mx), node('subm', 'Waiting for you', subm.length, 'verification done', subm.length ? 'attention' : 'calm', subm.length / mx), node('ret', 'Returned', ret.length, 'back to the guarantor to fix', ret.length ? 'info' : 'calm', ret.length / mx)] },
      { title: 'Field agents', nodes: (agents.data || []).map(a => node(`a-${a.agent_id}`, a.name, L.filter(l => l.assigned_agent_id === a.agent_id).length, `${a.agent_type || 'Agent'} · ${(trips.data || []).filter(t => t.agent_id === a.agent_id).length} trips this week`, 'calm', 0)) },
    ], links: [...per.flatMap(p => [[`g-${p.id}`, 'pend'] as [string, string]]), ['pend', 'prog'], ['prog', 'subm'], ['ret', 'pend'], ...(agents.data || []).map(a => [`a-${a.agent_id}`, 'prog'] as [string, string])] }
  }
  if (kind === 'verification') {
    const mx = Math.max(1, prog.length)
    return { key: 'verification', title: 'Verification', line: `${prog.length} being checked, ${subm.length} submitted`, page: 'routes', columns: [
      { title: 'Field agents', nodes: (agents.data || []).map(a => node(`a-${a.agent_id}`, a.name, prog.filter(l => l.assigned_agent_id === a.agent_id).length, `${a.agent_type || 'Agent'} · ${(trips.data || []).filter(t => t.agent_id === a.agent_id).length} trips this week`, 'calm', prog.filter(l => l.assigned_agent_id === a.agent_id).length / mx)) },
      { title: 'Leads being verified', nodes: prog.slice(0, 6).map(l => node(`l-${l.lead_id}`, l.customer_name as string, `${days(l.submitted_date as string)}d`, `${l.place || 'no place'} · ${gname(l.guarantor_id as string)}`, days(l.submitted_date as string) > 7 ? 'attention' : 'calm', 0)) },
      { title: 'Result', nodes: [node('subm', 'Submitted', subm.length, 'waiting for your decision', subm.length ? 'attention' : 'calm', subm.length / Math.max(1, subm.length + prog.length)), node('rest', 'Still in progress', prog.length, 'with the agents', 'info', prog.length / Math.max(1, subm.length + prog.length))] },
    ], links: [...prog.slice(0, 6).flatMap(l => { const r: [string, string][] = [[`l-${l.lead_id}`, 'rest']]; if (l.assigned_agent_id) r.push([`a-${l.assigned_agent_id}`, `l-${l.lead_id}`]); return r }), ['rest', 'subm']] }
  }
  const [dec] = await Promise.all([sb().from('leads').select('status').in('status', ['Approved', 'Rejected', 'Returned', 'Converted']).gte('updated_at', since).limit(2000)])
  const cnt = (s: string) => (dec.data || []).filter(l => l.status === s).length
  return { key: 'approval', title: 'Approval', line: subm.length ? `${subm.length} waiting for you` : 'Nothing waiting for you', page: 'leads', columns: [
    { title: 'Verified leads', nodes: subm.slice(0, 6).map(l => node(`l-${l.lead_id}`, l.customer_name as string, `${days((l.verification_submitted_date || l.updated_at) as string)}d`, `${gname(l.guarantor_id as string)} · waiting`, 'attention', 0)) },
    { title: 'Your decision', nodes: [node('wait', 'Waiting for you', subm.length, 'verified, not decided', subm.length ? 'attention' : 'calm', 1)] },
    { title: 'Last 30 days', nodes: [node('ok', 'Approved or paid', cnt('Approved') + cnt('Converted'), 'went forward', 'calm', 0), node('rej', 'Rejected', cnt('Rejected'), 'stopped', 'info', 0), node('ret2', 'Returned', cnt('Returned'), 'sent back to fix', 'info', 0)] },
  ], links: [...subm.slice(0, 6).map(l => [`l-${l.lead_id}`, 'wait'] as [string, string]), ['wait', 'ok'], ['wait', 'rej'], ['wait', 'ret2']] }
}

async function disbursement(): Promise<Topic> {
  const today = getTodayIST(), monday = addDaysIST(today, -6)
  const [gm, approved, batches, lines, done] = await Promise.all([
    guarantorMap(),
    sb().from('leads').select('lead_id, customer_name, guarantor_id, bank_verified_at, loan_product').eq('status', 'Approved').is('disbursed_at', null).limit(100),
    sb().from('bank_payout_batches').select('batch_id, file_name, kind, lead_count, total_amount, status').eq('status', 'created').limit(20),
    sb().from('bank_payout_lines').select('lead_id, batch_id').is('disbursed_at', null).limit(500),
    sb().from('loans').select('loan_id, net_disbursed').gte('created_at', startUtc(monday)).limit(500),
  ])
  const A = approved.data || [], inFile = new Set((lines.data || []).map(l => l.lead_id as string))
  const verified = A.filter(l => l.bank_verified_at).length
  const doneAmt = (done.data || []).reduce((t, r) => t + Number(r.net_disbursed || 0), 0)
  return { key: 'disbursement', title: 'Disbursement', line: `${A.length} approved, ${(batches.data || []).length} bank files live`, page: 'leads', columns: [
    { title: 'Approved, to be paid', nodes: A.slice(0, 6).map(l => node(`l-${l.lead_id}`, l.customer_name as string, l.bank_verified_at ? 'ready' : 'bank?', `${gm.get(l.guarantor_id as string)?.name || ''} · ${inFile.has(l.lead_id as string) ? 'in a bank file' : l.bank_verified_at ? 'ready for a file' : 'bank details not verified'}`, l.bank_verified_at ? 'calm' : 'attention', 0)) },
    { title: 'Bank files', nodes: (batches.data || []).length ? (batches.data || []).slice(0, 4).map(b => node(`b-${b.batch_id}`, b.file_name as string, inr(Number(b.total_amount || 0)), `${b.lead_count} customers · ${b.kind}`, 'info', 0)) : [node('nofile', 'No file made yet', verified, `${verified} customers ready for one`, verified ? 'attention' : 'calm', 0)] },
    { title: 'Paid out this week', nodes: [node('paid', 'Loans started', (done.data || []).length, `${inr(doneAmt)} handed over`, 'calm', 0)] },
  ], links: [...A.slice(0, 6).flatMap(l => { const r: [string, string][] = []; const b = (lines.data || []).find(x => x.lead_id === l.lead_id); r.push([`l-${l.lead_id}`, b ? `b-${b.batch_id}` : (batches.data || []).length ? `b-${(batches.data || [])[0].batch_id}` : 'nofile']); return r }), ...((batches.data || []).length ? (batches.data || []).slice(0, 4).map(b => [`b-${b.batch_id}`, 'paid'] as [string, string]) : [['nofile', 'paid'] as [string, string]])] }
}

async function loans(): Promise<Topic> {
  const today = getTodayIST()
  const [gm, br, gb, ln, over] = await Promise.all([
    guarantorMap(), sb().from('branches').select('branch_id, name').eq('status', 'Active'), sb().from('guarantor_branches').select('guarantor_id, branch_id').eq('is_active', true),
    sb().from('loans').select('loan_id, guarantor_id, status, principal_amount, weekly_collection_amount').in('status', ['Active', 'Closed', 'Completed']).limit(5000),
    sb().from('repayments').select('loan_id').eq('status', 'Pending').lt('due_date', today).limit(5000),
  ])
  const L = ln.data || [], act = L.filter(l => l.status === 'Active'), overdueLoans = new Set((over.data || []).map(r => r.loan_id as string))
  const per = [...gm.entries()].map(([id, g]) => ({ id, g, n: act.filter(l => l.guarantor_id === id).length })).filter(x => x.n).sort((a, b) => b.n - a.n).slice(0, 6)
  const sizes = [...new Set(act.map(l => Number(l.principal_amount)))].sort((a, b) => a - b)
  return { key: 'loans', title: 'Loans', line: `${act.length} active loans`, page: 'customers', columns: [
    { title: 'Branch', nodes: (br.data || []).map(b => node(`b-${b.branch_id}`, b.name, act.length, `${(gb.data || []).filter(x => x.branch_id === b.branch_id).length} guarantors`, 'info', 1)) },
    { title: 'Guarantors', nodes: per.map(p => node(`g-${p.id}`, `${p.g.name} (${p.g.code})`, p.n, `${act.filter(l => l.guarantor_id === p.id && overdueLoans.has(l.loan_id as string)).length} with overdue weeks`, act.some(l => l.guarantor_id === p.id && overdueLoans.has(l.loan_id as string)) ? 'attention' : 'calm', p.n / Math.max(1, act.length))) },
    { title: 'Loan sizes', nodes: sizes.slice(0, 5).map(s => node(`s-${s}`, inr(s), act.filter(l => Number(l.principal_amount) === s).length, `${inr(Number(act.find(l => Number(l.principal_amount) === s)?.weekly_collection_amount || 0))} a week`, 'calm', act.filter(l => Number(l.principal_amount) === s).length / Math.max(1, act.length))) },
    { title: 'Health', nodes: [node('ok', 'On time', act.filter(l => !overdueLoans.has(l.loan_id as string)).length, 'no unpaid weeks', 'calm', 0), node('late', 'Late', act.filter(l => overdueLoans.has(l.loan_id as string)).length, 'at least one unpaid week', overdueLoans.size ? 'attention' : 'calm', 0)] },
  ], links: [...(br.data || []).flatMap(b => per.map(p => [`b-${b.branch_id}`, `g-${p.id}`] as [string, string])), ...per.flatMap(p => sizes.slice(0, 5).filter(s => act.some(l => l.guarantor_id === p.id && Number(l.principal_amount) === s)).map(s => [`g-${p.id}`, `s-${s}`] as [string, string])), ...sizes.slice(0, 5).flatMap(s => [[`s-${s}`, 'ok'], [`s-${s}`, 'late']] as [string, string][])] }
}

async function payments(): Promise<Topic> {
  const today = getTodayIST(), since = startUtc(addDaysIST(today, -7))
  const [gm, chat, ev] = await Promise.all([
    guarantorMap(),
    sb().from('payment_chat').select('guarantor_id, status').gte('created_at', since).limit(3000),
    sb().from('payment_events').select('actor_name, event').gte('created_at', startUtc(addDaysIST(today, -14))).limit(1000),
  ])
  const C = chat.data || [], st = (f: (s: string) => boolean) => C.filter(c => f(String(c.status))).length
  const fix = ['Needs Retake', 'Duplicate', 'Amount Mismatch', 'Wrong Payee', 'Not Successful', 'Resubmit']
  const per = [...new Set(C.map(c => c.guarantor_id as string))].map(id => ({ id, n: C.filter(c => c.guarantor_id === id).length })).sort((a, b) => b.n - a.n).slice(0, 5)
  const actors = [...new Set((ev.data || []).map(e => String(e.actor_name || 'System')))].map(a => ({ a, n: (ev.data || []).filter(e => String(e.actor_name || 'System') === a).length })).sort((x, y) => y.n - x.n).slice(0, 4)
  const mx = Math.max(1, C.length)
  return { key: 'payments', title: 'Payments', line: `${C.length} screenshots in the last 7 days`, page: 'payments', columns: [
    { title: 'Guarantors sending', nodes: per.map(p => node(`g-${p.id}`, gm.get(p.id)?.name || 'Guarantor', p.n, 'screenshots this week', 'calm', p.n / mx)) },
    { title: 'What happened', nodes: [node('rec', 'Recorded', st(s => s === 'Recorded'), 'matched and saved', 'calm', st(s => s === 'Recorded') / mx), node('pend', 'With staff', st(s => s === 'Pending Staff'), 'staff must check', st(s => s === 'Pending Staff') ? 'urgent' : 'calm', st(s => s === 'Pending Staff') / mx), node('fix', 'Needs a fix', st(s => fix.includes(s)), 'wrong amount, payee, retake…', st(s => fix.includes(s)) ? 'attention' : 'calm', st(s => fix.includes(s)) / mx)] },
    { title: 'Staff actions (14 days)', nodes: actors.map(x => node(`a-${x.a}`, x.a, x.n, 'payment actions', 'calm', 0)) },
  ], links: [...per.flatMap(p => [[`g-${p.id}`, 'rec'], [`g-${p.id}`, 'pend']] as [string, string][]), ...actors.map(x => [`a-${x.a}`, 'rec'] as [string, string]), ['pend', 'fix']] }
}

export async function buildTopic(key: string): Promise<Topic | null> {
  switch (key) {
    case 'collection': return collection()
    case 'leads': case 'verification': case 'approval': return leadsFlow(key)
    case 'disbursement': return disbursement()
    case 'loans': return loans()
    case 'payments': return payments()
    default: return null
  }
}
