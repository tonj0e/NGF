import { NextRequest } from 'next/server'
import { apiHandler, getSession, requireRole, ok, err } from '@/lib/api'
import { needFeature } from '@/lib/access'
import { readTable, selectRows, selectAll, getRowById, updateById, findRecord, formatDateYmd, addDays, nowIso, invalidateCache } from '@/lib/supabase-db'
import { getTodayIST, addDaysIST } from '@/lib/dateUtils'
import { guarantorCanSeeCommissions } from '@/lib/commissions'
import { getBranchAccess, canSeeGuarantor, guarantorBranchMap } from '@/lib/branchAccess'
import { pageQuery, byIds, chunk, cleanSearch, scopeOf, withScope } from '@/lib/db'
import type { TableName } from '@/lib/supabase-db'

// GET /api/loans?filter=all|active|completed|overdue|renewal
//   &page=1&pageSize=50&q=text   one page, filtered and searched in the database (newest first), with `total`
//   (no page)                    every loan in the caller's scope: a guarantor's or agent's own few hundred
// Only the rows on the page are enriched with customer, guarantor, agent, lead and payment counts.
export const GET = apiHandler(async (req: NextRequest) => {
  const session = await getSession(req)
  await needFeature(session, [])
  const sp = new URL(req.url).searchParams
  const filter = sp.get('filter') || 'all'
  const paged = sp.has('page')

  let scope = await scopeOf(session)
  let agentId = ''
  if (session.role === 'NGF AGENT') {
    const a = (await readTable('Agents')).find(x => x['User ID'] === session.userId)
    agentId = a?.['Agent ID'] || '__none__'
    scope = { kind: 'all' }
  }

  // search: loan id / account number, or the customers whose name or phone match
  const text = cleanSearch(sp.get('q'))
  let matchCustomerIds: string[] = []
  if (text) {
    const found = await selectRows('Customers', qb => qb.or(`name.ilike.%${text}%,phone.ilike.%${text}%`).limit(200))
    matchCustomerIds = found.rows.map(c => c['Customer ID'])
  }
  const source: TableName = filter === 'overdue' ? 'LoansOverdue' : filter === 'renewal' ? 'LoansRenewalEligible' : 'Loans'
  // optional: only loans created in a date range (the Disbursements weeks)
  const createdFrom = /^\d{4}-\d{2}-\d{2}$/.test(sp.get('createdFrom') || '') ? sp.get('createdFrom')! : ''
  const createdTo = /^\d{4}-\d{2}-\d{2}$/.test(sp.get('createdTo') || '') ? sp.get('createdTo')! : ''
  const filters = (qb: any) => {
    let q = withScope(qb, scope)
    if (agentId) q = q.eq('assigned_agent_id', agentId)
    if (createdFrom) q = q.gte('created_at', `${createdFrom}T00:00:00Z`)
    if (createdTo) q = q.lt('created_at', `${addDaysIST(createdTo, 1)}T00:00:00Z`)
    if (filter === 'active') q = q.eq('status', 'Active')
    else if (filter === 'completed') q = q.eq('status', 'Completed')
    if (text) q = q.or([`loan_id.ilike.%${text}%`, `loan_account_no.ilike.%${text}%`, ...(matchCustomerIds.length ? [`customer_id.in.(${matchCustomerIds.join(',')})`] : [])].join(','))
    return q
  }
  const order = [{ column: 'created_at', ascending: false }, { column: 'loan_id' }]

  let loans: Record<string, string>[] = []
  let total = 0, page = 1, pageSize = 0, totalPages = 1
  if (paged) {
    const r = await pageQuery(source, { filters, order, page: sp.get('page'), pageSize: sp.get('pageSize') })
    loans = r.rows; total = r.total; page = r.page; pageSize = r.pageSize; totalPages = r.totalPages
  } else {
    for (let pg = 1; ; pg++) {
      const r = await pageQuery(source, { filters, order, page: pg, pageSize: 200 })
      loans.push(...r.rows)
      if (pg >= r.totalPages) { total = r.total; break }
    }
  }

  const rows = await enrichLoans(loans, session)
  return ok(paged ? { loans: rows, total, page, pageSize, totalPages } : { loans: rows })
})

async function enrichLoans(loans: Record<string, string>[], session: Awaited<ReturnType<typeof getSession>>) {
  if (!loans.length) return []
  const today = getTodayIST()
  const loanIds = loans.map(l => l['Loan ID'])
  const customerIds = loans.map(l => l['Customer ID'])
  const [customers, allOfCustomers, guarantors, agents, leads, repayments, showCommission] = await Promise.all([
    byIds('Customers', 'customer_id', customerIds),
    byIds('Loans', 'customer_id', customerIds),
    byIds('Guarantors', 'guarantor_id', loans.map(l => l['Guarantor ID'])),
    byIds('Agents', 'agent_id', loans.map(l => l['Assigned Agent ID'])),
    byIds('Leads', 'lead_id', loans.map(l => l['Lead ID'])),
    Promise.all(chunk(loanIds).map(part => selectAll('Repayments', qb => qb.in('loan_id', part).in('status', ['Paid', 'Pending'])))),
    guarantorCanSeeCommissions(session),
  ])
  const cById = new Map(customers.map(c => [c['Customer ID'], c]))
  const gById = new Map(guarantors.map(g => [g['Guarantor ID'], g]))
  const aById = new Map(agents.map(a => [a['Agent ID'], a]))
  const leadById = new Map(leads.map(l => [l['Lead ID'], l]))
  const activeCustomerIds = new Set(allOfCustomers.filter(l => l['Status'] === 'Active').map(l => l['Customer ID']))
  const noRenewal = new Set(customers.filter(c => String(c['Permanent Block']) === 'true' || String(c['Hold Until'] || '').slice(0, 10) > today).map(c => c['Customer ID']))
  const paid = new Map<string, number>(), overdue = new Set<string>()
  for (const r of repayments.flat()) {
    if (r['Status'] === 'Paid') paid.set(r['Loan ID'], (paid.get(r['Loan ID']) || 0) + 1)
    else if (r['Due Date'] < today) overdue.add(r['Loan ID'])
  }

  return loans.map(l => {
    const c = cById.get(l['Customer ID'])
    const g = gById.get(l['Guarantor ID'])
    const a = aById.get(l['Assigned Agent ID'])
    return {
      loanId: l['Loan ID'], loanAccountNo: l['Loan Account No'] || '', customerId: l['Customer ID'],
      customerName: c?.['Name'] || '', customerPhone: c?.['Phone'] || '',
      customerPhotoUrl: leadById.get(c?.['Lead ID'] || '')?.['Customer Photo URL'] || '',
      guarantorName: g?.['Name'] || '', guarantorCode: g?.['Code'] || '',
      agentName: a?.['Name'] || '',
      principal: l['Principal Amount'], netDisbursed: l['Net Disbursed'],
      guarantorCommission: showCommission ? l['Guarantor Commission'] : '',
      weeklyAmount: l['Weekly Collection Amount'], durationWeeks: l['Duration Weeks'],
      totalCollection: l['Total Collection Amount'],
      status: l['Status'], startDate: l['Start Date'], endDate: l['End Date'],
      createdAt: l['Created At'], leadId: l['Lead ID'],
      isRenewal: leadById.get(l['Lead ID'])?.['Loan Product'] === 'RENEWAL',
      paidWeeks: paid.get(l['Loan ID']) || 0, totalWeeks: Number(l['Duration Weeks']),
      isOverdue: overdue.has(l['Loan ID']),
      isRenewalEligible: l['Status'] === 'Completed' && !activeCustomerIds.has(l['Customer ID']) && !noRenewal.has(l['Customer ID']),
    }
  })
}

export const PATCH = apiHandler(async (req: NextRequest) => {
  await requireRole(req, ['Admin'])
  const body = await req.json()
  const { action, loanId, newStartDate } = body

  if (action === 'foreclose') {
    if (!loanId) return err('loanId required')
    const loan = await getRowById('Loans', loanId)
    if (!loan) return err('Loan not found')
    const repayments = await selectAll('Repayments', qb => qb.eq('loan_id', loanId))

    // Mark loan as Completed
    await updateById('Loans', loanId, { 'Status': 'Completed', 'Updated At': nowIso() })

    // Mark all remaining pending/overdue repayments as Waived
    const pending = repayments.filter(r => r['Loan ID'] === loanId && r['Status'] !== 'Paid')
    for (const r of pending) {
      await updateById('Repayments', r['Repayment ID'], { 'Status': 'Waived', 'Updated At': nowIso() })
    }

    // Clear Active Loan ID on customer record
    const customer = await getRowById('Customers', loan['Customer ID'])
    if (customer) {
      await updateById('Customers', customer['Customer ID'], { 'Active Loan ID': '', 'Updated At': nowIso() })
    }

    invalidateCache('Loans')
    invalidateCache('Repayments')
    invalidateCache('Customers')
    return ok({ foreclosed: true, waivedWeeks: pending.length })
  }

  if (action === 'settleBalance') {
    if (!loanId) return err('loanId required')
    const loan = await getRowById('Loans', loanId)
    if (!loan) return err('Loan not found')
    const repayments = await selectAll('Repayments', qb => qb.eq('loan_id', loanId))
    const pending = repayments.filter(r => r['Loan ID'] === loanId && r['Status'] !== 'Paid' && r['Status'] !== 'Waived')
    const today = getTodayIST()
    for (const r of pending) {
      await updateById('Repayments', r['Repayment ID'], { 'Status': 'Paid', 'Paid Date': today, 'Notes': 'Balance settled', 'Updated At': nowIso() })
    }
    await updateById('Loans', loanId, { 'Status': 'Completed', 'Updated At': nowIso() })
    const customer = await getRowById('Customers', loan['Customer ID'])
    if (customer) await updateById('Customers', customer['Customer ID'], { 'Active Loan ID': '', 'Updated At': nowIso() })
    invalidateCache('Loans')
    invalidateCache('Repayments')
    invalidateCache('Customers')
    return ok({ settled: true, settledWeeks: pending.length })
  }

  if (action === 'closeAccount') {
    if (!loanId) return err('loanId required')
    const loan = await getRowById('Loans', loanId)
    if (!loan) return err('Loan not found')
    await updateById('Loans', loanId, { 'Status': 'Closed', 'Updated At': nowIso() })
    invalidateCache('Loans')
    return ok({ closed: true })
  }

  if (action === 'fixDates') {
    if (!loanId || !newStartDate) return err('loanId and newStartDate required')
    const loan = await getRowById('Loans', loanId)
    if (!loan) return err('Loan not found')
    const repayments = await selectAll('Repayments', qb => qb.eq('loan_id', loanId))

    const durationWeeks = Number(loan['Duration Weeks'])
    const start = new Date(newStartDate)
    const end = addDays(start, (durationWeeks - 1) * 7)

    // Update loan start/end dates
    await updateById('Loans', loanId, {
      'Start Date': formatDateYmd(start),
      'End Date': formatDateYmd(end),
      'Updated At': nowIso(),
    })

    // Update each repayment due date in week order
    const loanReps = repayments
      .filter(r => r['Loan ID'] === loanId)
      .sort((a, b) => Number(a['Week No']) - Number(b['Week No']))

    for (let i = 0; i < loanReps.length; i++) {
      const r = loanReps[i]
      const newDue = formatDateYmd(addDays(start, i * 7))
      await updateById('Repayments', r['Repayment ID'], { 'Due Date': newDue, 'Updated At': nowIso() })
    }

    invalidateCache('Loans')
    invalidateCache('Repayments')
    return ok({ fixed: loanReps.length, newStartDate: formatDateYmd(start), newEndDate: formatDateYmd(end) })
  }

  return err('Unknown action')
})
