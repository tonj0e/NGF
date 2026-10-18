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

export default function TripDetailsPage({ session }: { session: Session }) {
  const [trips, setTrips] = useState<AgentTrip[]>([])
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
        setTrips(data)
        const weekSet = new Set(data.map(t => t.weekStart).filter((w): w is string => Boolean(w)))
        const sortedWeeks = Array.from(weekSet).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
        setWeeks(sortedWeeks)
        if (sortedWeeks.length > 0 && !selectedWeek) {
          setSelectedWeek(sortedWeeks[0])
        }
      }
    } finally {
      loadedOnce.current = true
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [session.token])

  const filteredTrips = useMemo(() => {
    if (!selectedWeek) return trips
    return trips.filter(t => t.weekStart === selectedWeek)
  }, [trips, selectedWeek])

  const weeklyStats = useMemo(() => {
    if (!selectedWeek) return { totalKm: 0, totalTrips: 0, totalAmount: 0 }
    const weekTrips = trips.filter(t => t.weekStart === selectedWeek)
    const totalKm = weekTrips.reduce((sum, t) => sum + t.distanceKm, 0)
    const totalTrips = weekTrips.length
    const totalAmount = totalKm * 10 // ₹10 per km (configurable)
    return { totalKm, totalTrips, totalAmount }
  }, [trips, selectedWeek])

  if (loading && !loadedOnce.current) return <div className="flex h-40 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-[#1a1a2e] border-t-transparent" /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          <select value={selectedWeek} onChange={e => setSelectedWeek(e.target.value)}
            className="rounded-2xl border border-[#e5e7eb] bg-white px-4 py-2 text-sm font-medium outline-none focus:border-[#1a1a2e]">
            {weeks.map(w => (
              <option key={w} value={w}>{weekRangeLabel(w)}</option>
            ))}
            {weeks.length === 0 && <option value="">No trips yet</option>}
          </select>
        </div>
        <div className="flex gap-2 text-sm text-[#697586]">
          <span>Total: {weeklyStats.totalTrips} trips</span>
          <span>{weeklyStats.totalKm.toFixed(2)} km</span>
          <span className="font-semibold text-[#1a1a2e]">{currencyInr(weeklyStats.totalAmount)}</span>
        </div>
      </div>

      <div className="overflow-hidden rounded-[1.75rem] border border-white/70 bg-white shadow-panel divide-y divide-black/5">
        {filteredTrips.length === 0 ? (
          <p className="p-8 text-center text-sm text-[#697586]">No trips recorded for this week.</p>
        ) : (
          <div>
            <div className="border-b border-black/5 px-5 py-3 bg-[#f9fafb]">
              <div className="grid grid-cols-[1fr_80px_100px_100px_80px] gap-3 text-xs font-semibold uppercase tracking-wider text-[#697586]">
                <span>Date / Lead</span>
                <span className="text-right">Distance</span>
                <span className="text-right">Amount</span>
                <span className="text-right">Start → End</span>
                <span>Time</span>
              </div>
            </div>
            {filteredTrips.map((t, i) => (
              <div key={t.tripId || i} className="grid grid-cols-[1fr_80px_100px_100px_80px] gap-3 px-5 py-3 hover:bg-[#fafafa]">
                <div className="min-w-0">
                  <p className="font-medium truncate">{t.leadId ? `Lead: ${t.leadId}` : 'Manual Entry'}</p>
                  <p className="text-xs text-[#697586]">{t.tripDate}</p>
                </div>
                <div className="text-right font-medium">{t.distanceKm.toFixed(2)} km</div>
                <div className="text-right font-medium text-green-700">{currencyInr(t.distanceKm * 10)}</div>
                <div className="text-right text-xs text-[#697586]">
                  {t.startLatitude.toFixed(4)},{t.startLongitude.toFixed(4)} → {t.endLatitude.toFixed(4)},{t.endLongitude.toFixed(4)}
                </div>
                <div className="text-xs text-[#697586]">{new Date(t.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Weekly Summary */}
      {weeks.length > 0 && (
        <div className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel">
          <div className="border-b border-black/5 px-5 py-4">
            <p className="text-sm font-semibold">Weekly Summary</p>
          </div>
          <div className="divide-y divide-black/5">
            {weeks.map(w => {
              const weekTrips = trips.filter(t => t.weekStart === w)
              const totalKm = weekTrips.reduce((sum, t) => sum + t.distanceKm, 0)
              const totalTrips = weekTrips.length
              const totalAmount = totalKm * 10
              return (
                <div key={w} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-[#fafafa]">
                  <div>
                    <p className="font-medium">{weekRangeLabel(w)}</p>
                    <p className="text-xs text-[#697586]">{totalTrips} trips • {totalKm.toFixed(2)} km</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-green-700">{currencyInr(totalAmount)}</p>
                    <p className="text-xs text-[#697586]">@ ₹10/km</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}