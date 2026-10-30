'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Session } from '@/types'
import { Phone, Navigation, MapPin, X } from 'lucide-react'
import RouteMap from '@/components/routes/RouteMap'
import VerificationsPage from './VerificationsPage'
import { fetchRoads } from '@/lib/clientRoads'

type Stop = {
  leadId: string; customerName: string; phone: string; altPhone?: string; altPhoneLabel?: string; place: string; address: string; landmark: string; guarantorName: string
  visitLat: number | null; visitLng: number | null; visitPlace: string; visitWindow: string; visitNote: string
  visitStatus: string; seq: number | null; legKm: number | null; legMin: number | null; done: boolean; hasLocation: boolean; status: string; kind?: 'lead' | 'waypoint'; forCustomer?: string
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

// `active` is false while the page is kept hidden behind another page (the map stays loaded, so coming back costs no new map load)
export default function MyRoutePage({ session, active = true }: { session: Session; active?: boolean }) {
  const [verifyId, setVerifyId] = useState('')
  // "Submit now" from the pending-verification prompt: the shell sends the agent here with the lead to open
  useEffect(() => {
    const take = () => { try { const id = sessionStorage.getItem('ngf_open_verify'); if (id) { sessionStorage.removeItem('ngf_open_verify'); setVerifyId(id) } } catch { /* storage blocked */ } }
    take()
    window.addEventListener('ngf:openverify', take)
    return () => window.removeEventListener('ngf:openverify', take)
  }, [])
  const [date, setDate] = useState(today())
  const [data, setData] = useState<Mine | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState('')
  const [roads, setRoads] = useState<(string | null)[] | null>(null)
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500) }

  const seq = useRef(0)   // only the newest request may fill the page (a slow older answer must not overwrite a newer day)
  const load = useCallback(async (quiet = false) => {
    const mine = ++seq.current
    if (!quiet) setLoading(true)
    try { const d = await api(session, `/api/routes?view=mine&date=${date}`); if (mine === seq.current) { setData(d); setError('') } }
    catch (e) { if (mine === seq.current) setError(e instanceof Error ? e.message : 'Failed to load') }
    if (mine === seq.current) setLoading(false)
  }, [session, date])
  useEffect(() => { load() }, [load])
  const wasActive = useRef(active)
  useEffect(() => { if (active && !wasActive.current) load(true); wasActive.current = active }, [active]) // eslint-disable-line react-hooks/exhaustive-deps

  async function markWaypointDone(waypointId: string) {
    setBusy(waypointId)
    try { await api(session, '/api/routes', { action: 'waypointDone', waypointId }); await load(true) }
    catch (e) { flash(e instanceof Error ? e.message : 'Failed') }
    setBusy('')
  }

  const [noVisit, setNoVisit] = useState<string | null>(null)
  async function setStatus(leadId: string, status: string, reason?: string) {
    setBusy(leadId + status)
    try { await api(session, '/api/routes', { action: 'stopStatus', leadId, status, reason }); await load(true) }
    catch (e) { flash(e instanceof Error ? e.message : 'Failed') }
    setBusy('')
  }

  // road shape for the map (display only; falls back to straight lines if it cannot be fetched)
  const roadPts = (() => {
    const st = (data?.stops || []).filter(s => s.hasLocation && s.visitLat != null && s.visitLng != null).map(s => ({ lat: s.visitLat as number, lng: s.visitLng as number }))
    const a = data?.plan?.startLat, b = data?.plan?.startLng
    return [...(a != null && b != null ? [{ lat: a, lng: b }] : []), ...st]
  })()
  const roadKey = roadPts.map(p => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join('|')
  useEffect(() => {
    let dead = false
    setRoads(null)
    if (roadPts.length < 2 || roadPts.length > 26) return
    fetchRoads(session.token, roadPts).then(legs => { if (!dead && legs) setRoads(legs) }).catch(() => {})
    return () => { dead = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, roadKey])

  if (error && !data) return <div className={card}><p className="text-sm text-red-600">{error}</p></div>
  const stops = data?.stops || []
  const next = stops.find(s => !s.done)
  // progress counts customers only; subroutes are just places to pass through
  const custStops = stops.filter(s => s.kind !== 'waypoint')
  const doneCount = custStops.filter(s => s.done).length
  const sketchStops = stops.flatMap((s, i) => s.hasLocation && s.visitLat != null && s.visitLng != null
    ? [{ id: s.leadId, n: i + 1, label: s.visitPlace || s.place || s.customerName, lat: s.visitLat, lng: s.visitLng, done: s.done, absent: s.visitStatus === 'Absent', waypoint: s.kind === 'waypoint', legKm: s.legKm }]
    : [])
  const startPt = data?.plan?.startLat != null && data?.plan?.startLng != null ? { lat: data.plan.startLat, lng: data.plan.startLng } : null
  const pickStop = (id: string) => document.getElementById(`stop-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-[2rem] bg-white shadow-panel ring-1 ring-black/5">
        <div className="relative overflow-hidden bg-gradient-to-br from-[#14142b] via-[#1f1d4d] to-[#35286e] px-4 pb-4 pt-4 text-white">
          <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-gold/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-indigo-400/20 blur-3xl" />
          <div className="relative flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-3xl font-extrabold leading-none tracking-tight">{doneCount}<span className="text-xl font-bold text-white/45"> / {custStops.length}</span></p>
              <p className="mt-1 text-xs text-white/65">{custStops.length === 0 ? 'No visits planned' : doneCount === custStops.length ? 'All visits done 🎉' : `${custStops.length - doneCount} to go`}</p>
            </div>
            <svg width="60" height="60" viewBox="0 0 76 76" className="shrink-0" aria-hidden>
              <circle cx="38" cy="38" r="31" fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="8" />
              <circle cx="38" cy="38" r="31" fill="none" stroke="url(#ringg)" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(custStops.length ? doneCount / custStops.length : 0) * 194.8} 194.8`} transform="rotate(-90 38 38)" className="transition-all duration-700" />
              <defs><linearGradient id="ringg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#34d399" /><stop offset="1" stopColor="#bef264" /></linearGradient></defs>
              <text x="38" y="43" textAnchor="middle" fontSize="17" fontWeight="800" fill="#fff">{custStops.length ? Math.round(doneCount / custStops.length * 100) : 0}%</text>
            </svg>
            <div className="flex shrink-0 items-center rounded-full bg-white/10 p-0.5 ring-1 ring-white/15 backdrop-blur">
              <button aria-label="Previous day" className="grid h-6 w-6 place-items-center rounded-full text-sm hover:bg-white/15" onClick={() => setDate(shift(date, -1))}>‹</button>
              <input type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)} className="w-[5.6rem] bg-transparent text-center text-[11px] font-semibold text-white [color-scheme:dark] focus:outline-none" />
              <button aria-label="Next day" className="grid h-6 w-6 place-items-center rounded-full text-sm hover:bg-white/15" onClick={() => setDate(shift(date, 1))}>›</button>
            </div>
          </div>

          <div className="relative mt-3 grid grid-cols-3 gap-2">
            {[
              ['Visits', String(stops.length)],
              ['Distance', data?.plan?.totalKm != null && stops.length > 0 ? `${data.plan.totalKm} km` : '—'],
              ['Drive time', data?.plan?.totalMin != null && stops.length > 0 ? hm(data.plan.totalMin) : '—'],
            ].map(([k, v]) => (
              <div key={k} className="rounded-2xl bg-white/10 px-3 py-2.5 ring-1 ring-white/10 backdrop-blur">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-white/55">{k}</p>
                <p className="mt-0.5 text-base font-bold leading-tight">{v}</p>
              </div>
            ))}
          </div>

          {data?.plan?.startSource && (
            <p className="relative mt-3 flex items-center gap-2 text-xs text-white/65"><span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,.22)]" />Starting from: {data.plan.startSource}</p>
          )}
        </div>

        {sketchStops.length > 0 && (
          <RouteMap bare start={startPt} startLabel="START"
            stops={sketchStops} nextId={next?.leadId} onPick={pickStop} roads={roads} />
        )}
      </div>

      {loading && <p className="p-8 text-center text-sm text-soft">Loading…</p>}
      {!loading && !stops.length && <p className="p-8 text-center text-sm text-soft">No visits planned for this day.</p>}

      <div className="space-y-3">
        {stops.map((s, i) => {
          const isNext = next?.leadId === s.leadId
          const nav = s.hasLocation ? `https://www.google.com/maps/dir/?api=1&destination=${s.visitLat},${s.visitLng}&travelmode=driving` : ''
          return (
            <div key={s.leadId} id={`stop-${s.leadId}`} className={`${card} ${isNext ? 'ring-2 ring-gold' : ''} ${s.done ? 'opacity-70' : ''}`}>
              <div className="flex items-start gap-3">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${s.done ? 'bg-green-600 text-white' : s.kind === 'waypoint' ? 'bg-violet-600 text-white' : 'bg-ink text-white'}`}>{s.done ? '✓' : i + 1}</span>
                <div className="min-w-0 flex-1">
                  {s.kind === 'waypoint' && <p className="text-[10px] font-bold uppercase tracking-wider text-violet-700">Subroute{s.forCustomer ? ` · for ${s.forCustomer}` : ''} · no verification, only Mark done</p>}
                  <p className="font-semibold">{s.customerName}</p>
                  <p className="text-xs text-soft"><MapPin className="mr-0.5 inline h-3 w-3" />{s.visitPlace || s.place}{s.landmark && <> · {s.landmark}</>}</p>
                  <p className="mt-0.5 text-xs text-soft">
                    {s.legKm != null && <>{i === 0 ? 'From start' : 'From previous stop'}: <span className="font-semibold text-ink">{s.legKm} km · {hm(s.legMin)}</span></>}
                    {s.visitWindow && <> · <span className="font-semibold text-violet-700">{s.visitWindow}</span></>}
                  </p>
                  {s.visitNote && <p className="mt-1 rounded-xl bg-amber-50 px-3 py-1.5 text-xs text-amber-900">{s.visitNote}</p>}
                  {s.visitStatus && <p className="mt-1 text-xs font-semibold text-blue-700">{s.visitStatus === 'Absent' ? 'Customer was not at home' : s.visitStatus}</p>}
                </div>
              </div>
              {s.kind === 'waypoint' && !s.done && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {nav && <a href={nav} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-ink px-3 py-3 text-sm font-semibold text-white"><Navigation className="h-4 w-4" />Navigate</a>}
                  <button onClick={() => markWaypointDone(s.leadId)} disabled={!!busy} className="rounded-2xl bg-violet-600 px-3 py-3 text-sm font-bold text-white disabled:opacity-40">Mark done</button>
                </div>
              )}
              {s.kind !== 'waypoint' && !s.done && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {nav && <a href={nav} target="_blank" rel="noreferrer" onClick={() => s.visitStatus !== 'On the way' && setStatus(s.leadId, 'On the way')} className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-ink px-3 py-3 text-sm font-semibold text-white"><Navigation className="h-4 w-4" />Navigate</a>}
                  {s.phone && <a href={`tel:${s.phone}`} className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-green-600 px-3 py-3 text-sm font-semibold text-white"><Phone className="h-4 w-4" />Call</a>}
                  {s.altPhone && <a href={`tel:${s.altPhone}`} className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-green-200 px-3 py-3 text-sm font-semibold text-green-700"><Phone className="h-4 w-4" />{s.altPhoneLabel || 'Other'}</a>}
                  {s.visitStatus === 'Reached'
                    ? <button onClick={() => setVerifyId(s.leadId)} className="rounded-2xl bg-gold px-3 py-3 text-sm font-bold text-[#1a1400]">Start verification</button>
                    : <button onClick={() => setStatus(s.leadId, 'Reached')} disabled={!!busy} className="rounded-2xl border border-line px-3 py-3 text-sm font-semibold disabled:opacity-40">I have reached</button>}
                  <button onClick={() => setNoVisit(s.leadId)} disabled={!!busy} aria-label="Could not verify" className="inline-flex items-center justify-center rounded-2xl border border-red-200 px-3 py-3 text-red-600 disabled:opacity-40"><X className="h-5 w-5" /></button>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {noVisit && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" onClick={() => setNoVisit(null)}>
          <div className="w-full max-w-sm rounded-[1.75rem] bg-white p-5 shadow-panel" onClick={e => e.stopPropagation()}>
            <p className="text-base font-semibold">Why could the visit not be done?</p>
            <div className="mt-3 grid gap-2">
              {['Not answering', 'No check', 'Not at home'].map(r => (
                <button key={r} onClick={() => { const id = noVisit; setNoVisit(null); setStatus(id, 'Absent', r) }} className="rounded-2xl border border-red-200 px-4 py-3 text-left text-sm font-semibold text-red-600">{r}</button>
              ))}
            </div>
            <button onClick={() => setNoVisit(null)} className="mt-3 w-full rounded-2xl border border-line px-4 py-3 text-sm font-semibold">Cancel</button>
          </div>
        </div>
      )}
      {verifyId && (
        // the verification form opens over this page; the map underneath stays loaded
        <div className="fixed inset-0 z-40 overflow-y-auto bg-mist px-3 pb-8 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <VerificationsPage session={session} embedded leadId={verifyId} onClose={() => setVerifyId('')} onDone={() => { setVerifyId(''); load(true) }} />
        </div>
      )}
      {toast && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-2xl bg-ink px-5 py-3 text-sm font-medium text-white shadow-lg">{toast}</div>}
    </div>
  )
}
