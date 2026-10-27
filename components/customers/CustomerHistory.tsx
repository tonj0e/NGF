'use client'
import { useEffect, useState } from 'react'
import { Session } from '@/types'
import { CheckCircle2, Clock, AlertTriangle, ChevronDown, Info } from 'lucide-react'

type Week = {
  weekNo: number; dueDate: string; amount: number; status: string; paidDate: string | null; recordedAt: string | null
  outcome: 'on-time' | 'late' | 'overdue' | 'upcoming' | 'waived'; lateMinutes: number; estimated: boolean; penalty: number
  mode: string; recordedBy: string; utr: string; utrStatus: string; notes: string
}
type Loan = {
  loanId: string; loanAccountNo: string; status: string; startDate: string; endDate: string; durationWeeks: number
  principal: number; weekly: number; weeks: Week[]; paidWeeks: number; onTimeWeeks: number; lateWeeks: number; overdueWeeks: number
  completed: boolean; points: number; penalty: number
}
type Data = {
  customer: { customerId: string; name: string }
  score: {
    value: number; max: number; band: string; completedLoans: number; onTimeRate: number | null
    parts: { cyclePoints: number; penalties: number; reviewPoints: number }; reviews: { count: number; average: number | null }
    inProgress: { loanId: string; paidWeeks: number; totalWeeks: number; nextPoints: number } | null
    rules: { cutoffTime: string; cycleSteps: number[]; latePenalty: number; extraPerLateWeek: number; overduePenalty: number; max: number; reviewPoints: Record<string, number>; reviewCap: number }
  }
  loans: Loan[]
}

const money = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
const stamp = (iso: string) => new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })
function span(min: number) {
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60
  if (d) return `${d} day${d > 1 ? 's' : ''}${h ? ` ${h} h` : ''}`
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`
}

const BAND: Record<string, string> = {
  Excellent: 'bg-green-100 text-green-700', Good: 'bg-emerald-100 text-emerald-700', Fair: 'bg-amber-100 text-amber-800',
  Building: 'bg-blue-100 text-blue-700', New: 'bg-mist text-soft',
}
const card = 'rounded-[1.75rem] border border-white/70 bg-white shadow-panel p-4 sm:p-5'

export default function CustomerHistory({ session, customerId }: { session: Session; customerId: string }) {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<string>('')
  const [showRules, setShowRules] = useState(false)

  useEffect(() => {
    setData(null); setError('')
    fetch(`/api/customers/history?customerId=${encodeURIComponent(customerId)}`, { headers: { Authorization: `Bearer ${session.token}` } })
      .then(r => r.json())
      .then(j => { if (j.success) { setData(j.data); setOpen(j.data.loans[0]?.loanId || '') } else setError(j.error || 'Could not load history') })
      .catch(() => setError('Could not load history'))
  }, [customerId, session.token])

  if (error) return <p className="rounded-2xl border border-dashed border-line bg-white p-8 text-center text-sm text-red-600">{error}</p>
  if (!data) return <p className="p-8 text-center text-sm text-soft">Loading history…</p>

  const { score, loans } = data
  const pct = Math.min(100, Math.round((score.value / score.max) * 100))

  return (
    <div className="space-y-4">
      <div className={card}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-soft">NGF Score</p>
            <p className="mt-1 text-4xl font-bold leading-none text-ink">{score.value}<span className="ml-1 text-base font-semibold text-[#9ca3af]">/ {score.max}</span></p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${BAND[score.band] || BAND.New}`}>{score.band}</span>
        </div>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-mist" role="progressbar" aria-valuenow={score.value} aria-valuemin={0} aria-valuemax={score.max}>
          <div className="h-full rounded-full bg-gradient-to-r from-amber-400 via-lime-400 to-green-600" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-[#f9fafb] px-2 py-2"><p className="text-lg font-bold">{loans.length}</p><p className="text-[11px] text-soft">Loans taken</p></div>
          <div className="rounded-2xl bg-[#f9fafb] px-2 py-2"><p className="text-lg font-bold">{score.completedLoans}</p><p className="text-[11px] text-soft">Completed</p></div>
          <div className="rounded-2xl bg-[#f9fafb] px-2 py-2"><p className="text-lg font-bold">{score.onTimeRate == null ? '–' : `${score.onTimeRate}%`}</p><p className="text-[11px] text-soft">Paid on time</p></div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-2xl bg-green-50 px-2 py-2"><p className="text-base font-bold text-green-800">+{score.parts.cyclePoints}</p><p className="text-[11px] text-soft">Completed loans</p></div>
          <div className="rounded-2xl bg-sky-50 px-2 py-2"><p className="text-base font-bold text-sky-800">{score.parts.reviewPoints >= 0 ? '+' : ''}{score.parts.reviewPoints}</p><p className="text-[11px] text-soft">Staff reviews{score.reviews.count ? ` (${score.reviews.average}★ avg of ${score.reviews.count})` : ' (none yet)'}</p></div>
          <div className="rounded-2xl bg-red-50 px-2 py-2"><p className="text-base font-bold text-red-800">−{score.parts.penalties}</p><p className="text-[11px] text-soft">Late / overdue</p></div>
        </div>
        {score.inProgress && (
          <p className="mt-3 rounded-2xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Current loan <span className="font-mono font-semibold">{score.inProgress.loanId}</span>: {score.inProgress.paidWeeks} of {score.inProgress.totalWeeks} weeks paid.
            {score.inProgress.nextPoints > 0 ? <> Completing it adds <b>+{score.inProgress.nextPoints}</b>.</> : <> The score is already at its top step.</>}
          </p>
        )}
        <button type="button" onClick={() => setShowRules(!showRules)} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-700"><Info className="h-3.5 w-3.5" />How the score works</button>
        {showRules && (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[#4b5563]">
            <li>A payment recorded by {score.rules.cutoffTime} (3:30 pm) on its Saturday is on time and never lowers the score.</li>
            <li>Finishing a 10-week loan adds points: {score.rules.cycleSteps.map(n => `+${n}`).join(', ')} for the 1st, 2nd, 3rd... completed loan. The score stops at {score.rules.max}.</li>
            <li>Paid late: −{score.rules.latePenalty}, and a further −{score.rules.extraPerLateWeek} for every full week of delay.</li>
            <li>A past-due week still unpaid: −{score.rules.overduePenalty} for each week.</li>
            <li>Staff reviews when a payment is collected: 5★ {score.rules.reviewPoints['5'] >= 0 ? '+' : ''}{score.rules.reviewPoints['5']}, 4★ +{score.rules.reviewPoints['4']}, 3★ 0, 2★ {score.rules.reviewPoints['2']}, 1★ {score.rules.reviewPoints['1']}. Reviews can move the score by at most ±{score.rules.reviewCap}.</li>
            <li>This is NGF&apos;s own score. It is not a CIBIL score.</li>
          </ul>
        )}
      </div>

      {loans.length === 0 && <p className="rounded-2xl border border-dashed border-line bg-white p-8 text-center text-sm text-soft">No loans yet.</p>}

      {loans.map((l, idx) => {
        const isOpen = open === l.loanId
        return (
          <div key={l.loanId} className={card}>
            <button type="button" className="flex w-full items-start justify-between gap-3 text-left" onClick={() => setOpen(isOpen ? '' : l.loanId)}>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-soft">Loan {loans.length - idx}</p>
                <p className="mt-0.5 font-mono text-sm font-semibold">{l.loanId}</p>
                <p className="font-mono text-xs text-soft">{l.loanAccountNo}</p>
                <p className="mt-1 text-xs text-soft">{money(l.principal)} · {money(l.weekly)} a week · {l.durationWeeks} weeks · {l.startDate && day(l.startDate)}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${l.completed ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{l.completed ? 'Completed' : l.status}</span>
                {l.points > 0 && <span className="text-xs font-bold text-green-700">+{l.points}</span>}
                {l.penalty > 0 && <span className="text-xs font-bold text-red-600">−{l.penalty}</span>}
                <ChevronDown className={`h-4 w-4 text-[#9ca3af] transition ${isOpen ? 'rotate-180' : ''}`} />
              </div>
            </button>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold">
              <span className="rounded-full bg-mist px-2 py-0.5">{l.paidWeeks}/{l.weeks.length} paid</span>
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-700">{l.onTimeWeeks} on time</span>
              {l.lateWeeks > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">{l.lateWeeks} late</span>}
              {l.overdueWeeks > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700">{l.overdueWeeks} overdue</span>}
            </div>

            {isOpen && (
              <ol className="mt-3 divide-y divide-black/5 border-t border-black/5">
                {l.weeks.map(w => (
                  <li key={w.weekNo} className="py-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">Week {w.weekNo} <span className="font-normal text-soft">· {day(w.dueDate)}</span></p>
                        <p className="text-xs text-soft">
                          {money(w.amount)}{w.mode && <> · {w.mode}</>}{w.utr && <> · UTR <span className="font-mono">{w.utr}</span>{w.utrStatus && w.utrStatus !== 'Verified' && <span className="text-amber-700"> ({w.utrStatus})</span>}</>}
                        </p>
                        {(w.outcome === 'on-time' || w.outcome === 'late') && (
                          <p className="text-xs text-[#4b5563]">
                            {w.recordedAt ? <>Recorded {stamp(w.recordedAt)}{w.recordedBy && <> by {w.recordedBy}</>}</> : <>Paid {w.paidDate ? day(w.paidDate) : ''} <span className="text-[#9ca3af]">(time not recorded)</span></>}
                          </p>
                        )}
                        {w.notes && <p className="text-xs italic text-[#9ca3af]">{w.notes}</p>}
                      </div>
                      <div className="shrink-0 text-right">
                        {w.outcome === 'on-time' && <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700"><CheckCircle2 className="h-3.5 w-3.5" />On time</span>}
                        {w.outcome === 'late' && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800"><Clock className="h-3.5 w-3.5" />Late {span(w.lateMinutes)}</span>}
                        {w.outcome === 'overdue' && <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700"><AlertTriangle className="h-3.5 w-3.5" />Overdue {span(w.lateMinutes)}</span>}
                        {w.outcome === 'upcoming' && <span className="rounded-full bg-mist px-2 py-0.5 text-xs font-semibold text-soft">Upcoming</span>}
                        {w.outcome === 'waived' && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700">Waived</span>}
                        {w.penalty > 0 && <p className="mt-0.5 text-xs font-bold text-red-600">−{w.penalty}</p>}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )
      })}
    </div>
  )
}
