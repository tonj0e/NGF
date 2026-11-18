import { NextRequest } from 'next/server'
import { apiHandler, getSession, ok, err } from '@/lib/api'
import { readTable, selectRows, getSupabase } from '@/lib/supabase-db'
import { buildOverview } from '@/lib/commissions'
import { fetchAllPages } from '@/lib/paginate'
import { scopeOf } from '@/lib/db'
import { getTodayIST, getNextSaturday, addDaysIST } from '@/lib/dateUtils'

export const maxDuration = 30

// The figures change slowly and cost the database a second or more at full size, so each viewer's figures are
// kept for 45 seconds (unread notifications are always fresh). Admin shares one entry; others have their own.
const CACHE_MS = 45_000
const figures = new Map<string, { at: number; data: any }>()

type CycleCard = { start: string; end: string; payoutDate: string; amount: number; loans: number; ready: number }
// Every row of one guarantor's table, only the given columns, keyed the way buildOverview reads them
const guarantorRows = (table: string, columns: Record<string, string>, guarantorId: string, pk: string) =>
  fetchAllPages(async (from, to) => {
    const { data, error } = await getSupabase().from(table).select(Object.keys(columns).join(', ')).eq('guarantor_id', guarantorId).order(pk, { ascending: true }).range(from, to)
    if (error) throw new Error(`Query failed on ${table}: ${error.message}`)
    return (data || []) as unknown as Record<string, string>[]
  }).then(rows => rows.map(r => Object.fromEntries(Object.entries(columns).map(([col, key]) => [key, r[col]])) as Record<string, string>))

// A guarantor's commission by cycle: what the running 5-week cycle has earned so far, and when it is paid.
// Only the columns buildOverview uses are read (loans: date and commission; payouts: status and cycle start).
async function guarantorCycle(g: Record<string, string>, today: string): Promise<CycleCard | null> {
  const [loans, payouts] = await Promise.all([
    guarantorRows('loans', { created_at: 'Created At', guarantor_commission: 'Guarantor Commission' }, g['Guarantor ID'], 'loan_id'),
    guarantorRows('payout_requests', { status: 'Status', cycle_start: 'Cycle Start' }, g['Guarantor ID'], 'payout_id'),
  ])
  const o = buildOverview(loans, payouts, g['Commission Start'] || null, today)
  return o.current ? { start: o.current.start, end: o.current.end, payoutDate: o.ready?.payoutDate || o.current.payoutDate, amount: o.current.amount, loans: o.current.loans, ready: o.available } : null
}

// Every figure is computed by the database (function dashboard_metrics) for the viewer's own scope:
// Admin all, Guarantor own, agent assigned, Staff their branches. The app only shapes the answer.
export const GET = apiHandler(async (req: NextRequest) => {
  const session = await getSession(req)
  const today = getTodayIST()
  const comingSaturday = getNextSaturday()

  let guarantors: string[] | null = null
  let agentId: string | null = null
  let guarantorRow: Record<string, string> | undefined
  if (session.role === 'NGF AGENT') {
    const a = (await readTable('Agents')).find(x => x['User ID'] === session.userId)
    agentId = a?.['Agent ID'] || '__none__'
  } else {
    const scope = await scopeOf(session)
    guarantors = scope.kind === 'guarantors' ? scope.ids : scope.kind === 'none' ? ['__none__'] : null
    // scopeOf found this guarantor through the same cached Guarantors list: take the row from there (no extra read)
    if (session.role === 'Guarantor' && scope.kind === 'guarantors') guarantorRow = (await readTable('Guarantors')).find(x => x['User ID'] === session.userId)
  }

  const cacheKey = `${session.role}:${session.role === 'Admin' ? 'all' : session.userId}:${today}`
  const hit0 = figures.get(cacheKey)
  const hit = hit0 && Date.now() - hit0.at < CACHE_MS && (session.role !== 'Guarantor' || 'cycleCard' in hit0.data) ? hit0 : undefined
  const [metricsRes, capital, unread, cycleCard] = await Promise.all([
    hit
      ? Promise.resolve({ data: hit.data.metrics, error: null })
      : getSupabase().rpc('dashboard_metrics', {
          p_today: today, p_saturday: comingSaturday, p_guarantors: guarantors, p_agent: agentId, p_own_customers: session.role === 'Guarantor',
        }),
    session.role === 'Admin' ? readTable('Capital') : Promise.resolve([]),
    selectRows('Notifications', qb => qb.eq('is_read', false)
      .or(`user_id.eq.${session.userId},and(user_id.is.null,role.eq.${session.role})`)
      .order('created_at', { ascending: false }).limit(5)),
    // The guarantor's commission cycle is read with the rest (not after it) and kept in the same 45 s cache
    session.role !== 'Guarantor' ? Promise.resolve(null)
      : hit ? Promise.resolve(hit.data.cycleCard as CycleCard | null)
      : guarantorRow ? guarantorCycle(guarantorRow, today) : Promise.resolve(null),
  ])
  if (metricsRes.error) return err('Dashboard data unavailable. Please try again.')
  if (!hit) {
    figures.set(cacheKey, { at: Date.now(), data: { metrics: metricsRes.data, ...(session.role === 'Guarantor' ? { cycleCard } : {}) } })
    if (figures.size > 500) for (const k of figures.keys()) { figures.delete(k); if (figures.size <= 250) break }   // keep the cache small
  }
  const m = metricsRes.data as any
  const rep = m.rep, lo = m.lo

  // Collection trend chart: continuous daily series (last 14 days), 0-filled so the line has a real time axis
  const weeklyCollections: Record<string, number> = {}
  for (let i = 13; i >= 0; i--) weeklyCollections[addDaysIST(today, -i)] = 0
  for (const p of m.series || []) if (p.d in weeklyCollections) weeklyCollections[p.d] += Number(p.amt || 0)

  // recollection rate = collected ÷ everything that has come due (by amount)
  const dueAmount = Number(rep.due_amount), collectedAmount = Number(rep.collected_amount)
  const recollectionRate = dueAmount ? Math.round((collectedAmount / dueAmount) * 1000) / 10 : 100

  // capital (admin): interest and commission are deducted upfront at disbursement
  const totalCapital = capital.reduce((s, c) => s + Number(c['Amount'] || 0), 0)
  const investorMoney = capital.filter(c => c['Type'] === 'Investor').reduce((s, c) => s + Number(c['Amount'] || 0), 0)
  const totalInterest = Number(lo.total_interest)
  const availableCapital = totalCapital - Number(lo.total_principal) + Number(rep.total_collected)

  return ok({
    commissionCycle: cycleCard,
    metrics: {
      activeLoans: Number(lo.active_loans),
      overdueLoans: Number(lo.overdue_loans),
      completedLoans: Number(lo.completed_loans),
      renewalEligible: Number(lo.renewal_eligible),
      activeCustomers: Number(m.cu.active_customers),
      pendingLeads: Number(m.leads?.Pending || 0),
      monthCollected: Number(rep.month_collected),
      totalLoanAmount: Number(lo.total_loan_amount),
      thisWeekCollection: Number(rep.this_week_collection),
      commissionEarned: session.role === 'Guarantor' ? (cycleCard ? cycleCard.amount : 0) : 0,
      assignedVerifications: Number(m.assigned_verifications || 0),
      todayDue: session.role === 'NGF AGENT' ? Number(rep.today_due) : 0,
      weekCollected: Number(rep.week_collected),
      // Capital, investor and interest totals are company-wide, so Admin only (Staff see their branches' figures above)
      ...(session.role === 'Admin' ? { totalCapital, investorMoney, totalInterest, availableCapital } : {}),
      recollectionRate,
      collectedCount: Number(rep.collected_count),
      pendingCount: Number(rep.due_count) - Number(rep.collected_count),
    },
    weeklyCollections,
    leadFunnel: m.leads || {},
    notifications: unread.rows.map(n => ({ notificationId: n['Notification ID'], title: n['Title'], message: n['Message'], createdAt: n['Created At'] })),
  })
})
