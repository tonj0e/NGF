'use client'
import type { ReactNode } from 'react'
import type { Lead } from '@/types'
import { groupByWeek, recentWeeks, weekLabel } from '@/lib/leadWeeks'

// Leads by week (Monday to Sunday, India time): the week picker and the week-grouped list used by every Leads list.

// Week picker, the same pattern as the Payment Chat week filter: ‹ older · a drop-down · newer ›. The drop-down lists
// next week (leads can be filed up to the end of next week), this week and the 26 weeks before it. '' = All weeks.
// Older weeks than the list (none today) still show when chosen. From All weeks, ‹ goes to This week; › stops at the
// newest week (All weeks is chosen in the drop-down). `compact`: no arrows on phones (the drop-down alone, for a tight row).
export function LeadWeekPicker({ value, onChange, today, compact = false }: { value: string; onChange: (monday: string) => void; today: string; compact?: boolean }) {
  const weeks = recentWeeks(today, 27, 1)
  if (value && !weeks.includes(value)) weeks.push(value)
  const wi = value ? weeks.indexOf(value) : -1
  const THIS_WEEK = 1   // weeks[0] is next week
  const arrow = `h-10 w-10 shrink-0 rounded-xl border border-line bg-white text-lg leading-none disabled:opacity-30 ${compact ? 'hidden sm:block' : ''}`
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <button type="button" onClick={() => onChange(weeks[wi < 0 ? THIS_WEEK : Math.min(weeks.length - 1, wi + 1)])} disabled={wi >= weeks.length - 1}
        aria-label={wi < 0 ? 'This week' : 'Older week'} className={arrow}>‹</button>
      <select value={value} onChange={e => onChange(e.target.value)} aria-label="Choose a week"
        className="h-10 min-w-0 flex-1 rounded-2xl border border-line bg-white px-3 text-sm font-medium">
        <option value="">All weeks</option>
        {weeks.map(w => <option key={w} value={w}>{weekLabel(w, today)}</option>)}
      </select>
      <button type="button" onClick={() => onChange(weeks[wi - 1])} disabled={wi <= 0}
        aria-label="Newer week" className={arrow}>›</button>
    </div>
  )
}

// The page's leads (already newest first) under week headers. The header shows how many leads that week has in the
// whole list (`totals` from the server); when part of the week is on another page it says how many are on this one.
// Headers stick to the top while their week scrolls past (-top-4 cancels the page scroller's top padding, py-4 at every
// width in AppShell, so no list content peeks above a stuck header).
export function LeadWeekGroups({ rows, totals, today, renderLead, empty }: {
  rows: Lead[]; totals?: Record<string, number>; today: string; renderLead: (l: Lead, i: number) => ReactNode; empty?: ReactNode
}) {
  if (!rows.length) return empty ? <div className="overflow-hidden rounded-[1.75rem] border border-white/70 bg-white shadow-panel">{empty}</div> : null
  const groups = groupByWeek(rows, l => l.submittedDate, today)
  return (
    <div className="space-y-4">
      {groups.map(g => {
        const total = Math.max(totals?.[g.monday] ?? g.rows.length, g.rows.length)
        const [when, range] = g.label.includes(' · ') ? g.label.split(' · ') : ['', g.label]
        return (
          <section key={g.monday || 'none'} aria-label={g.label}>
            <div className="sticky -top-4 z-10 mb-2 flex items-center justify-between gap-3 rounded-2xl border border-line bg-white/95 px-4 py-2.5 shadow-sm backdrop-blur">
              <h3 className="min-w-0 text-sm font-semibold">
                {when ? <>{when}<span className="font-normal text-soft"> · {range}</span></> : range}
              </h3>
              <span className="flex shrink-0 items-center gap-2 text-xs text-soft">
                {total > g.rows.length && <span className="hidden sm:inline">{g.rows.length} on this page</span>}
                <span className="rounded-full bg-mist px-2.5 py-0.5 font-bold text-ink">{total} lead{total === 1 ? '' : 's'}</span>
              </span>
            </div>
            <div className="overflow-hidden rounded-[1.75rem] border border-white/70 bg-white shadow-panel divide-y divide-black/5">
              {g.rows.map(renderLead)}
            </div>
            {total > g.rows.length && <p className="mt-1.5 px-2 text-[11px] text-soft sm:hidden">{g.rows.length} of {total} on this page</p>}
          </section>
        )
      })}
    </div>
  )
}

// Shown while a new part, week or page loads, so the previous list (or an empty message) is not mistaken for the answer
export function LeadListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading leads" className="space-y-4">
      <div className="h-10 animate-pulse rounded-2xl border border-line bg-white/95" />
      <div className="overflow-hidden rounded-[1.75rem] border border-white/70 bg-white shadow-panel divide-y divide-black/5">
        {[0, 1, 2].map(i => (
          <div key={i} className="space-y-2 p-4 sm:p-5">
            <div className="h-4 w-2/5 animate-pulse rounded bg-mist" />
            <div className="h-3 w-3/5 animate-pulse rounded bg-mist" />
          </div>
        ))}
      </div>
    </div>
  )
}
