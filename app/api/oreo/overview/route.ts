import { NextRequest } from 'next/server'
import { apiHandler, requireRole, ok } from '@/lib/api'
import { getSupabase } from '@/lib/supabase-db'
import { getTodayIST, addDaysIST } from '@/lib/dateUtils'
import { businessCounts } from '@/lib/oreo/tools'
import { dailyCapUsd, oreoSpentToday, usdInr } from '@/lib/oreo/agent'

// What the Oreo page shows: the live business map, the "Needs you" list and Oreo's own numbers.
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`
const RANGES: Record<string, number | null> = { today: 0, week: 6, '30d': 29, '90d': 89, '6m': 182, all: null }

export const GET = apiHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ['Admin'])
  const range = new URL(req.url).searchParams.get('range') || 'today'
  const sb = getSupabase()
  const days = range in RANGES ? RANGES[range] : 0
  const since = days === null ? '1970-01-01T00:00:00Z' : new Date(`${addDaysIST(getTodayIST(), -days)}T00:00:00+05:30`).toISOString()

  const [c, spent, cap, rate, pendingRules, pendingCards, msgs, acts, spend] = await Promise.all([
    businessCounts(), oreoSpentToday(), dailyCapUsd(), usdInr(),
    sb.from('oreo_brain').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    sb.from('oreo_actions').select('id', { count: 'exact', head: true }).eq('created_by', session.userId).eq('risk', 'money').eq('status', 'pending'),
    sb.from('oreo_messages').select('id', { count: 'exact', head: true }).eq('role', 'user').gte('created_at', since),
    sb.from('oreo_actions').select('risk, status').in('status', ['done']).gte('created_at', since).limit(5000),
    sb.from('ai_usage').select('cost_usd').in('purpose', ['oreo', 'oreo_voice']).gte('created_at', since).limit(20000),
  ])

  const needs: { id: string; level: 'urgent' | 'attention' | 'info'; title: string; detail: string; page: string; ask: string }[] = []
  if (c.collection.overdueCount) needs.push({ id: 'overdue', level: 'urgent', title: `${c.collection.overdueCount} weeks overdue`, detail: `${inr(c.collection.overdueAmount)} not paid after the due Saturday`, page: 'collection', ask: 'Who is overdue and for how much? Biggest first.' })
  if (c.paymentScreenshotsNeedingStaff) needs.push({ id: 'chat', level: 'urgent', title: `${c.paymentScreenshotsNeedingStaff} payment screenshots need staff`, detail: 'The AI could not match or read them', page: 'payments', ask: 'Which payment screenshots need staff and why?' })
  if (c.oldScreenshotsNeverClosed) needs.push({ id: 'chat-old', level: 'info', title: `${c.oldScreenshotsNeverClosed} old payment screenshots were never closed`, detail: 'Over a week old. Usually re-sent and already recorded. Staff can clear them in Payments.', page: 'payments', ask: 'Which old payment screenshots were never closed, and were those payments recorded another way?' })
  if (c.leads.awaitingApproval) needs.push({ id: 'approve', level: 'attention', title: `${c.leads.awaitingApproval} leads waiting for approval`, detail: 'Verification is done; they wait for a decision', page: 'leads', ask: 'Which leads are waiting for approval? Give me the details.' })
  if (c.leads.approvedWaitingDisbursement) needs.push({ id: 'disburse', level: 'attention', title: `${c.leads.approvedWaitingDisbursement} approved, waiting to be paid`, detail: `${c.bankFilesLive} bank files live · ${c.bankFileLinesNotDisbursed} customers not yet marked disbursed`, page: 'leads', ask: 'Show the disbursement queue and which bank details are not verified.' })
  if (c.leads.returned) needs.push({ id: 'returned', level: 'info', title: `${c.leads.returned} leads returned to guarantors`, detail: 'Waiting for the guarantor to fix and resubmit', page: 'leads', ask: 'Which leads were returned and why?' })
  if (pendingCards.count) needs.push({ id: 'cards', level: 'urgent', title: `${pendingCards.count} action waiting for your confirm`, detail: 'Oreo prepared it; nothing happens until you confirm', page: 'ai', ask: '' })
  if (pendingRules.count) needs.push({ id: 'rules', level: 'attention', title: `${pendingRules.count} new rule to approve`, detail: 'Oreo wants to remember something as a rule', page: 'brain', ask: '' })
  if (c.aiCallsFailedToday) needs.push({ id: 'ai', level: 'info', title: `${c.aiCallsFailedToday} AI calls failed today`, detail: 'See Activity > Logs, filter Failed', page: 'activity', ask: 'Which AI calls failed today and why?' })
  if (spent >= cap * 0.8) needs.push({ id: 'cap', level: 'attention', title: 'Oreo is near its daily limit', detail: `$${spent.toFixed(2)} of $${cap.toFixed(2)} used today`, page: 'brain', ask: '' })

  const status = needs.some(n => n.level === 'urgent') ? 'urgent' : needs.some(n => n.level === 'attention') ? 'attention' : 'calm'
  return ok({
    status, today: c.today, needs,
    map: {
      leads: { new: c.leads.pending, inProgress: c.leads.verificationInProgress, returned: c.leads.returned },
      verification: { inProgress: c.leads.verificationInProgress, submitted: c.leads.awaitingApproval },
      approval: { waiting: c.leads.awaitingApproval },
      disbursement: { waiting: c.leads.approvedWaitingDisbursement, files: c.bankFilesLive },
      loans: { active: c.loansActive, customers: c.customers },
      collection: { dueSaturday: c.collection.dueSaturdayAmount, dueCount: c.collection.dueSaturdayCount, paidWeek: c.collection.paidThisWeekAmount, overdue: c.collection.overdueAmount, nextSaturday: c.nextSaturday },
      payments: { needStaff: c.paymentScreenshotsNeedingStaff },
    },
    oreo: {
      range, questions: msgs.count || 0, actions: (acts.data || []).length,
      spendUsd: Number((spend.data || []).reduce((t, r) => t + Number(r.cost_usd || 0), 0).toFixed(5)), spentTodayUsd: Number(spent.toFixed(4)), dailyCapUsd: cap, usdInr: rate,
    },
  })
})
