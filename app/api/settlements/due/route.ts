import { NextRequest } from 'next/server'
import { apiHandler, requireRole, ok } from '@/lib/api'
import { requireFeature } from '@/lib/access'
import { getBranchAccess, canSeeGuarantor, guarantorBranchMap } from '@/lib/branchAccess'
import { readTable } from '@/lib/supabase-db'

export const GET = apiHandler(async (req: NextRequest) => {
  const session = await requireFeature(req, ['settlements'])
  const { searchParams } = new URL(req.url)
  const saturday = searchParams.get('saturday') || ''
  const all = searchParams.get('all') === 'true'

  const [repayments, loans, guarantors, agents, users, collections, customers] = await Promise.all([
    readTable('Repayments'), readTable('Loans'), readTable('Guarantors'),
    readTable('Agents'), readTable('Users'), readTable('Collections'), readTable('Customers'),
  ])

  // Build a lookup: repaymentId -> payment mode from Collections sheet (authoritative source)
  const collectionModeMap = new Map<string, string>()
  for (const c of collections) {
    if (c['Repayment ID'] && c['Payment Mode']) {
      collectionModeMap.set(c['Repayment ID'], c['Payment Mode'])
    }
  }

  // Loans that are no longer in the active collection cycle (closed, foreclosed, settled,
  // or naturally completed). Their weeks must not surface as fresh settlement activity.
  const inactiveLoanIds = new Set(
    loans.filter(l => l['Status'] === 'Closed' || l['Status'] === 'Completed').map(l => l['Loan ID'])
  )

  let due = repayments
  if (all) {
    // Return all repayments for all Saturdays (past weeks)
    due = repayments.filter(r => {
      if (!r['Due Date']) return false
      if (r['Due Date'] >= saturday && saturday) return false // Only past weeks if saturday is provided
      // Waived weeks (foreclosure) are never collections
      if (r['Status'] === 'Waived') return false
      // For inactive loans, only show weeks that were GENUINELY collected by a real person
      if (inactiveLoanIds.has(r['Loan ID'])) {
        return r['Status'] === 'Paid' && !!r['NGF Agent ID']
      }
      return true
    })
  } else if (saturday) {
    due = repayments.filter(r => {
      if (r['Due Date'] !== saturday) return false
      // Waived weeks (foreclosure) are never collections
      if (r['Status'] === 'Waived') return false
      // For inactive loans, only show weeks that were GENUINELY collected by a real person
      if (inactiveLoanIds.has(r['Loan ID'])) {
        return r['Status'] === 'Paid' && !!r['NGF Agent ID']
      }
      return true
    })
  } else {
    due = []
  }

  // Staff: only weeks of loans whose guarantor belongs to their branches
  if (session.role === 'Staff') {
    const [access, gMap] = await Promise.all([getBranchAccess(session), guarantorBranchMap()])
    const okLoans = new Set(loans.filter(l => canSeeGuarantor(access, gMap, l['Guarantor ID'])).map(l => l['Loan ID']))
    due = due.filter(r => okLoans.has(r['Loan ID']))
  }

  const rows = due.map(r => {
    const loan = loans.find(l => l['Loan ID'] === r['Loan ID'])
    const g = guarantors.find(g => g['Guarantor ID'] === loan?.['Guarantor ID'])
    const customer = customers.find(c => c['Customer ID'] === r['Customer ID'])
    const collectorUserId = r['NGF Agent ID'] || ''
    const collectorUser = users.find(u => u['User ID'] === collectorUserId)
    const collectorAgent = agents.find(a => a['User ID'] === collectorUserId)
    const collectorGuarantor = guarantors.find(g => g['User ID'] === collectorUserId)
    const collectorName = collectorUser?.['Name'] || ''
    const collectorCode = collectorGuarantor?.['Code'] || collectorAgent?.['Agent ID'] || ''
    const paymentMode = collectionModeMap.get(r['Repayment ID']) || r['Payment Mode'] || ''
    return {
      repaymentId: r['Repayment ID'],
      loanId: r['Loan ID'],
      amount: Number(r['Amount']) || 0,
      status: r['Status'],
      paymentMode,
      customerName: customer?.['Name'] || '',
      guarantorId: g?.['Guarantor ID'] || '',
      guarantorName: g?.['Name'] || '',
      collectorUserId,
      collectorName,
      collectorCode,
      collectorRole: collectorUser?.['Role'] || '',
      dueDate: r['Due Date'],
    }
  })

  return ok(rows)
})
