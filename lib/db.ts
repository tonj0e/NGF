// Database-side reading for the big tables (customers, loans, repayments, leads): filter, search, order and page in
// the database and bring back only the rows on screen. Request-time code must not read these tables whole.
import { selectRows, selectAll, readTable, getSupabase, type TableName } from './supabase-db'
import { getBranchAccess, guarantorBranchMap, canSeeGuarantor } from './branchAccess'
import type { Session } from '@/types'

import { chunk, cleanSearch, pageBounds, ID_CHUNK, MAX_PAGE_SIZE } from './db-pure'
export { chunk, cleanSearch, pageBounds, ID_CHUNK, MAX_PAGE_SIZE }

export interface PageOpts {
  filters?: (qb: any) => any
  search?: { columns: string[]; text: unknown }
  order?: { column: string; ascending?: boolean }[]   // the last one should be unique (the id) so pages never overlap
  page?: unknown
  pageSize?: unknown
}

export async function pageQuery(table: TableName, opts: PageOpts = {}): Promise<{ rows: Record<string, string>[]; total: number; page: number; pageSize: number; totalPages: number }> {
  const { page, pageSize, from, to } = pageBounds(opts.page, opts.pageSize)
  const text = opts.search ? cleanSearch(opts.search.text) : ''
  const { rows, total } = await selectRows(table, qb => {
    let q = opts.filters ? opts.filters(qb) : qb
    if (text) q = q.or(opts.search!.columns.map(c => `${c}.ilike.%${text}%`).join(','))
    for (const o of opts.order || []) q = q.order(o.column, { ascending: o.ascending !== false })
    return q.range(from, to)
  }, { count: true })
  return { rows, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) }
}

/** Rows whose `column` is in `ids`, fetched in parallel chunks so the request address stays short. */
export async function byIds(table: TableName, column: string, ids: string[]): Promise<Record<string, string>[]> {
  const unique = Array.from(new Set(ids.filter(Boolean)))
  if (!unique.length) return []
  const parts = await Promise.all(chunk(unique).map(part => selectAll(table, qb => qb.in(column, part))))
  return parts.flat()
}

/** Who may see which customers/loans/leads, worked out once from the small tables. */
export type Scope =
  | { kind: 'all' }
  | { kind: 'guarantors'; ids: string[] }   // Guarantor: their own id; Staff: guarantors of their branches
  | { kind: 'none' }

export async function scopeOf(session: Pick<Session, 'userId' | 'role'>): Promise<Scope> {
  if (session.role === 'Admin') return { kind: 'all' }
  if (session.role === 'Guarantor') {
    const g = (await readTable('Guarantors')).find(x => x['User ID'] === session.userId)
    return g ? { kind: 'guarantors', ids: [g['Guarantor ID']] } : { kind: 'none' }
  }
  if (session.role === 'Staff') {
    const [access, gMap] = await Promise.all([getBranchAccess(session), guarantorBranchMap()])
    const ids = Array.from(gMap.keys()).filter(g => canSeeGuarantor(access, gMap, g))
    return ids.length ? { kind: 'guarantors', ids } : { kind: 'none' }
  }
  return { kind: 'none' }   // agents are scoped by their assigned loans in the route
}

/** Apply a scope to a query on a table that has `guarantor_id`. */
export function withScope(qb: any, scope: Scope): any {
  if (scope.kind === 'all') return qb
  if (scope.kind === 'guarantors') return qb.in('guarantor_id', scope.ids)
  return qb.in('guarantor_id', ['__none__'])
}

/** Company-wide loan and repayment totals, added up by the database (function company_totals). */
export interface CompanyTotals {
  loanCount: number; activePrincipal: number; activeInterest: number; activeCommission: number; activeNetDisbursed: number
  totalPrincipal: number; totalInterest: number; paidTotal: number; pendingTotal: number; overdueCount: number; overdueAmount: number
  commissionByGuarantor: Record<string, number>
}
export async function companyTotals(): Promise<CompanyTotals> {
  const { data, error } = await getSupabase().rpc('company_totals')
  if (error) throw new Error(`Totals failed: ${error.message}`)
  const t = data as any
  return {
    loanCount: Number(t.loan_count), activePrincipal: Number(t.active_principal), activeInterest: Number(t.active_interest),
    activeCommission: Number(t.active_commission), activeNetDisbursed: Number(t.active_net_disbursed),
    totalPrincipal: Number(t.total_principal), totalInterest: Number(t.total_interest), paidTotal: Number(t.paid_total),
    pendingTotal: Number(t.pending_total), overdueCount: Number(t.overdue_count || 0), overdueAmount: Number(t.overdue_amount || 0),
    commissionByGuarantor: Object.fromEntries(Object.entries(t.commission_by_guarantor || {}).map(([k, v]) => [k, Number(v)])),
  }
}
