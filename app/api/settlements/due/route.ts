import { NextRequest } from 'next/server'
import { apiHandler, ok, err } from '@/lib/api'
import { requireFeature } from '@/lib/access'
import { selectAll } from '@/lib/supabase-db'
import { scopeOf, byIds } from '@/lib/db'

// The customer-by-customer lines behind one guarantor's settlement for one Saturday:
//   ?saturday=YYYY-MM-DD&guarantorId=ID
// (Totals for every guarantor come from /api/settlements/summary.)
export const GET = apiHandler(async (req: NextRequest) => {
  const session = await requireFeature(req, ['settlements'])
  const sp = new URL(req.url).searchParams
  const saturday = sp.get('saturday') || ''
  const guarantorId = sp.get('guarantorId') || ''
  if (!saturday || !guarantorId) return err('saturday and guarantorId required')

  // Staff: only guarantors of their own branches
  const scope = await scopeOf(session)
  if (scope.kind === 'none' || (scope.kind === 'guarantors' && !scope.ids.includes(guarantorId))) return ok([])

  const lines = await selectAll('SettlementLines', qb => qb.eq('due_date', saturday).eq('guarantor_id', guarantorId))
  const [customers, guarantors] = await Promise.all([
    byIds('Customers', 'customer_id', lines.map(l => l['Customer ID'])),
    byIds('Guarantors', 'guarantor_id', [guarantorId]),
  ])
  const cName = new Map(customers.map(c => [c['Customer ID'], c['Name']]))
  const g = guarantors[0]

  return ok(lines.map(r => ({
    repaymentId: r['Repayment ID'],
    loanId: r['Loan ID'],
    amount: Number(r['Amount']) || 0,
    status: r['Status'],
    paymentMode: r['Payment Mode'] || '',
    customerName: cName.get(r['Customer ID']) || '',
    guarantorId: g?.['Guarantor ID'] || '',
    guarantorName: g?.['Name'] || '',
    collectorUserId: r['Collector User ID'] || '',
    collectorName: r['Collector Name'] || '',
    collectorCode: r['Collector Code'] || '',
    collectorRole: r['Collector Role'] || '',
    dueDate: r['Due Date'],
    updatedAt: r['Updated At'] || '',
  })))
})
