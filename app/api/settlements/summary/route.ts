import { NextRequest } from 'next/server'
import { apiHandler, ok } from '@/lib/api'
import { requireFeature } from '@/lib/access'
import { getSupabase, pascalRow } from '@/lib/supabase-db'
import { scopeOf, cleanSearch, pageBounds } from '@/lib/db'
import { addDaysIST } from '@/lib/dateUtils'

// Settlement totals per guarantor and Saturday, added up by the database (function settlement_summary).
//   ?saturday=YYYY-MM-DD            one Saturday: every guarantor with weeks due
//   ?unsettled=1&before=YYYY-MM-DD  past weeks (before that Saturday) that still need a settlement
//   &q=name or code  &page=  &pageSize=
// The customer-by-customer lines of one guarantor and week come from /api/settlements/due?guarantorId=.
export const GET = apiHandler(async (req: NextRequest) => {
  const session = await requireFeature(req, ['settlements'])
  const sp = new URL(req.url).searchParams
  const saturday = sp.get('saturday') || ''
  const unsettled = sp.get('unsettled') === '1'
  const before = sp.get('before') || ''
  const { page, pageSize, from } = pageBounds(sp.get('page'), sp.get('pageSize'), 100)

  const scope = await scopeOf(session)
  const guarantors = scope.kind === 'guarantors' ? scope.ids : scope.kind === 'none' ? ['__none__'] : null
  const { data, error } = await getSupabase().rpc('settlement_summary', {
    p_from: unsettled ? null : saturday || null,
    p_to: unsettled ? (before ? addDaysIST(before, -1) : null) : saturday || null,
    p_guarantors: guarantors, p_unsettled: unsettled, p_search: cleanSearch(sp.get('q')) || null,
    p_offset: from, p_limit: pageSize,
  })
  if (error) throw new Error(`Settlement summary failed: ${error.message}`)

  const rows = (data || []) as any[]
  const total = rows.length ? Number(rows[0].total_count) : 0
  return ok({
    summaries: rows.map(r => ({
      dueDate: r.due_date, guarantorId: r.guarantor_id, guarantorName: r.guarantor_name, guarantorCode: r.guarantor_code, guarantorPhone: r.guarantor_phone || '',
      totalDue: Number(r.total_due), unpaid: Number(r.unpaid), upiDue: Number(r.upi_due), cashDue: Number(r.cash_due),
      collectors: r.collectors || [],
      settlement: r.settlement ? pascalRow(r.settlement) : null,
    })),
    total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)),
  })
})
