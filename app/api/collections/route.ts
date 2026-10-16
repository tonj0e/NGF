import { NextRequest } from 'next/server'
import { apiHandler, requireRole, ok } from '@/lib/api'
import { readTable, paginate } from '@/lib/supabase-db'
import { addDaysIST } from '@/lib/dateUtils'

export const GET = apiHandler(async (req: NextRequest) => {
  await requireRole(req, ['Admin'])
  const { searchParams } = new URL(req.url)
  const saturday = searchParams.get('saturday') || ''
  const page = Number(searchParams.get('page') || 1)
  const pageSize = Number(searchParams.get('pageSize') || 200)

  const [collections, loans, customers, guarantors, agents] = await Promise.all([
    readTable('Collections'), readTable('Loans'), readTable('Customers'),
    readTable('Guarantors'), readTable('Agents'),
  ])

  // Exclude Closed/Completed loans from collection queries (consistent with settlements logic)
  const inactiveLoanIds = new Set(
    loans.filter(l => l['Status'] === 'Closed' || l['Status'] === 'Completed').map(l => l['Loan ID'])
  )

  let rows = collections.filter(c => !inactiveLoanIds.has(c['Loan ID']))

  if (saturday) {
    // Filter by collections that have payment date within the week ending on that saturday
    // Use IST-aware date utilities instead of local date methods
    const monStr = addDaysIST(saturday, -5)
    rows = rows.filter(c => c['Payment Date'] >= monStr && c['Payment Date'] <= saturday)
  }

  const enriched = rows.map(c => {
    const loan = loans.find(l => l['Loan ID'] === c['Loan ID'])
    const customer = customers.find(cu => cu['Customer ID'] === c['Customer ID'])
    const guarantor = loan ? guarantors.find(g => g['Guarantor ID'] === loan['Guarantor ID']) : null
    const agent = agents.find(a => a['Agent ID'] === c['Agent ID'])
    return {
      ...c,
      'Guarantor ID': loan?.['Guarantor ID'] || '',
      customerName: customer?.['Name'] || '',
      guarantorName: guarantor?.['Name'] || '',
      guarantorCode: guarantor?.['Code'] || '',
      agentName: agent?.['Name'] || '',
    }
  })

  return ok(paginate(enriched, page, pageSize))
})
