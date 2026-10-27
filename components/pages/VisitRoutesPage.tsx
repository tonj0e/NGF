'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Session } from '@/types'
import { Phone, MapPin, GripVertical, ChevronUp, ChevronDown, Route as RouteIcon, Wand2, X, Navigation } from 'lucide-react'
import RouteMap from '@/components/routes/RouteMap'
import { fetchRoads } from '@/lib/clientRoads'

type Stop = {
  leadId: string; customerName: string; phone: string; place: string; address: string; landmark: string; status: string; submittedDate: string
  guarantorName: string; branchId: string; branchName: string; agentId: string
  visitLat: number | null; visitLng: number | null; visitPlace: string; visitDate: string; visitWindow: string; visitNote: string
  callOutcome: string; visitStatus: string; seq: number | null; pin: string; legKm: number | null; legMin: number | null
  done: boolean; hasLocation: boolean; guarantorPin: { lat: number; lng: number } | null
}
type Plan = { startLat: number | null; startLng: number | null; startSource: string; totalKm: number | null; totalMin: number | null; source: string; manual: boolean }
type AgentRoute = { agentId: string; name: string; phone: string; branchId: string; plan: Plan | null; stops: Stop[] }
type Board = {
  date: string; branchId: string; branches: { branchId: string; name: string }[]
  config: { enabled: boolean; windows: boolean; googleReady: boolean }; maxStops: number; windows: string[]
  toPlan: Stop[]; routes: AgentRoute[]
}

const card = 'rounded-[1.75rem] border border-white/70 bg-white shadow-panel p-4 sm:p-5'
const input = 'w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm outline-none focus:border-ink'
const btn = 'rounded-2xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-40'

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

const hm = (min: number | null) => (min == null ? '' : min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min} min`)
const today = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)
const shift = (d: string, n: number) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10) }

function mapsRouteUrl(r: AgentRoute) {
  const pts = r.stops.filter(s => s.hasLocation).map(s => `${s.visitLat},${s.visitLng}`)
  if (!pts.length) return ''
  const origin = r.plan?.startLat != null ? `${r.plan.startLat},${r.plan.startLng}` : pts[0]
  const rest = r.plan?.startLat != null ? pts : pts.slice(1)
  const dest = rest[rest.length - 1]
  const way = rest.slice(0, -1).join('|')
  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}${way ? `&waypoints=${encodeURIComponent(way)}` : ''}&travelmode=driving`
}

export default function VisitRoutesPage({ session }: { session: Session }) {
  const [date, setDate] = useState(today())
  const [branchId, setBranchId] = useState('')
  const [board, setBoard] = useState<Board | null>(null)
  const [tab, setTab] = useState<'plan' | 'routes'>('plan')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState('')

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500) }

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      setBoard(await api(session, `/api/routes?view=board&date=${date}${branchId ? `&branchId=${branchId}` : ''}`))
      setError('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load') }
    setLoading(false)
  }, [session, date, branchId])

  useEffect(() => { load() }, [load])

  async function act(label: string, body: Record<string, unknown>, okMsg: string) {
    setBusy(label)
    try { await api(session, '/api/routes', body); flash(okMsg); await load(true) }
    catch (e) { flash(e instanceof Error ? e.message : 'Failed') }
    setBusy('')
  }

  if (error && !board) return <div className={card}><p className="text-sm text-red-600">{error}</p></div>

  const needCall = board?.toPlan.filter(s => !s.hasLocation || !s.visitDate) || []
  const ready = board?.toPlan.filter(s => s.hasLocation && s.visitDate) || []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          {([['plan', `To plan${needCall.length + ready.length ? ` (${needCall.length + ready.length})` : ''}`], ['routes', 'Agent routes']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className={`${btn} !py-2 ${tab === k ? 'bg-ink text-white' : 'border border-line bg-white text-soft'}`}>{label}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1" title="Visit day">
            <button className="rounded-xl border border-line bg-white px-2.5 py-1.5 text-sm" onClick={() => setDate(shift(date, -1))}>‹</button>
            <input type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)} className="rounded-xl border border-line bg-white px-2.5 py-1.5 text-sm font-medium text-ink" />
            <button className="rounded-xl border border-line bg-white px-2.5 py-1.5 text-sm" onClick={() => setDate(shift(date, 1))}>›</button>
          </div>
          {board && board.branches.length > 1 && (
            <select value={branchId} onChange={e => setBranchId(e.target.value)} className="rounded-xl border border-line bg-white px-2.5 py-1.5 text-sm font-medium text-ink">
              <option value="">All branches</option>
              {board.branches.map(b => <option key={b.branchId} value={b.branchId}>{b.name}</option>)}
            </select>
          )}
        </div>
      </div>
      {board && !board.config.googleReady && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">Google road distances are not set up yet, so distances are straight-line estimates (about 1.4x). Add the Google key to get real road distances.</p>
      )}

      {loading && <p className="p-8 text-center text-sm text-soft">Loading…</p>}

      {board && tab === 'plan' && (
        <div className="space-y-4">
          {!loading && !needCall.length && !ready.length && <p className="p-8 text-center text-sm text-soft">No leads waiting for a visit plan.</p>}
          {needCall.length > 0 && <p className="text-xs font-semibold uppercase tracking-wider text-soft">Call the customer and fix the location ({needCall.length})</p>}
          {needCall.map(s => <PlanCard key={s.leadId} s={s} board={board} date={date} busy={busy} onSave={(b) => act(`visit${s.leadId}`, { action: 'setVisit', leadId: s.leadId, ...b }, 'Visit saved')} onAssign={(agentId) => act(`assign${s.leadId}`, { action: 'assign', leadId: s.leadId, agentId, date: s.visitDate || date }, 'Added to the agent\'s route')} />)}
          {ready.length > 0 && <p className="pt-2 text-xs font-semibold uppercase tracking-wider text-soft">Location fixed, choose an agent ({ready.length})</p>}
          {ready.map(s => <PlanCard key={s.leadId} s={s} board={board} date={date} busy={busy} onSave={(b) => act(`visit${s.leadId}`, { action: 'setVisit', leadId: s.leadId, ...b }, 'Visit saved')} onAssign={(agentId) => act(`assign${s.leadId}`, { action: 'assign', leadId: s.leadId, agentId, date: s.visitDate || date }, 'Added to the agent\'s route')} />)}
        </div>
      )}

      {board && tab === 'routes' && (
        <div className="space-y-4">
          {board.routes.length === 0 && <p className="p-8 text-center text-sm text-soft">No agents in this branch.</p>}
          {board.routes.map((r, i) => <RouteCard key={r.agentId + date} r={r} board={board} date={date} busy={busy} session={session} act={act} startOpen={i === board.routes.findIndex(x => x.stops.length > 0)} />)}
        </div>
      )}

      {toast && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-2xl bg-ink px-5 py-3 text-sm font-medium text-white shadow-lg">{toast}</div>}
    </div>
  )
}

// ─── A lead waiting for the phone call / location ────────────────────────────

function PlanCard({ s, board, date, busy, onSave, onAssign }: {
  s: Stop; board: Board; date: string; busy: string
  onSave: (b: Record<string, unknown>) => void; onAssign: (agentId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [link, setLink] = useState('')
  const [place, setPlace] = useState(s.visitPlace || s.place)
  const [vDate, setVDate] = useState(s.visitDate || date)
  const [win, setWin] = useState(s.visitWindow)
  const [note, setNote] = useState(s.visitNote)
  const [outcome, setOutcome] = useState(s.callOutcome)
  const [agent, setAgent] = useState('')
  const wa = s.phone ? `https://wa.me/91${s.phone.replace(/\D/g, '').slice(-10)}` : ''

  return (
    <div className={card}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{s.customerName}</p>
          <p className="mt-0.5 text-xs text-soft">
            {s.guarantorName && <>Guarantor {s.guarantorName} · </>}{s.branchName && <span className="font-semibold text-sky-700">{s.branchName}</span>}
          </p>
          <p className="mt-0.5 text-xs text-soft">{[s.place, s.landmark].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          {s.phone && <a href={`tel:${s.phone}`} className="inline-flex items-center gap-1 rounded-2xl bg-green-600 px-3 py-2 text-sm font-semibold text-white"><Phone className="h-4 w-4" />Call</a>}
          {wa && <a href={wa} target="_blank" rel="noreferrer" className="rounded-2xl border border-green-200 px-3 py-2 text-sm font-semibold text-green-700">WhatsApp</a>}
        </div>
      </div>

      {s.hasLocation && (
        <p className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded-lg bg-green-100 px-2 py-0.5 font-semibold text-green-700"><MapPin className="h-3 w-3" />{s.visitPlace || 'Location fixed'}</span>
          {s.visitDate && <span className="text-soft">{s.visitDate}</span>}
          {s.visitWindow && <span className="rounded-lg bg-violet-100 px-2 py-0.5 font-semibold text-violet-700">{s.visitWindow}</span>}
          <a href={`https://www.google.com/maps?q=${s.visitLat},${s.visitLng}`} target="_blank" rel="noreferrer" className="font-semibold text-blue-700 underline">Open map</a>
        </p>
      )}

      {s.hasLocation && s.visitDate && (
        <div className="mt-3 flex gap-2">
          <select value={agent} onChange={e => setAgent(e.target.value)} className={`${input} flex-1`}>
            <option value="">Choose agent…</option>
            {board.routes.map(r => <option key={r.agentId} value={r.agentId}>{r.name} ({r.stops.length} stops on {s.visitDate})</option>)}
          </select>
          <button disabled={!agent || busy === `assign${s.leadId}`} onClick={() => onAssign(agent)} className={`${btn} bg-ink text-white`}>Assign</button>
        </div>
      )}

      <button onClick={() => setOpen(!open)} className="mt-3 text-sm font-semibold text-blue-700">{open ? 'Close' : s.hasLocation ? 'Change visit details' : 'Fix location and day'}</button>

      {open && (
        <div className="mt-3 space-y-3 border-t border-black/5 pt-3">
          <div>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-soft">Customer location (Google Maps link or lat,lng)</span>
            <input value={link} onChange={e => setLink(e.target.value)} placeholder="Paste the link the customer sends" data-no-upper className={input} />
            {s.guarantorPin && !link && (
              <button type="button" className="mt-1 text-xs font-semibold text-blue-700 underline" onClick={() => setLink(`${s.guarantorPin!.lat},${s.guarantorPin!.lng}`)}>Use the pin the guarantor gave</button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-semibold uppercase tracking-wider text-soft">Place name
              <input value={place} onChange={e => setPlace(e.target.value)} className={`${input} mt-1`} />
            </label>
            <label className="text-xs font-semibold uppercase tracking-wider text-soft">Visit date
              <input type="date" value={vDate} onChange={e => setVDate(e.target.value)} className={`${input} mt-1`} />
            </label>
            {board.config.windows && (
              <label className="text-xs font-semibold uppercase tracking-wider text-soft">Time window
                <select value={win} onChange={e => setWin(e.target.value)} className={`${input} mt-1`}>
                  <option value="">Any time</option>
                  {board.windows.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </label>
            )}
            <label className="text-xs font-semibold uppercase tracking-wider text-soft">Call result
              <select value={outcome} onChange={e => setOutcome(e.target.value)} className={`${input} mt-1`}>
                <option value="">Not called</option>
                {['Reached', 'Not reachable', 'Call back later'].map(o => <option key={o}>{o}</option>)}
              </select>
            </label>
          </div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-soft">Note for the agent
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="House behind the temple, call at the junction" className={`${input} mt-1`} />
          </label>
          <button disabled={busy === `visit${s.leadId}`} onClick={() => onSave({ mapsLink: link, place, date: vDate, window: win, note, callOutcome: outcome })} className={`${btn} w-full bg-[#f0b429] text-[#1a1400]`}>
            {busy === `visit${s.leadId}` ? 'Saving…' : 'Save visit details'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── One agent's day, with drag-to-reorder ───────────────────────────────────

function RouteCard({ r, board, date, busy, session, act, startOpen }: {
  r: AgentRoute; board: Board; date: string; busy: string; session: Session; startOpen: boolean
  act: (label: string, body: Record<string, unknown>, okMsg: string) => Promise<void>
}) {
  const [order, setOrder] = useState<string[]>(r.stops.map(s => s.leadId))
  const [dragging, setDragging] = useState('')
  const rows = useRef<Record<string, HTMLDivElement | null>>({})
  const startOrder = useRef('')
  const [open, setOpen] = useState(startOpen)
  const [seen, setSeen] = useState(startOpen) // once opened, the body (and its map) stays in the page, hidden, so reopening costs no new map load
  const [roads, setRoads] = useState<(string | null)[] | null>(null)
  const savedIds = r.stops.map(s => s.leadId)
  const dirty = order.length === savedIds.length && order.join() !== savedIds.join()
  const dirtyRef = useRef(false)
  dirtyRef.current = dirty
  // fresh data from the server: start from it, but keep the unsaved arrangement of the stops that are still there
  useEffect(() => {
    setOrder(prev => {
      if (!dirtyRef.current) return savedIds
      const keep = prev.filter(id => savedIds.includes(id))
      return [...keep, ...savedIds.filter(id => !keep.includes(id))]
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.stops])
  const byId = new Map(r.stops.map(s => [s.leadId, s]))
  const list = order.map(id => byId.get(id)).filter((s): s is Stop => !!s)
  const url = mapsRouteUrl(r)

  // the map follows the order on screen at once (also while dragging); road shapes are fetched a moment after the order settles
  const mapStops = list.flatMap((s, i) => s.hasLocation && s.visitLat != null && s.visitLng != null
    ? [{ id: s.leadId, n: i + 1, label: s.visitPlace || s.place || s.customerName, lat: s.visitLat, lng: s.visitLng, done: s.done, absent: s.visitStatus === 'Absent', legKm: s.legKm }]
    : [])
  const startPt = r.plan?.startLat != null && r.plan?.startLng != null ? { lat: r.plan.startLat, lng: r.plan.startLng } : null
  const nextStop = mapStops.find(s => !s.done)
  const roadPts = [...(startPt ? [startPt] : []), ...mapStops.map(s => ({ lat: s.lat, lng: s.lng }))]
  const roadKey = roadPts.map(p => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join('|')
  useEffect(() => {
    if (!open) return
    let dead = false
    setRoads(null)
    if (roadPts.length < 2 || roadPts.length > 26 || dragging) return
    const t = setTimeout(() => {
      fetchRoads(session.token, roadPts).then(legs => { if (!dead && legs) setRoads(legs) }).catch(() => {})
    }, 600)
    return () => { dead = true; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, roadKey, dragging, session.token])

  // arranging only changes the screen (and the map); the agent gets the order when Save order is pressed
  function saveOrder() {
    act(`reorder${r.agentId}`, { action: 'reorder', agentId: r.agentId, date, order }, 'Order saved, agent notified')
  }
  function move(i: number, d: number) {
    const j = i + d
    if (j < 0 || j >= order.length || byId.get(order[i])?.done || byId.get(order[j])?.done) return
    const next = order.slice(); [next[i], next[j]] = [next[j], next[i]]
    setOrder(next)
  }
  function onDown(e: React.PointerEvent, id: string) {
    if (byId.get(id)?.done) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setDragging(id); startOrder.current = order.join()
  }
  function onMove(e: React.PointerEvent) {
    if (!dragging) return
    const cur = order.indexOf(dragging)
    let target = cur
    order.forEach((id, i) => {
      const el = rows.current[id]; if (!el || id === dragging) return
      const b = el.getBoundingClientRect(), mid = b.top + b.height / 2
      if (i < cur && e.clientY < mid) target = Math.min(target, i)
      if (i > cur && e.clientY > mid) target = Math.max(target, i)
    })
    if (target !== cur && !byId.get(order[target])?.done) {
      const next = order.slice(); next.splice(cur, 1); next.splice(target, 0, dragging); setOrder(next)
    }
  }
  function onUp() {
    if (!dragging) return
    setDragging('')
  }

  return (
    <div className={card}>
      <button type="button" onClick={() => { setOpen(o => !o); setSeen(true) }} aria-expanded={open} className="flex w-full items-center justify-between gap-3 text-left">
        <div className="min-w-0">
          <p className="font-semibold">{r.name}</p>
          <p className="text-xs text-soft">
            {r.stops.length} {r.stops.length === 1 ? 'stop' : 'stops'}
            {r.plan?.totalKm != null && r.stops.length > 0 && <> · {r.plan.totalKm} km · {hm(r.plan.totalMin)}</>}
            {r.plan?.manual && <> · <span className="font-semibold text-violet-700">Hand-ordered</span></>}
            {dirty && <> · <span className="font-semibold text-amber-600">Not saved yet</span></>}
          </p>
        </div>
        <ChevronDown className={`h-5 w-5 shrink-0 text-soft transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {seen && (<div className={open ? '' : 'hidden'}>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-soft">
          {r.plan?.startSource ? <>Starts from: {r.plan.startSource}</> : 'Start point unknown until the agent marks attendance'}
          {r.plan?.source && <> · {r.plan.source}</>}
        </p>
        <div className="flex flex-wrap gap-2">
          <button disabled={!r.stops.length || busy === `opt${r.agentId}`} onClick={() => act(`opt${r.agentId}`, { action: 'optimize', agentId: r.agentId, date }, 'Best order applied')} className={`${btn} inline-flex items-center gap-1 bg-ink text-white`}>
            <Wand2 className="h-4 w-4" />{busy === `opt${r.agentId}` ? 'Working…' : 'Best order'}
          </button>
          {dirty && <button onClick={() => setOrder(savedIds)} className={`${btn} border border-line bg-white text-soft`}>Undo</button>}
          {dirty && <button disabled={busy === `reorder${r.agentId}`} onClick={saveOrder} className={`${btn} bg-[#f0b429] text-ink shadow-md`}>{busy === `reorder${r.agentId}` ? 'Saving…' : 'Save order'}</button>}
          {url && <a href={url} target="_blank" rel="noreferrer" className={`${btn} inline-flex items-center gap-1 border border-line bg-white`}><RouteIcon className="h-4 w-4" />Google Maps</a>}
        </div>
      </div>

      {r.stops.length === 0 && <p className="mt-3 text-sm text-soft">No visits planned for this day.</p>}

      <div className="mt-3 grid gap-4 lg:h-[calc(100vh-12rem)] lg:min-h-[460px] lg:grid-cols-2">
      <div className="space-y-2 lg:min-h-0 lg:overflow-y-auto lg:pr-1" onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        {list.map((s, i) => (
          <div key={s.leadId} ref={el => { rows.current[s.leadId] = el }}
            className={`rounded-2xl border p-3 ${dragging === s.leadId ? 'border-[#f0b429] bg-amber-50 shadow-lg' : s.done ? 'border-green-200 bg-green-50' : 'border-line bg-white'}`}>
            <div className="flex items-start gap-2">
              <button type="button" aria-label="Drag to reorder" disabled={s.done}
                onPointerDown={e => onDown(e, s.leadId)} style={{ touchAction: 'none' }}
                className="mt-0.5 shrink-0 cursor-grab rounded-lg p-1 text-[#9ca3af] disabled:opacity-30"><GripVertical className="h-5 w-5" /></button>
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{s.customerName} {s.done && <span className="ml-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">{s.visitStatus === 'Absent' ? 'ABSENT' : 'DONE'}</span>}</p>
                <p className="text-xs text-soft">{s.visitPlace || s.place}{s.visitWindow && <> · <span className="font-semibold text-violet-700">{s.visitWindow}</span></>}</p>
                {s.legKm != null && <p className="text-xs text-soft">{i === 0 ? 'From start' : 'From previous'}: {s.legKm} km · {hm(s.legMin)}</p>}
                {s.visitStatus && !s.done && <p className="text-xs font-semibold text-blue-700">{s.visitStatus}</p>}
                {s.visitNote && <p className="mt-0.5 text-xs italic text-soft">{s.visitNote}</p>}
              </div>
              <div className="flex shrink-0 flex-col">
                <button type="button" aria-label="Move up" disabled={s.done || i === 0} onClick={() => move(i, -1)} className="rounded p-0.5 text-soft disabled:opacity-25"><ChevronUp className="h-5 w-5" /></button>
                <button type="button" aria-label="Move down" disabled={s.done || i === list.length - 1} onClick={() => move(i, 1)} className="rounded p-0.5 text-soft disabled:opacity-25"><ChevronDown className="h-5 w-5" /></button>
              </div>
            </div>
            {!s.done && (
              <div className="mt-2 flex flex-wrap items-center gap-2 pl-9 text-xs">
                <button onClick={() => act(`pin${s.leadId}`, { action: 'pin', leadId: s.leadId, pin: s.pin === 'first' ? '' : 'first' }, s.pin === 'first' ? 'Unpinned' : 'Pinned first')} className={`rounded-lg border px-2 py-1 font-semibold ${s.pin === 'first' ? 'border-violet-300 bg-violet-100 text-violet-700' : 'border-line text-soft'}`}>Must be first</button>
                <button onClick={() => act(`pin${s.leadId}`, { action: 'pin', leadId: s.leadId, pin: s.pin === 'last' ? '' : 'last' }, s.pin === 'last' ? 'Unpinned' : 'Pinned last')} className={`rounded-lg border px-2 py-1 font-semibold ${s.pin === 'last' ? 'border-violet-300 bg-violet-100 text-violet-700' : 'border-line text-soft'}`}>Must be last</button>
                <select defaultValue="" onChange={e => { const v = e.target.value; e.target.value = ''; if (v) act(`mv${s.leadId}`, { action: 'assign', leadId: s.leadId, agentId: v, date }, 'Moved') }} className="rounded-lg border border-line bg-white px-2 py-1 font-semibold text-soft">
                  <option value="">Move to agent…</option>
                  {board.routes.filter(x => x.agentId !== r.agentId).map(x => <option key={x.agentId} value={x.agentId}>{x.name}</option>)}
                </select>
                <a href={`https://www.google.com/maps?q=${s.visitLat},${s.visitLng}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-blue-700"><Navigation className="h-3 w-3" />Map</a>
                <button onClick={() => act(`un${s.leadId}`, { action: 'unplan', leadId: s.leadId }, 'Removed from the route')} className="ml-auto inline-flex items-center gap-1 font-semibold text-red-600"><X className="h-3 w-3" />Remove</button>
              </div>
            )}
          </div>
        ))}
      </div>
      {mapStops.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-line lg:h-full">
          <RouteMap bare heightClass="h-[480px] lg:h-[calc(100vh-12rem-2.5rem)] lg:min-h-[420px]" start={startPt} startLabel="START" stops={mapStops} nextId={nextStop?.id} roads={roads} />
        </div>
      )}
      </div>
      </div>)}
    </div>
  )
}
