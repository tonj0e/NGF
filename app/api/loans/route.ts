import { NextRequest } from 'next/server'
import { apiHandler, getSession, requireRole, ok, err } from '@/lib/api'
import { readTable, updateById, findRecord, formatDateYmd, addDays, nowIso, invalidateCache } from '@/lib/supabase-db'
import { getTodayIST } from '@/lib/dateUtils'

export const GET = apiHandler(async (req: NextRequest) => {
  const session = await getSession(req)
  const { searchParams } = new URL(req.url)
  const filter = searchParams.get('filter') || 'all'

  const [loans, customers, guarantors, agents, repayments, leads] = await Promise.all([
    readTable('Loans', { forceFresh: true }), readTable('Customers', { forceFresh: true }), readTable('Guarantors', { forceFresh: true }),
    readTable('Agents', { forceFresh: true }), readTable('Repayments', { forceFresh: true }), readTable('Leads', { forceFresh: true }),
  ])
  // Classify a loan as a renewal when its source lead was a renewal request
  const leadProduct = new Map(leads.map(l => [l['Lead ID'], l['Loan Product']]))

  const today = getTodayIST()
  const overdueSet = new Set(
    repayments.filter(r => r['Status'] === 'Pending' && r['Due Date'] < today).map(r => r['Loan ID'])
  )
  const activeCustomerIds = new Set(
    loans.filter(l => l['Status'] === 'Active').map(l => l['Customer ID'])
  )

  let filtered = loans
  if (session.role === 'Guarantor') {
    const g = guarantors.find(g => g['User ID'] === session.userId)
    filtered = g ? loans.filter(l => l['Guarantor ID'] === g['Guarantor ID']) : []
  } else if (session.role === 'NGF AGENT') {
    const a = agents.find(a => a['User ID'] === session.userId)
    filtered = a ? loans.filter(l => l['Assigned Agent ID'] === a['Agent ID']) : []
  }

  if (filter === 'active') filtered = filtered.filter(l => l['Status'] === 'Active')
  else if (filter === 'completed') filtered = filtered.filter(l => l['Status'] === 'Completed')
  else if (filter === 'overdue') filtered = filtered.filter(l => overdueSet.has(l['Loan ID']))
  else if (filter === 'renewal') filtered = filtered.filter(l => l['Status'] === 'Completed' && !activeCustomerIds.has(l['Customer ID']))

  const rows = filtered.map(l => {
    const c = customers.find(c => c['Customer ID'] === l['Customer ID'])
    const g = guarantors.find(g => g['Guarantor ID'] === l['Guarantor ID'])
    const a = agents.find(a => a['Agent ID'] === l['Assigned Agent ID'])
    const loanRepayments = repayments.filter(r => r['Loan ID'] === l['Loan ID'])
    const paidCount = loanRepayments.filter(r => r['Status'] === 'Paid').length
    return {
      loanId: l['Loan ID'], customerId: l['Customer ID'],
      customerName: c?.['Name'] || '', customerPhone: c?.['Phone'] || '',
      guarantorName: g?.['Name'] || '', guarantorCode: g?.['Code'] || '',
      agentName: a?.['Name'] || '',
      principal: l['Principal Amount'], netDisbursed: l['Net Disbursed'],
      guarantorCommission: l['Guarantor Commission'],
      weeklyAmount: l['Weekly Collection Amount'], durationWeeks: l['Duration Weeks'],
      totalCollection: l['Total Collection Amount'],
      status: l['Status'], startDate: l['Start Date'], endDate: l['End Date'],
      createdAt: l['Created At'], leadId: l['Lead ID'],
      isRenewal: leadProduct.get(l['Lead ID']) === 'RENEWAL',
      paidWeeks: paidCount, totalWeeks: Number(l['Duration Weeks']),
      isOverdue: overdueSet.has(l['Loan ID']),
      isRenewalEligible: l['Status'] === 'Completed' && !activeCustomerIds.has(l['Customer ID']),
    }
  })

  return ok({ loans: rows })
})

export const PATCH = apiHandler(async (req: NextRequest) => {
  await requireRole(req, ['Admin'])
  const body = await req.json()
  const { action, loanId, newStartDate } = body

  if (action === 'foreclose') {
    if (!loanId) return err('loanId required')
    const [loans, repayments, customers] = await Promise.all([
      readTable('Loans'), readTable('Repayments'), readTable('Customers'),
    ])
    const loan = findRecord(loans, 'Loan ID', loanId)
    if (!loan) return err('Loan not found')

    // Mark loan as Completed
    await updateById('Loans', loanId, { 'Status': 'Completed', 'Updated At': nowIso() })

    // Mark all remaining pending/overdue repayments as Waived
    const pending = repayments.filter(r => r['Loan ID'] === loanId && r['Status'] !== 'Paid')
    for (const r of pending) {
      await updateById('Repayments', r['Repayment ID'], { 'Status': 'Waived', 'Updated At': nowIso() })
    }

    // Clear Active Loan ID on customer record
    const customer = customers.find(c => c['Customer ID'] === loan['Customer ID'])
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
    const [loans, repayments, customers] = await Promise.all([
      readTable('Loans'), readTable('Repayments'), readTable('Customers'),
    ])
    const loan = findRecord(loans, 'Loan ID', loanId)
    if (!loan) return err('Loan not found')
    const pending = repayments.filter(r => r['Loan ID'] === loanId && r['Status'] !== 'Paid' && r['Status'] !== 'Waived')
    const today = getTodayIST()
    for (const r of pending) {
      await updateById('Repayments', r['Repayment ID'], { 'Status': 'Paid', 'Paid Date': today, 'Notes': 'Balance settled', 'Updated At': nowIso() })
    }
    await updateById('Loans', loanId, { 'Status': 'Completed', 'Updated At': nowIso() })
    const customer = customers.find(c => c['Customer ID'] === loan['Customer ID'])
    if (customer) await updateById('Customers', customer['Customer ID'], { 'Active Loan ID': '', 'Updated At': nowIso() })
    invalidateCache('Loans')
    invalidateCache('Repayments')
    invalidateCache('Customers')
    return ok({ settled: true, settledWeeks: pending.length })
  }

  if (action === 'closeAccount') {
    if (!loanId) return err('loanId required')
    const loans = await readTable('Loans')
    const loan = findRecord(loans, 'Loan ID', loanId)
    if (!loan) return err('Loan not found')
    await updateById('Loans', loanId, { 'Status': 'Closed', 'Updated At': nowIso() })
    invalidateCache('Loans')
    return ok({ closed: true })
  }

  if (action === 'fixDates') {
    if (!loanId || !newStartDate) return err('loanId and newStartDate required')
    const [loans, repayments] = await Promise.all([readTable('Loans'), readTable('Repayments')])
    const loan = findRecord(loans, 'Loan ID', loanId)
    if (!loan) return err('Loan not found')

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
