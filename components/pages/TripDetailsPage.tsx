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

function straightKm(a: AgentTrip): number {
  const R = 6371, rad = (x: number) => x * Math.PI / 180
  const dLat = rad(a.endLatitude - a.startLatitude), dLon = rad(a.endLongitude - a.startLongitude)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.startLatitude)) * Math.cos(rad(a.endLatitude)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

const dayLabel = (ymd: string) => new Date(ymd.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })

export default function TripDetailsPage({ session }: { session: Session }) {
  const [trips, setTrips] = useState<AgentTrip[]>([])
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
        setTrips(data)
        const weekSet = new Set(data.map(t => t.weekStart).filter((w): w is string => Boolean(w)))
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

  const stats = useMemo(() => {
    const totalKm = weekTrips.reduce((sum, t) => sum + t.distanceKm, 0)
    const days = new Set(weekTrips.map(t => t.tripDate)).size
    return { totalKm, totalTrips: weekTrips.length, totalAmount: totalKm * rate, days, avg: weekTrips.length ? totalKm / weekTrips.length : 0 }
  }, [weekTrips, rate])

  // newest day first; inside a day, the first trip of the morning first
  const byDay = useMemo(() => {
    const m = new Map<string, AgentTrip[]>()
    weekTrips.forEach(t => { const k = t.tripDate.slice(0, 10); m.set(k, [...(m.get(k) || []), t]) })
    return Array.from(m.entries()).sort((a, b) => b[0].localeCompare(a[0])).map(([day, list]) => ({ day, list: list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) }))
  }, [weekTrips])

  if (loading && !loadedOnce.current) return <div className="flex h-40 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-ink border-t-transparent" /></div>

  return (
    <div className="space-y-4">
      {/* the summary comes first */}
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
          <div className="text-right">
            <p className="text-3xl font-bold text-green-700">{currencyInr(stats.totalAmount)}</p>
            <p className="text-xs text-soft">travel allowance @ ₹{rate}/km</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[['Trips', String(stats.totalTrips)], ['Distance', `${stats.totalKm.toFixed(1)} km`], ['Days worked', String(stats.days)], ['Average trip', `${stats.avg.toFixed(1)} km`]].map(([l, v]) => (
            <div key={l} className="rounded-2xl bg-mist px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-soft">{l}</p>
              <p className="mt-0.5 text-lg font-semibold">{v}</p>
            </div>
          ))}
        </div>
        {byDay.length > 1 && (
          <div className="mt-4 divide-y divide-black/5 rounded-2xl border border-line">
            {byDay.map(({ day, list }) => {
              const km = list.reduce((a, t) => a + t.distanceKm, 0)
              return (
                <div key={day} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="font-medium">{dayLabel(day)}</span>
                  <span className="text-soft">{list.length} trips · {km.toFixed(1)} km · <span className="font-semibold text-green-700">{currencyInr(km * rate)}</span></span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {byDay.length === 0 && <p className="rounded-[1.75rem] border border-white/70 bg-white p-8 text-center text-sm text-soft shadow-panel">No trips recorded for this week.</p>}

      {byDay.map(({ day, list }) => (
        <div key={day} className="overflow-hidden rounded-[1.75rem] border border-white/70 bg-white shadow-panel">
          <div className="flex items-center justify-between border-b border-black/5 bg-panel px-5 py-3">
            <p className="text-sm font-semibold">{dayLabel(day)}</p>
            <p className="text-xs text-soft">{list.length} trips · {list.reduce((a, t) => a + t.distanceKm, 0).toFixed(1)} km</p>
          </div>
          <div className="divide-y divide-black/5">
            {list.map((t, i) => {
              const crow = straightKm(t)
              return (
                <div key={t.tripId || i} className="px-5 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{t.customerName || (t.leadId ? t.leadId : 'Manual entry')}</p>
                      <p className="truncate text-xs text-soft">
                        {[t.place, t.leadId && t.customerName ? t.leadId : '', new Date(t.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold">{t.distanceKm.toFixed(2)} km</p>
                      <p className="text-sm font-semibold text-green-700">{currencyInr(t.distanceKm * rate)}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-soft">
                    <span>Straight line {crow.toFixed(2)} km</span>
                    <a className="font-semibold text-blue-600" target="_blank" rel="noopener noreferrer"
                      href={`https://www.google.com/maps/dir/${t.startLatitude},${t.startLongitude}/${t.endLatitude},${t.endLongitude}`}>View route on map</a>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
