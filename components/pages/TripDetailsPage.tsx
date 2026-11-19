'use client'
import { useEffect, useRef, useState, useMemo } from 'react'
import { Session, AgentTrip } from '@/types'

function currencyInr(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

function ymdLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function weekStartIso(dateStr: string): string {
  const d = new Date(dateStr.slice(0, 10) + 'T00:00:00')
  if (isNaN(d.getTime())) return ''
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return ymdLocal(d)
}

function weekRangeLabel(weekIso: string): string {
  const start = new Date(weekIso + 'T00:00:00')
  const end = new Date(start); end.setDate(end.getDate() + 5)
  const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')} ${d.toLocaleString('en-IN', { month: 'short' })}`
  return `${fmt(start)} – ${fmt(end)} ${end.getFullYear()}`
}

const dayLabel = (ymd: string) => new Date(ymd.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })

type RouteLeg = { id: string; name: string; place: string; subroute: boolean; seq: number; km: number }
type RouteDay = { date: string; legs: RouteLeg[]; km: number }

export default function TripDetailsPage({ session }: { session: Session }) {
  const [trips, setTrips] = useState<AgentTrip[]>([])
  const [routeDays, setRouteDays] = useState<RouteDay[]>([])
  const [rate, setRate] = useState(3)
  const [loading, setLoading] = useState(true)
  const loadedOnce = useRef(false)
  const [selectedWeek, setSelectedWeek] = useState<string>('')
  const [weeks, setWeeks] = useState<string[]>([])

  async function load() {
    if (!loadedOnce.current) setLoading(true)
    try {
      const res = await fetch('/api/agent/trips', { headers: { Authorization: `Bearer ${session.token}` } })
      const json = await res.json()
      if (json.success) {
        const data = (json.data.trips || []) as AgentTrip[]
        if (typeof json.data.ratePerKm === 'number') setRate(json.data.ratePerKm)
        const rd = (json.data.routeDays || []) as RouteDay[]
        setTrips(data)
        setRouteDays(rd)
        const weekSet = new Set([...data.map(t => t.weekStart), ...rd.map(d => weekStartIso(d.date))].filter((w): w is string => Boolean(w)))
        const sortedWeeks = Array.from(weekSet).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
        setWeeks(sortedWeeks)
        if (sortedWeeks.length > 0 && !selectedWeek) setSelectedWeek(sortedWeeks[0])
      }
    } finally {
      loadedOnce.current = true
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [session.token])

  const weekTrips = useMemo(() => selectedWeek ? trips.filter(t => t.weekStart === selectedWeek) : trips, [trips, selectedWeek])
  const weekRoute = useMemo(() => selectedWeek ? routeDays.filter(d => weekStartIso(d.date) === selectedWeek) : routeDays, [routeDays, selectedWeek])

  // Paid on the real road kilometres of the finished stops. What the agent typed is shown next to it for comparison.
  const stats = useMemo(() => {
    const routeKm = weekRoute.reduce((s, d) => s + d.km, 0)
    const enteredKm = weekTrips.reduce((s, t) => s + t.distanceKm, 0)
    const stopCount = weekRoute.reduce((s, d) => s + d.legs.length, 0)
    return { routeKm, enteredKm, stopCount, amount: routeKm * rate, days: weekRoute.length }
  }, [weekRoute, weekTrips, rate])

  // newest day first
  const days = useMemo(() => {
    const keys = new Set([...weekRoute.map(d => d.date), ...weekTrips.map(t => t.tripDate.slice(0, 10))])
    return Array.from(keys).sort((a, b) => b.localeCompare(a)).map(day => ({
      day,
      route: weekRoute.find(d => d.date === day) || null,
      entries: weekTrips.filter(t => t.tripDate.slice(0, 10) === day).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    }))
  }, [weekRoute, weekTrips])

  const diffNote = (route: number, entered: number) => {
    const d = Math.round((route - entered) * 10) / 10
    if (Math.abs(d) < 0.5) return { text: 'Matches what the agent entered', cls: 'text-green-700' }
    return d > 0 ? { text: `Agent entered ${d} km less than the route`, cls: 'text-amber-700' } : { text: `Agent entered ${-d} km more than the route`, cls: 'text-red-600' }
  }

  if (loading && !loadedOnce.current) return <div className="flex h-40 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-ink border-t-transparent" /></div>

  return (
    <div className="space-y-4">
      <div className="rounded-[1.75rem] border border-white/70 bg-white p-5 shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-soft">Weekly summary</p>
            <select value={selectedWeek} onChange={e => setSelectedWeek(e.target.value)}
              className="mt-1 rounded-2xl border border-line bg-white px-4 py-2 text-sm font-medium outline-none focus:border-ink">
              {weeks.map(w => <option key={w} value={w}>{weekRangeLabel(w)}</option>)}
              {weeks.length === 0 && <option value="">No trips yet</option>}
            </select>
          </div>
          {/* on a phone this block drops under the week picker, so it lines up on the left there */}
          <div className="text-left sm:text-right">
            <p className="text-3xl font-bold text-green-700">{currencyInr(stats.amount)}</p>
            <p className="text-xs text-soft">travel allowance @ ₹{rate}/km on the road km</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[['Road distance', `${stats.routeKm.toFixed(1)} km`], ['Stops done', String(stats.stopCount)], ['Days worked', String(stats.days)], ['Agent entered', `${stats.enteredKm.toFixed(1)} km`]].map(([l, v]) => (
            <div key={l} className="rounded-2xl bg-mist px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-soft">{l}</p>
              <p className="mt-0.5 text-lg font-semibold">{v}</p>
            </div>
          ))}
        </div>
        {stats.routeKm > 0 && <p className={`mt-3 text-xs font-semibold ${diffNote(stats.routeKm, stats.enteredKm).cls}`}>{diffNote(stats.routeKm, stats.enteredKm).text}</p>}
      </div>

      {days.length === 0 && <p className="rounded-[1.75rem] border border-white/70 bg-white p-8 text-center text-sm text-soft shadow-panel">No trips recorded for this week.</p>}

      {days.map(({ day, route, entries }) => {
        const entered = entries.reduce((a, t) => a + t.distanceKm, 0)
        const routeKm = route?.km || 0
        const note = diffNote(routeKm, entered)
        return (
          <div key={day} className="overflow-hidden rounded-[1.75rem] border border-white/70 bg-white shadow-panel">
            <div className="border-b border-black/5 bg-panel px-5 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{dayLabel(day)}</p>
                <p className="text-right text-sm font-bold text-green-700">{routeKm.toFixed(1)} km · {currencyInr(routeKm * rate)}</p>
              </div>
              <p className="mt-0.5 flex flex-wrap items-center justify-between gap-x-3 text-xs text-soft">
                <span>Agent entered {entered.toFixed(1)} km in {entries.length} {entries.length === 1 ? 'entry' : 'entries'}</span>
                {routeKm > 0 && <span className={`font-semibold ${note.cls}`}>{note.text}</span>}
              </p>
            </div>
            {route && route.legs.length > 0 && (
              <div className="divide-y divide-black/5">
                {route.legs.map((l, i) => (
                  <div key={l.id} className="flex items-start justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{i + 1}. {l.name}{l.subroute && <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase text-violet-700">Subroute</span>}</p>
                      <p className="truncate text-xs text-soft">{i === 0 ? 'From the start point' : 'From the stop before'}{l.place ? ` · ${l.place}` : ''}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold">{l.km.toFixed(1)} km</p>
                      <p className="text-xs font-semibold text-green-700">{currencyInr(l.km * rate)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {entries.length > 0 && (
              <div className="border-t border-black/5 bg-mist/60 px-5 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-soft">What the agent entered</p>
                <div className="mt-1 divide-y divide-black/5">
                  {entries.map((t, i) => (
                    <div key={t.tripId || i} className="flex items-center justify-between gap-3 py-1.5 text-xs">
                      <span className="min-w-0 truncate">{new Date(t.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} · {t.customerName || t.leadId || 'Manual entry'}</span>
                      <span className="flex shrink-0 items-center gap-3">
                        <a className="font-semibold text-blue-600" target="_blank" rel="noopener noreferrer"
                          href={`https://www.google.com/maps/dir/${t.startLatitude},${t.startLongitude}/${t.endLatitude},${t.endLongitude}`}>Map</a>
                        <span className="font-semibold">{t.distanceKm.toFixed(1)} km</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
