'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Session, Lead } from '@/types'
import { todayIST, mondayOf, addDays as plusDays, weekLabel } from '@/lib/leadWeeks'

// Leads History grouped by week (Monday to Sunday, India time; labels from lib/leadWeeks, the same as the other Leads
// lists) and then by day. A week opens to its days, a day opens to its leads.
// Only the day counts are loaded first; the leads of a day are fetched when that day is opened.
// `weekStart` (the Leads page's week filter): only that week is shown, already open (the page remounts this list,
// keyed by the week, so a newly chosen week starts open).

// "Monday, 17 Nov" (the date is a calendar date, so it is read as UTC: the browser's time zone does not move it)
const dayLabel = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })

export default function LeadsHistoryWeeks({ session, search, branch, weekStart = '', version, renderLead }: {
  session: Session; search: string; branch: string; weekStart?: string; version: number; renderLead: (l: Lead, i: number) => React.ReactNode
}) {
  const today = todayIST()
  const [weeksBack, setWeeksBack] = useState(12)
  const [perDay, setPerDay] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [openWeeks, setOpenWeeks] = useState<Set<string>>(new Set([weekStart || mondayOf(today)]))   // this week (or the chosen one) starts open
  const [openDays, setOpenDays] = useState<Set<string>>(new Set())
  const [dayLeads, setDayLeads] = useState<Record<string, Lead[] | 'loading'>>({})
  const seq = useRef(0)
  const first = useRef(true)

  const headers = { Authorization: `Bearer ${session.token}` }
  const query = `q=${encodeURIComponent(search.trim())}&branch=${encodeURIComponent(branch)}${weekStart ? `&weekStart=${weekStart}` : ''}`

  const loadDays = useCallback(async () => {
    const my = ++seq.current
    const res = await fetch(`/api/leads?tab=history&days=1&weeks=${weeksBack}&${query}`, { headers })
    const json = await res.json().catch(() => null)
    if (my !== seq.current || !json?.success) return
    setPerDay(json.data.perDay || {}); setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeksBack, search, branch, weekStart, session.token])

  async function loadDay(day: string) {
    setDayLeads(p => ({ ...p, [day]: 'loading' }))
    const res = await fetch(`/api/leads?tab=history&day=${day}&page=1&pageSize=200&${query}`, { headers })
    const json = await res.json().catch(() => null)
    setDayLeads(p => ({ ...p, [day]: json?.success ? json.data.rows : [] }))
  }

  // a new search/branch/refresh: reload the counts and any day that is open
  useEffect(() => {
    const t = setTimeout(() => { loadDays(); openDays.forEach(d => loadDay(d)) }, first.current ? 0 : 300)
    first.current = false
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeksBack, search, branch, weekStart, version])

  const toggle = (set: Set<string>, key: string) => { const n = new Set(set); n.has(key) ? n.delete(key) : n.add(key); return n }

  // week (Monday) -> its days, newest first
  const weekMap = new Map<string, string[]>()
  for (const d of Object.keys(perDay)) { const w = mondayOf(d); weekMap.set(w, [...(weekMap.get(w) || []), d]) }
  const thisMonday = mondayOf(today)
  const pinned = weekStart || thisMonday
  if (!weekMap.has(pinned)) weekMap.set(pinned, [])   // this week (or the chosen week) is always shown, even when empty
  const weeks = Array.from(weekMap.keys()).filter(w => !weekStart || w === weekStart).sort().reverse()

  if (loading) return <p className="p-8 text-center text-sm text-soft">Loading…</p>

  return (
    <div className="space-y-3">
      {weeks.map(w => {
        const days = weekMap.get(w)!
        const total = days.reduce((n, d) => n + perDay[d], 0)
        const open = openWeeks.has(w)
        // Monday to Friday always; Saturday / Sunday only when a lead was taken then
        const shown = [0, 1, 2, 3, 4].map(i => plusDays(w, i)).concat([5, 6].map(i => plusDays(w, i)).filter(d => perDay[d]))
        return (
          <div key={w} className="overflow-hidden rounded-[1.5rem] border border-white/70 bg-white shadow-panel">
            <button onClick={() => setOpenWeeks(toggle(openWeeks, w))} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left">
              <span>
                <span className="block text-sm font-semibold">{weekLabel(w, today)}</span>
                <span className="text-xs text-soft">{total} lead{total === 1 ? '' : 's'}</span>
              </span>
              <ChevronDown size={18} className={`shrink-0 text-soft transition ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
              <div className="divide-y divide-black/5 border-t border-black/5">
                {shown.map(d => {
                  const n = perDay[d] || 0, dOpen = openDays.has(d), rows = dayLeads[d]
                  return (
                    <div key={d}>
                      <button disabled={!n} onClick={() => { setOpenDays(toggle(openDays, d)); if (!dOpen && !Array.isArray(rows)) loadDay(d) }}
                        className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left disabled:cursor-default">
                        <span className={`text-sm ${n ? 'font-medium' : 'text-gray-400'}`}>{dayLabel(d)}</span>
                        <span className="flex items-center gap-2">
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${n ? 'bg-mist' : 'text-gray-400'}`}>{n ? `${n} lead${n === 1 ? '' : 's'}` : 'No leads'}</span>
                          {n > 0 && <ChevronDown size={16} className={`text-soft transition ${dOpen ? 'rotate-180' : ''}`} />}
                        </span>
                      </button>
                      {dOpen && n > 0 && (
                        <div className="divide-y divide-black/5 border-t border-black/5 bg-panel">
                          {rows === 'loading' || !rows ? <p className="p-5 text-center text-xs text-soft">Loading…</p> : rows.map(renderLead)}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
      {!weekStart && <button onClick={() => setWeeksBack(w => w + 12)} className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm font-semibold text-soft">Show older weeks</button>}
    </div>
  )
}
