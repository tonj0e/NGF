import { NextRequest } from 'next/server'
import { apiHandler, getSession, ok, err } from '@/lib/api'
import { readTable, selectRows, getSupabase } from '@/lib/supabase-db'
import { scopeOf } from '@/lib/db'
import { getTodayIST, getNextSaturday, addDaysIST } from '@/lib/dateUtils'

export const maxDuration = 30

// The figures change slowly and cost the database a second or more at full size, so each viewer's figures are
// kept for 45 seconds (unread notifications are always fresh). Admin shares one entry; others have their own.
const CACHE_MS = 45_000
const figures = new Map<string, { at: number; data: any }>()

// Every figure is computed by the database (function dashboard_metrics) for the viewer's own scope:
// Admin all, Guarantor own, agent assigned, Staff their branches. The app only shapes the answer.
export const GET = apiHandler(async (req: NextRequest) => {
  const session = await getSession(req)
  const today = getTodayIST()
  const comingSaturday = getNextSaturday()

  let guarantors: string[] | null = null
  let agentId: string | null = null
  if (session.role === 'NGF AGENT') {
    const a = (await readTable('Agents')).find(x => x['User ID'] === session.userId)
    agentId = a?.['Agent ID'] || '__none__'
  } else {
    const scope = await scopeOf(session)
    guarantors = scope.kind === 'guarantors' ? scope.ids : scope.kind === 'none' ? ['__none__'] : null
  }

  const cacheKey = `${session.role}:${session.role === 'Admin' ? 'all' : session.userId}:${today}`
  const hit = figures.get(cacheKey)
  const [metricsRes, capital, unread] = await Promise.all([
    hit && Date.now() - hit.at < CACHE_MS
      ? Promise.resolve({ data: hit.data.metrics, error: null })
      : getSupabase().rpc('dashboard_metrics', {
          p_today: today, p_saturday: comingSaturday, p_guarantors: guarantors, p_agent: agentId, p_own_customers: session.role === 'Guarantor',
        }),
    session.role === 'Admin' ? readTable('Capital') : Promise.resolve([]),
    selectRows('Notifications', qb => qb.eq('is_read', false)
      .or(`user_id.eq.${session.userId},and(user_id.is.null,role.eq.${session.role})`)
      .order('created_at', { ascending: false }).limit(5)),
  ])
  if (metricsRes.error) return err('Dashboard data unavailable. Please try again.')
  if (!hit || Date.now() - hit.at >= CACHE_MS) {
    figures.set(cacheKey, { at: Date.now(), data: { metrics: metricsRes.data } })
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
      commissionEarned: session.role === 'Guarantor' ? Number(lo.commission_total) : 0,
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
