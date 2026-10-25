import { NextRequest } from 'next/server'
import { apiHandler, ok, err } from '@/lib/api'
import { requireFeature } from '@/lib/access'
import { getSupabase } from '@/lib/supabase-db'
import { scopeOf } from '@/lib/db'
import { getTodayIST } from '@/lib/dateUtils'

// Totals for the Reports page, added up by the database (read-only functions reports_*).
//   ?view=summary                      the six summary cards
//   ?view=months                       months with money movement: credit, payments, debit
//   ?view=month&month=YYYY-MM          one month's totals (the lists come from /api/loans, /api/settlements, /api/repayments)
//   ?view=customerCards&ids=a,b        loans / collected / late for those customers
//   ?view=guarantorCards&ids=a,b       loans / earned / settled for those guarantors
// Admin sees everything; Staff only their branches' guarantors.
export const GET = apiHandler(async (req: NextRequest) => {
  const session = await requireFeature(req, ['reports'])
  const sp = new URL(req.url).searchParams
  const view = sp.get('view') || 'summary'
  const scope = await scopeOf(session)
  const guarantors = scope.kind === 'guarantors' ? scope.ids : scope.kind === 'none' ? ['__none__'] : null
  const sb = getSupabase()
  const call = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await sb.rpc(fn, args)
    if (error) throw new Error(`Report failed: ${error.message}`)
    return data as any
  }
  const ids = (sp.get('ids') || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 60)

  if (view === 'summary') {
    const t = await call('reports_summary', { p_today: getTodayIST(), p_guarantors: guarantors })
    return ok({
      totalPortfolio: Number(t.total_portfolio), activeLoans: Number(t.active_loans), completedLoans: Number(t.completed_loans),
      overdueLoans: Number(t.overdue_loans), activeCustomers: Number(t.active_customers),
      thisMonthCollected: Number(t.this_month), lastMonthCollected: Number(t.last_month),
      totalCollected: Number(t.total_collected), pendingAmount: Number(t.pending_amount),
    })
  }
  if (view === 'months') {
    const rows = (await call('reports_months', { p_guarantors: guarantors })) as any[]
    return ok({ months: rows.map(r => ({ ym: r.ym, credit: Number(r.credit), txCount: Number(r.tx_count), debit: Number(r.debit) })) })
  }
  if (view === 'month') {
    const month = sp.get('month') || ''
    if (!/^\d{4}-\d{2}$/.test(month)) return err('month must look like 2026-10')
    const t = await call('reports_month', { p_month: month, p_guarantors: guarantors })
    return ok({
      loanCount: Number(t.loan_count), loansNetDisbursed: Number(t.loans_net_disbursed), loansCommission: Number(t.loans_commission),
      guarantorSubmissions: Number(t.guarantor_submissions), commissionSettlements: Number(t.commission_settlements), staffCollected: Number(t.staff_collected),
      // credit = guarantor submissions + staff collections + commissions earned; debit = money out to customers + commission settlements
      totalCredit: Number(t.guarantor_submissions) + Number(t.staff_collected) + Number(t.loans_commission),
      totalDebit: Number(t.loans_net_disbursed) + Number(t.commission_settlements),
    })
  }
  if (view === 'customerCards') {
    const rows = ids.length ? ((await call('reports_customer_cards', { p_ids: ids })) as any[]) : []
    return ok({ cards: rows.map(r => ({ customerId: r.customer_id, loanCount: Number(r.loan_count), collected: Number(r.collected), lateCount: Number(r.late_count) })) })
  }
  if (view === 'guarantorCards') {
    const rows = ids.length ? ((await call('reports_guarantor_cards', { p_ids: ids })) as any[]) : []
    return ok({ cards: rows.map(r => ({ guarantorId: r.guarantor_id, loanCount: Number(r.loan_count), earned: Number(r.earned), settled: Number(r.settled) })) })
  }
  return err('Unknown view')
})
