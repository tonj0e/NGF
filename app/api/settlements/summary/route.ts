import { NextRequest } from 'next/server'
import { apiHandler, ok } from '@/lib/api'
import { requireFeature } from '@/lib/access'
import { getSupabase, pascalRow, selectRows } from '@/lib/supabase-db'
import { scopeOf, cleanSearch, pageBounds } from '@/lib/db'
import { addDaysIST } from '@/lib/dateUtils'

// Settlement totals per guarantor and Saturday, added up by the database (function settlement_summary).
//   ?saturday=YYYY-MM-DD            one Saturday: every guarantor with weeks due
//   ?unsettled=1&before=YYYY-MM-DD&window=N  past weeks (before that Saturday) that still need a settlement, two weeks at a time
//                                   (window 0 = the two weeks before, 1 = the two before those ...); `hasMore` says if older weeks exist
//   &q=name or code  &page=  &pageSize=
// The customer-by-customer lines of one guarantor and week come from /api/settlements/due?guarantorId=.
export const GET = apiHandler(async (req: NextRequest) => {
  const session = await requireFeature(req, ['settlements'])
  const sp = new URL(req.url).searchParams
  const saturday = sp.get('saturday') || ''
  const unsettled = sp.get('unsettled') === '1'
  const before = sp.get('before') || ''
  const { page, pageSize, from } = pageBounds(sp.get('page'), sp.get('pageSize'), 100)

  // Unsettled weeks are added up two weeks at a time so each request stays fast however long the history is
  const windowIdx = Math.max(0, Math.floor(Number(sp.get('window') || 0)) || 0)
  const winTo = unsettled && before ? addDaysIST(before, -1 - 14 * windowIdx) : ''
  const winFrom = winTo ? addDaysIST(winTo, -13) : ''

  const scope = await scopeOf(session)
  const guarantors = scope.kind === 'guarantors' ? scope.ids : scope.kind === 'none' ? ['__none__'] : null
  const { data, error } = await getSupabase().rpc('settlement_summary', {
    p_from: unsettled ? winFrom || null : saturday || null,
    p_to: unsettled ? winTo || null : saturday || null,
    p_guarantors: guarantors, p_unsettled: unsettled, p_search: cleanSearch(sp.get('q')) || null,
    p_offset: from, p_limit: pageSize,
  })
  if (error) throw new Error(`Settlement summary failed: ${error.message}`)

  const rows = (data || []) as any[]
  const total = rows.length ? Number(rows[0].total_count) : 0
  // are there older weeks still to look at? (one cheap lookup)
  const hasMore = unsettled && !!winFrom && (await selectRows('Repayments', qb => qb.lt('due_date', winFrom).limit(1))).rows.length > 0
  return ok({
    summaries: rows.map(r => ({
      dueDate: r.due_date, guarantorId: r.guarantor_id, guarantorName: r.guarantor_name, guarantorCode: r.guarantor_code, guarantorPhone: r.guarantor_phone || '',
      totalDue: Number(r.total_due), unpaid: Number(r.unpaid), upiDue: Number(r.upi_due), cashDue: Number(r.cash_due),
      collectors: r.collectors || [],
      settlement: r.settlement ? pascalRow(r.settlement) : null,
    })),
    total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)), hasMore,
  })
})
