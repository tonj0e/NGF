'use client'
import { useCallback, useEffect, useState } from 'react'
import { Session } from '@/types'
import { Phone, Navigation, MapPin, RefreshCw } from 'lucide-react'
import RouteMap from '@/components/routes/RouteMap'

type Stop = {
  leadId: string; customerName: string; phone: string; place: string; address: string; landmark: string; guarantorName: string
  visitLat: number | null; visitLng: number | null; visitPlace: string; visitWindow: string; visitNote: string
  visitStatus: string; seq: number | null; legKm: number | null; legMin: number | null; done: boolean; hasLocation: boolean; status: string
}
type Mine = {
  date: string; config: { enabled: boolean; windows: boolean }; stops: Stop[]
  plan: { startLat: number | null; startLng: number | null; startSource: string; totalKm: number | null; totalMin: number | null; manual: boolean } | null
}

const card = 'rounded-[1.75rem] border border-white/70 bg-white shadow-panel p-4 sm:p-5'
const hm = (min: number | null) => (min == null ? '' : min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min} min`)
const today = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)
const shift = (d: string, n: number) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10) }

async function api(session: Session, path: string, body?: unknown) {
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${session.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({ success: false, error: 'Unexpected server response' }))
  if (!json.success) throw new Error(json.error || 'Something went wrong')
  return json.data
}

export default function MyRoutePage({ session, onOpenVerification }: { session: Session; onOpenVerification?: () => void }) {
  const [date, setDate] = useState(today())
  const [data, setData] = useState<Mine | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState('')
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500) }

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try { setData(await api(session, `/api/routes?view=mine&date=${date}`)); setError('') }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to load') }
    setLoading(false)
  }, [session, date])
  useEffect(() => { load() }, [load])

  async function setStatus(leadId: string, status: string) {
    setBusy(leadId + status)
    try { await api(session, '/api/routes', { action: 'stopStatus', leadId, status }); await load(true) }
    catch (e) { flash(e instanceof Error ? e.message : 'Failed') }
    setBusy('')
  }

  function replan() {
    if (!navigator.geolocation) { flash('This phone cannot share its location'); return }
    setBusy('replan')
    navigator.geolocation.getCurrentPosition(async pos => {
      try {
        await api(session, '/api/routes', { action: 'replan', lat: pos.coords.latitude, lng: pos.coords.longitude, date })
        flash('Remaining stops re-ordered from where you are'); await load(true)
      } catch (e) { flash(e instanceof Error ? e.message : 'Failed') }
      setBusy('')
    }, () => { flash('Allow location access to re-plan'); setBusy('') }, { enableHighAccuracy: true, timeout: 15000 })
  }

  if (error && !data) return <div className={card}><p className="text-sm text-red-600">{error}</p></div>
  const stops = data?.stops || []
  const next = stops.find(s => !s.done)
  const sketchStops = stops.flatMap((s, i) => s.hasLocation && s.visitLat != null && s.visitLng != null
    ? [{ id: s.leadId, n: i + 1, label: s.visitPlace || s.place || s.customerName, lat: s.visitLat, lng: s.visitLng, done: s.done, absent: s.visitStatus === 'Absent', legKm: s.legKm }]
    : [])
  const startPt = data?.plan?.startLat != null && data?.plan?.startLng != null ? { lat: data.plan.startLat, lng: data.plan.startLng } : null
  const pickStop = (id: string) => document.getElementById(`stop-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })

  return (
    <div className="space-y-4">
      <div className={`${card} flex flex-wrap items-center justify-between gap-3`}>
        <div className="flex items-center gap-1">
          <button className="rounded-xl border border-[#e5e7eb] px-3 py-2.5 text-sm" onClick={() => setDate(shift(date, -1))}>‹</button>
          <input type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)} className="rounded-2xl border border-[#e5e7eb] px-3 py-2.5 text-sm font-medium" />
          <button className="rounded-xl border border-[#e5e7eb] px-3 py-2.5 text-sm" onClick={() => setDate(shift(date, 1))}>›</button>
        </div>
        <div className="text-right text-xs text-[#697586]">
          <p className="text-sm font-semibold text-[#1a1a2e]">{stops.length} {stops.length === 1 ? 'visit' : 'visits'}{data?.plan?.totalKm != null && stops.length > 0 && <> · {data.plan.totalKm} km · {hm(data.plan.totalMin)}</>}</p>
          {data?.plan?.startSource && <p>Starting from: {data.plan.startSource}</p>}
        </div>
      </div>

      {stops.some(s => !s.done) && date === today() && (
        <button onClick={replan} disabled={busy === 'replan'} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[#1a1a2e] bg-white px-4 py-3 text-sm font-semibold disabled:opacity-40">
          <RefreshCw className="h-4 w-4" />{busy === 'replan' ? 'Working…' : 'Re-plan from where I am now'}
        </button>
      )}

      {sketchStops.length > 0 && (
        <RouteMap start={startPt} startLabel="START"
          stops={sketchStops} nextId={next?.leadId} onPick={pickStop} />
      )}

      {loading && <p className="p-8 text-center text-sm text-[#697586]">Loading…</p>}
      {!loading && !stops.length && <p className="p-8 text-center text-sm text-[#697586]">No visits planned for this day.</p>}

      <div className="space-y-3">
        {stops.map((s, i) => {
          const isNext = next?.leadId === s.leadId
          const nav = s.hasLocation ? `https://www.google.com/maps/dir/?api=1&destination=${s.visitLat},${s.visitLng}&travelmode=driving` : ''
          return (
            <div key={s.leadId} id={`stop-${s.leadId}`} className={`${card} ${isNext ? 'ring-2 ring-[#f0b429]' : ''} ${s.done ? 'opacity-70' : ''}`}>
              <div className="flex items-start gap-3">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${s.done ? 'bg-green-600 text-white' : 'bg-[#1a1a2e] text-white'}`}>{s.done ? '✓' : i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{s.customerName}</p>
                  <p className="text-xs text-[#697586]"><MapPin className="mr-0.5 inline h-3 w-3" />{s.visitPlace || s.place}{s.landmark && <> · {s.landmark}</>}</p>
                  <p className="mt-0.5 text-xs text-[#697586]">
                    {s.legKm != null && <>{i === 0 ? 'From start' : 'From previous stop'}: <span className="font-semibold text-[#1a1a2e]">{s.legKm} km · {hm(s.legMin)}</span></>}
                    {s.visitWindow && <> · <span className="font-semibold text-violet-700">{s.visitWindow}</span></>}
                  </p>
                  {s.visitNote && <p className="mt-1 rounded-xl bg-amber-50 px-3 py-1.5 text-xs text-amber-900">{s.visitNote}</p>}
                  {s.visitStatus && <p className="mt-1 text-xs font-semibold text-blue-700">{s.visitStatus === 'Absent' ? 'Customer was not at home' : s.visitStatus}</p>}
                </div>
              </div>
              {!s.done && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {nav && <a href={nav} target="_blank" rel="noreferrer" onClick={() => s.visitStatus !== 'On the way' && setStatus(s.leadId, 'On the way')} className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-[#1a1a2e] px-3 py-3 text-sm font-semibold text-white"><Navigation className="h-4 w-4" />Navigate</a>}
                  {s.phone && <a href={`tel:${s.phone}`} className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-green-600 px-3 py-3 text-sm font-semibold text-white"><Phone className="h-4 w-4" />Call</a>}
                  <button onClick={() => setStatus(s.leadId, 'Reached')} disabled={!!busy} className="rounded-2xl border border-[#e5e7eb] px-3 py-3 text-sm font-semibold disabled:opacity-40">I have reached</button>
                  <button onClick={() => { if (confirm('Mark the customer as not at home? The branch will be told to reschedule.')) setStatus(s.leadId, 'Absent') }} disabled={!!busy} className="rounded-2xl border border-red-200 px-3 py-3 text-sm font-semibold text-red-600 disabled:opacity-40">Not at home</button>
                  {onOpenVerification && s.visitStatus === 'Reached' && (
                    <button onClick={onOpenVerification} className="col-span-2 rounded-2xl bg-[#f0b429] px-3 py-3 text-sm font-semibold text-[#1a1400]">Start verification</button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {toast && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-2xl bg-[#1a1a2e] px-5 py-3 text-sm font-medium text-white shadow-lg">{toast}</div>}
    </div>
  )
}
