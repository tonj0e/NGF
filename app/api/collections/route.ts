import { NextRequest } from 'next/server'
import { apiHandler, requireRole, ok } from '@/lib/api'
import { pageQuery } from '@/lib/db'
import { addDaysIST } from '@/lib/dateUtils'

export const GET = apiHandler(async (req: NextRequest) => {
  await requireRole(req, ['Admin'])
  const { searchParams } = new URL(req.url)
  const saturday = searchParams.get('saturday') || ''

  // Filtered, counted and paged by the database (view collections_enriched leaves out closed and completed loans)
  const monStr = saturday ? addDaysIST(saturday, -5) : ''   // the week ending on that Saturday
  const r = await pageQuery('CollectionsEnriched', {
    filters: qb => (saturday ? qb.gte('payment_date', monStr).lte('payment_date', saturday) : qb),
    order: [{ column: 'payment_date', ascending: false }, { column: 'collection_id' }],
    page: searchParams.get('page') || 1, pageSize: searchParams.get('pageSize') || 200,
  })
  const rows = r.rows.map(c => {
    const { 'Customer Name': customerName, 'Guarantor Name': guarantorName, 'Guarantor Code': guarantorCode, 'Agent Name': agentName, ...rest } = c as Record<string, any>
    return { ...rest, customerName: customerName || '', guarantorName: guarantorName || '', guarantorCode: guarantorCode || '', agentName: agentName || '' }
  })
  return ok({ rows, pagination: { page: r.page, pageSize: r.pageSize, total: r.total, totalPages: Math.ceil(r.total / r.pageSize) } })
})
