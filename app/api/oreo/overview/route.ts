import { NextRequest } from 'next/server'
import { apiHandler, requireRole, ok } from '@/lib/api'
import { getSupabase } from '@/lib/supabase-db'
import { getTodayIST, addDaysIST } from '@/lib/dateUtils'
import { businessCounts, guarantorStats, readAll } from '@/lib/oreo/tools'
import { dailyCapUsd, oreoSpentToday, usdInr } from '@/lib/oreo/agent'

// What the Oreo page shows: the live business map, the "Needs you" list and Oreo's own numbers.
// ?card=1 is the light answer for the home page Saturday card: only `needs` (without the Oreo-only items) and `map.collection`.
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`
const RANGES: Record<string, number | null> = { today: 0, week: 6, '30d': 29, '90d': 89, '6m': 182, all: null }

// The numbers are kept for 30 seconds per server process, and callers that ask while a read is running share it.
// The database is far away (each round trip ~285 ms) and the Saturday card and the Oreo page poll this.
const TTL_MS = 30_000
const memo = new Map<string, { at: number; p: Promise<unknown> }>()
function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = memo.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.p as Promise<T>
  const p = fn()
  memo.set(key, { at: Date.now(), p })
  p.catch(() => { if (memo.get(key)?.p === p) memo.delete(key) })   // a failure is not kept
  if (memo.size > 200) for (const k of memo.keys()) { memo.delete(k); if (memo.size <= 100) break }
  return p
}

type Need = { id: string; level: 'urgent' | 'attention' | 'info'; title: string; detail: string; page: string; ask: string }
type Counts = Awaited<ReturnType<typeof businessCounts>>

// The business items of "Needs you" (overdue, payment screenshots, leads). The Oreo-only items are added after them.
function businessNeeds(c: Counts): Need[] {
  const needs: Need[] = []
  if (c.collection.overdueCount) needs.push({ id: 'overdue', level: 'urgent', title: `${c.collection.overdueCount} weeks overdue`, detail: `${inr(c.collection.overdueAmount)} not paid after the due Saturday`, page: 'collection', ask: 'Who is overdue and for how much? Biggest first.' })
  if (c.paymentScreenshotsNeedingStaff) needs.push({ id: 'chat', level: 'urgent', title: `${c.paymentScreenshotsNeedingStaff} payment screenshots need staff`, detail: 'The AI could not match or read them', page: 'payments', ask: 'Which payment screenshots need staff and why?' })
  if (c.oldScreenshotsNeverClosed) needs.push({ id: 'chat-old', level: 'info', title: `${c.oldScreenshotsNeverClosed} old payment screenshots were never closed`, detail: 'Over a week old. Usually re-sent and already recorded. Staff can clear them in Payments.', page: 'payments', ask: 'Which old payment screenshots were never closed, and were those payments recorded another way?' })
  if (c.leads.awaitingApproval) needs.push({ id: 'approve', level: 'attention', title: `${c.leads.awaitingApproval} leads waiting for approval`, detail: 'Verification is done; they wait for a decision', page: 'leads', ask: 'Which leads are waiting for approval? Give me the details.' })
  if (c.leads.approvedWaitingDisbursement) needs.push({ id: 'disburse', level: 'attention', title: `${c.leads.approvedWaitingDisbursement} approved, waiting to be paid`, detail: `${c.bankFilesLive} bank files live · ${c.bankFileLinesNotDisbursed} customers not yet marked disbursed`, page: 'leads', ask: 'Show the disbursement queue and which bank details are not verified.' })
  if (c.leads.returned) needs.push({ id: 'returned', level: 'info', title: `${c.leads.returned} leads returned to guarantors`, detail: 'Waiting for the guarantor to fix and resubmit', page: 'leads', ask: 'Which leads were returned and why?' })
  return needs
}
const collectionMap = (c: Counts) => ({ dueSaturday: c.collection.dueSaturdayAmount, dueCount: c.collection.dueSaturdayCount, paidWeek: c.collection.paidThisWeekAmount, paidSatCount: c.collection.paidForSaturdayCount, paidSatAmount: c.collection.paidForSaturdayAmount, overdue: c.collection.overdueAmount, nextSaturday: c.nextSaturday })

async function buildFull(range: string, userId: string) {
  const sb = getSupabase()
  const days = range in RANGES ? RANGES[range] : 0
  const since = days === null ? '1970-01-01T00:00:00Z' : new Date(`${addDaysIST(getTodayIST(), -days)}T00:00:00+05:30`).toISOString()

  // Everything at once: one wave of round trips instead of guarantorStats first and the rest after it
  const [groupsAll, c, spent, cap, rate, pendingRules, pendingCards, msgs, acts, spend] = await Promise.all([
    guarantorStats().catch(() => []),
    businessCounts(), oreoSpentToday(), dailyCapUsd(), usdInr(),
    sb.from('oreo_brain').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    sb.from('oreo_actions').select('id', { count: 'exact', head: true }).eq('created_by', userId).eq('risk', 'money').eq('status', 'pending'),
    sb.from('oreo_messages').select('id', { count: 'exact', head: true }).eq('role', 'user').gte('created_at', since),
    sb.from('oreo_actions').select('id', { count: 'exact', head: true }).eq('status', 'done').gte('created_at', since),   // a count, not rows (rows stopped at 1000)
    readAll<{ cost_usd: number }>('ai_usage', 'cost_usd', 'id', q => q.in('purpose', ['oreo', 'oreo_voice']).gte('created_at', since)),
  ])

  const needs = businessNeeds(c)
  if (pendingCards.count) needs.push({ id: 'cards', level: 'urgent', title: `${pendingCards.count} action waiting for your confirm`, detail: 'Oreo prepared it; nothing happens until you confirm', page: 'ai', ask: '' })
  if (pendingRules.count) needs.push({ id: 'rules', level: 'attention', title: `${pendingRules.count} new rule to approve`, detail: 'Oreo wants to remember something as a rule', page: 'brain', ask: '' })
  if (c.aiCallsFailedToday) needs.push({ id: 'ai', level: 'info', title: `${c.aiCallsFailedToday} AI calls failed today`, detail: 'See Activity > Logs, filter Failed', page: 'activity', ask: 'Which AI calls failed today and why?' })
  if (spent >= cap * 0.8) needs.push({ id: 'cap', level: 'attention', title: 'Oreo is near its daily limit', detail: `$${spent.toFixed(2)} of $${cap.toFixed(2)} used today`, page: 'brain', ask: '' })

  const status = needs.some(n => n.level === 'urgent') ? 'urgent' : needs.some(n => n.level === 'attention') ? 'attention' : 'calm'
  return {
    status, today: c.today, needs,
    map: {
      leads: { new: c.leads.pending, inProgress: c.leads.verificationInProgress, returned: c.leads.returned },
      verification: { inProgress: c.leads.verificationInProgress, submitted: c.leads.awaitingApproval },
      approval: { waiting: c.leads.awaitingApproval },
      disbursement: { waiting: c.leads.approvedWaitingDisbursement, files: c.bankFilesLive },
      loans: { active: c.loansActive, customers: c.customers },
      collection: collectionMap(c),
      payments: { needStaff: c.paymentScreenshotsNeedingStaff },
    },
    groups: [...groupsAll].sort((a, b) => b.activeLoans - a.activeLoans).slice(0, 6).map(g => ({ code: g.code, name: g.name, loans: g.activeLoans, overdue: g.overdueAmount })),
    oreo: {
      range, questions: msgs.count || 0, actions: acts.count || 0,
      spendUsd: Number(spend.reduce((t, r) => t + Number(r.cost_usd || 0), 0).toFixed(5)), spentTodayUsd: Number(spent.toFixed(4)), dailyCapUsd: cap, usdInr: rate,
    },
  }
}

// The Saturday card only shows map.collection and the needs that are not Oreo's own (ai / brain / activity),
// so it needs businessCounts alone. Those Oreo items come last in the full list, so the card's first three are the same.
async function buildCard() {
  const c = await businessCounts()
  return { today: c.today, needs: businessNeeds(c), map: { collection: collectionMap(c) } }
}

export const GET = apiHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ['Admin'])
  const sp = new URL(req.url).searchParams
  if (sp.get('card') === '1') return ok(await cached('card', buildCard))
  const range = sp.get('range') || 'today'
  // Keyed by viewer: the "waiting for your confirm" count is the viewer's own
  return ok(await cached(`full:${range}:${session.userId}`, () => buildFull(range, session.userId)))
})
