import { NextRequest } from 'next/server'
import { apiHandler, getSession, ok, err } from '@/lib/api'
import { readTable } from '@/lib/supabase-db'
import { earnedForGuarantor } from '@/lib/guarantorEarned'
import { getBranchAccess, canSeeGuarantor, guarantorBranchMap } from '@/lib/branchAccess'
import { getTodayIST, getThisSaturday, getNextSaturday, addDaysIST } from '@/lib/dateUtils'

export const maxDuration = 30

export const GET = apiHandler(async (req: NextRequest) => {
  const session = await getSession(req)

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Dashboard timeout')), 25000)
  )

  let leads: any[], loans: any[], repayments: any[], customers: any[], notifications: any[], agents: any[], guarantors: any[], capital: any[]
  try {
    ;[leads, loans, repayments, customers, notifications, agents, guarantors, capital] = await Promise.race([
      Promise.all([
        readTable('Leads', { forceFresh: true }), readTable('Loans', { forceFresh: true }), readTable('Repayments', { forceFresh: true }),
        readTable('Customers', { forceFresh: true }), readTable('Notifications', { forceFresh: true }), readTable('Agents', { forceFresh: true }), readTable('Guarantors', { forceFresh: true }), readTable('Capital', { forceFresh: true }),
      ]),
      timeout,
    ])
  } catch {
    return err('Dashboard data unavailable — Google Sheets is not responding. Please try again.')
  }

  const today = getTodayIST()
  const thisMonth = today.slice(0, 7)

  // Everything on the dashboard is limited to the viewer's own scope: Admin all, Guarantor own, agent assigned, Staff their branches
  const allLoans = loans
  const meG = session.role === 'Guarantor' ? guarantors.find(g => g['User ID'] === session.userId) : null
  const meA = session.role === 'NGF AGENT' ? agents.find(a => a['User ID'] === session.userId) : null
  let staffSees: (guarantorId: string) => boolean = () => false
  if (session.role === 'Staff') {
    const [access, gMap] = await Promise.all([getBranchAccess(session), guarantorBranchMap()])
    staffSees = gid => canSeeGuarantor(access, gMap, gid)
  }
  if (session.role !== 'Admin') {
    loans = allLoans.filter(l => session.role === 'Guarantor' ? !!meG && l['Guarantor ID'] === meG['Guarantor ID']
      : session.role === 'NGF AGENT' ? !!meA && l['Assigned Agent ID'] === meA['Agent ID']
      : session.role === 'Staff' ? staffSees(l['Guarantor ID']) : false)
    const scopedIds = new Set(loans.map(l => l['Loan ID']))
    repayments = repayments.filter(r => scopedIds.has(r['Loan ID']))
    const scopedCustomers = new Set(loans.map(l => l['Customer ID']))
    customers = customers.filter(c => scopedCustomers.has(c['Customer ID']) || (!!meG && c['Guarantor ID'] === meG['Guarantor ID']))
    leads = leads.filter(l => session.role === 'Guarantor' ? !!meG && l['Guarantor ID'] === meG['Guarantor ID']
      : session.role === 'NGF AGENT' ? !!meA && l['Assigned Agent ID'] === meA['Agent ID']
      : staffSees(l['Guarantor ID']))
  }
  // a customer with an active loan anywhere is not renewal-eligible
  const activeCustomerIds = new Set(allLoans.filter(l => l['Status'] === 'Active').map(l => l['Customer ID']))

  const overdueSet = new Set(
    repayments.filter(r => r['Status'] === 'Pending' && r['Due Date'] < today).map(r => r['Loan ID'])
  )
  const activeLoans = loans.filter(l => l['Status'] === 'Active')
  const completedLoans = loans.filter(l => l['Status'] === 'Completed')

  // loans, repayments, customers and leads are already limited to the viewer's scope above
  const myLoans = activeLoans
  const myCompletedLoans = completedLoans

  // renewal eligible = completed loans where customer has no active loan
  const renewalEligible = myCompletedLoans.filter(l => !activeCustomerIds.has(l['Customer ID'])).length

  // guarantor-specific
  const myGuarantor = session.role === 'Guarantor' ? guarantors.find(g => g['User ID'] === session.userId) : null
  const commissionEarned = myGuarantor ? earnedForGuarantor(loans, myGuarantor['Guarantor ID']) : 0

  // agent-specific
  const myAgent = session.role === 'NGF AGENT' ? agents.find(a => a['User ID'] === session.userId) : null
  const assignedVerifications = myAgent
    ? leads.filter(l => l['Assigned Agent ID'] === myAgent['Agent ID'] && l['Status'] === 'Agent Assigned').length
    : 0
  const todayDue = myAgent
    ? repayments.filter(r => r['Status'] === 'Pending' && r['Due Date'] === today &&
        myLoans.some(l => l['Loan ID'] === r['Loan ID'])).length
    : 0

  // Collection trend chart — continuous daily series (last 14 days), 0-filled so the
  // line has a real time axis with spikes on collection days
  const SERIES_DAYS = 14
  const weeklyCollections: Record<string, number> = {}
  for (let i = SERIES_DAYS - 1; i >= 0; i--) {
    const d = addDaysIST(today, -i)
    weeklyCollections[d] = 0
  }
  repayments
    .filter(r => r['Status'] === 'Paid')
    .forEach(r => {
      const d = (r['Paid Date'] || '').slice(0, 10)
      if (d in weeklyCollections) weeklyCollections[d] += Number(r['Amount'] || 0)
    })
  // collected in the last 7 days (for the agent "this week" card)
  const weekAgoStr = addDaysIST(today, -6)

  // This week collection = total due to collect on the coming Saturday (IST),
  // for collectible loans only (skip waived weeks and closed/completed loans)
  const comingSaturday = getNextSaturday()
  const inactiveLoanIds = new Set(
    loans.filter(l => l['Status'] === 'Closed' || l['Status'] === 'Completed').map(l => l['Loan ID'])
  )
  const saturdayDue = repayments.filter(r =>
    r['Due Date'] === comingSaturday &&
    r['Status'] !== 'Waived' &&
    !inactiveLoanIds.has(r['Loan ID'])
  )
  const myLoanIds = new Set(myLoans.map(l => l['Loan ID']))
  const scopedSaturdayDue = saturdayDue.filter(r => myLoanIds.has(r['Loan ID']))
  const thisWeekCollection = scopedSaturdayDue.reduce((s, r) => s + Number(r['Amount'] || 0), 0)
  const weekCollected = repayments
    .filter(r => r['Status'] === 'Paid' && (r['Paid Date'] || '') >= weekAgoStr)
    .reduce((s, r) => s + Number(r['Amount'] || 0), 0)

  // total loan amount (principal of active loans)
  const totalLoanAmount = myLoans.reduce((s, l) => s + Number(l['Principal Amount'] || 0), 0)

  // month collected
  const monthCollected = repayments
    .filter(r => r['Status'] === 'Paid' && r['Paid Date'].startsWith(thisMonth))
    .reduce((s, r) => s + Number(r['Amount'] || 0), 0)

  // recollection rate = collected ÷ everything that has come due (by amount)
  const dueReps = repayments.filter(r => r['Due Date'] <= today && r['Status'] !== 'Waived')
  const dueAmount = dueReps.reduce((s, r) => s + Number(r['Amount'] || 0), 0)
  const collectedAmount = dueReps.filter(r => r['Status'] === 'Paid').reduce((s, r) => s + Number(r['Amount'] || 0), 0)
  const recollectionRate = dueAmount ? Math.round((collectedAmount / dueAmount) * 1000) / 10 : 100
  const collectedCount = dueReps.filter(r => r['Status'] === 'Paid').length
  const pendingCount = dueReps.length - collectedCount

  // capital (admin) — interest & commission deducted upfront at disbursement.
  // Interest (gross) booked upfront, sits in its own bucket, not in Available.
  const totalCapital = capital.reduce((s, c) => s + Number(c['Amount'] || 0), 0)
  const investorMoney = capital.filter(c => c['Type'] === 'Investor').reduce((s, c) => s + Number(c['Amount'] || 0), 0)
  const totalInterest = loans.reduce((s, l) => s + Number(l['Interest Deduction'] || 0), 0)
  const totalPrincipal = loans.reduce((s, l) => s + Number(l['Principal Amount'] || 0), 0)
  const totalCollected = repayments.filter(r => r['Status'] === 'Paid').reduce((s, r) => s + Number(r['Amount'] || 0), 0)
  const availableCapital = totalCapital - totalPrincipal + totalCollected

  // lead funnel
  const leadFunnel: Record<string, number> = {}
  const myLeads = session.role === 'Guarantor' && myGuarantor
    ? leads.filter(l => l['Guarantor ID'] === myGuarantor['Guarantor ID'])
    : leads
  myLeads.forEach(l => { leadFunnel[l['Status']] = (leadFunnel[l['Status']] || 0) + 1 })

  // notifications
  const myNotifications = notifications
    .filter(n => n['Is Read'] === 'false' && (n['User ID'] === session.userId || (!n['User ID'] && n['Role'] === session.role)))
    .slice(0, 5)
    .map(n => ({ notificationId: n['Notification ID'], title: n['Title'], message: n['Message'], createdAt: n['Created At'] }))

  return ok({
    metrics: {
      activeLoans: myLoans.length,
      overdueLoans: myLoans.filter(l => overdueSet.has(l['Loan ID'])).length,
      completedLoans: myCompletedLoans.length,
      renewalEligible,
      activeCustomers: customers.filter(c => c['Status'] === 'Active').length,
      pendingLeads: myLeads.filter(l => l['Status'] === 'Pending').length,
      monthCollected,
      totalLoanAmount,
      thisWeekCollection,
      commissionEarned,
      assignedVerifications,
      todayDue,
      weekCollected,
      // Capital, investor and interest totals are company-wide, so Admin only (Staff see their branches' figures above)
      ...(session.role === 'Admin' ? { totalCapital, investorMoney, totalInterest, availableCapital } : {}),
      recollectionRate,
      collectedCount,
      pendingCount,
    },
    weeklyCollections,
    leadFunnel,
    notifications: myNotifications,
  })
})
