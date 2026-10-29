'use client'
import { useEffect, useRef, useState } from 'react'
import RouteSketch, { SketchStop } from './RouteSketch'

// "Today at a glance" on a real Google map: numbered pins in visiting order, a line between them, a pulsing ring and
// a moving arrow on the next leg. If the map cannot load (no key, key refused, offline) the schematic sketch is shown instead.

type Pt = { lat: number; lng: number }
const w = () => window as any

function loadMaps(): Promise<void> {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_JAVASCRIPT_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  if (!key || key === 'your_google_maps_api_key_here') return Promise.reject(new Error('no key'))
  if (w().google?.maps?.Map) return Promise.resolve()
  if (w().__googleMapsLoadPromise) return w().__googleMapsLoadPromise.then(() => undefined)
  // a phone on a weak connection can drop the script once: try again a couple of times before giving up
  const attempt = (n: number): Promise<void> => new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=marker`
    s.async = true; s.defer = true
    s.onload = () => { w().__googleMapsLoaded = true; resolve() }
    s.onerror = () => { s.remove(); reject(new Error('load failed')) }
    document.head.appendChild(s)
  }).catch((e) => {
    if (n >= 3) throw e
    return new Promise<void>(r => setTimeout(r, 1500 * (n + 1))).then(() => attempt(n + 1))
  })
  w().__googleMapsLoadPromise = attempt(0).catch((e) => { w().__googleMapsLoadPromise = null; throw e })
  return w().__googleMapsLoadPromise
}

const svgUrl = (svg: string) => 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg)
const NAVY = '#1a1a2e', AMBER = '#f0b429', GREEN = '#16a34a', RED = '#dc2626'

function pinSvg(text: string, fill: string, ring: string, ink: string) {
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44"><circle cx="22" cy="22" r="19" fill="${ring}" fill-opacity=".28"/><circle cx="22" cy="22" r="15" fill="${fill}" stroke="#fff" stroke-width="3"/><text x="22" y="28" text-anchor="middle" font-family="Arial,sans-serif" font-size="17" font-weight="800" fill="${ink}">${text}</text></svg>`)
}
const pulseSvg = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><circle cx="48" cy="48" r="16" fill="none" stroke="${AMBER}" stroke-width="3"><animate attributeName="r" values="16;46" dur="1.8s" repeatCount="indefinite"/><animate attributeName="stroke-opacity" values=".9;0" dur="1.8s" repeatCount="indefinite"/></circle><circle cx="48" cy="48" r="16" fill="none" stroke="${AMBER}" stroke-width="3"><animate attributeName="r" values="16;46" dur="1.8s" begin=".9s" repeatCount="indefinite"/><animate attributeName="stroke-opacity" values=".9;0" dur="1.8s" begin=".9s" repeatCount="indefinite"/></circle></svg>`)
const startSvg = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44"><rect x="4" y="4" width="36" height="36" rx="12" fill="${NAVY}" stroke="#fff" stroke-width="3"/><path d="M13 23 L22 13 L31 23 M16 21.5 V31 H28 V21.5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`)

// the agent: a round blue badge with a head-and-shoulders person, ringed in white, with a soft pulse
const agentSvg = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="14" fill="none" stroke="#2563eb" stroke-width="3"><animate attributeName="r" values="14;30" dur="1.8s" repeatCount="indefinite"/><animate attributeName="stroke-opacity" values=".8;0" dur="1.8s" repeatCount="indefinite"/></circle><circle cx="32" cy="32" r="17" fill="#2563eb" stroke="#fff" stroke-width="3"/><circle cx="32" cy="26" r="5.5" fill="#fff"/><path d="M21.5 42c1-6 5.5-8.5 10.5-8.5S41.5 36 42.5 42z" fill="#fff"/></svg>`)

const MAP_STYLE = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
]

// Google's encoded-polyline format -> points
function decodePath(enc: string): Pt[] {
  const out: Pt[] = []
  let i = 0, lat = 0, lng = 0
  while (i < enc.length) {
    for (const axis of [0, 1]) {
      let shift = 0, result = 0, b: number
      do { b = enc.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5 } while (b >= 0x20 && i < enc.length)
      const d = result & 1 ? ~(result >> 1) : result >> 1
      if (axis === 0) lat += d; else lng += d
    }
    out.push({ lat: lat / 1e5, lng: lng / 1e5 })
  }
  return out
}

export default function RouteMap({ start, startLabel, stops, nextId, onPick, roads, bare, heightClass, live }: {
  start: Pt | null
  startLabel: string
  stops: SketchStop[]
  nextId?: string
  onPick?: (id: string) => void
  bare?: boolean // map and legend only; the page supplies its own header card
  heightClass?: string // map height (default 420px)
  live?: { lat: number; lng: number; label: string } | null // the agent's current position (moves on its own, no redraw of the route)
  roads?: (string | null)[] | null // road shape for each leg (start -> stop 1 -> stop 2 ...), straight line where missing
}) {
  const box = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const layers = useRef<{ clear: () => void }[]>([])
  const raf = useRef(0)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [sat, setSat] = useState(false)
  const fit = useRef<(() => void) | null>(null)
  const pickRef = useRef(onPick)
  pickRef.current = onPick

  // load the library and create the map once
  useEffect(() => {
    let dead = false
    w().gm_authFailure = () => { if (!dead) setFailed(true) }
    loadMaps().then(() => {
      if (dead || !box.current) return
      mapRef.current = new (w().google.maps.Map)(box.current, {
        center: { lat: 10.2, lng: 76.3 }, zoom: 9, disableDefaultUI: true, zoomControl: true, gestureHandling: 'greedy',
        clickableIcons: false, styles: MAP_STYLE,
      })
      setReady(true)
    }).catch(() => { if (!dead) setFailed(true) })
    return () => { dead = true; cancelAnimationFrame(raf.current) }
  }, [])

  // a map kept in a hidden section has no size; when it is shown again, wake it up and frame the stops
  useEffect(() => {
    const el = box.current
    if (!ready || !el || typeof ResizeObserver === 'undefined') return
    let was = el.offsetWidth
    const ro = new ResizeObserver(() => {
      const now = el.offsetWidth
      if (was === 0 && now > 0 && mapRef.current) { w().google.maps.event.trigger(mapRef.current, 'resize'); fit.current?.() }
      was = now
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [ready])

  // Map / Satellite switch (Hybrid keeps the place names on the photo)
  useEffect(() => { mapRef.current?.setMapTypeId(sat ? 'hybrid' : 'roadmap') }, [sat, ready])

  // the agent's live position: its own marker, moved in place whenever a new position arrives
  const liveMarker = useRef<google.maps.Marker | null>(null)
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const gm = w().google.maps as typeof google.maps
    if (!live) { liveMarker.current?.setMap(null); liveMarker.current = null; return }
    if (!liveMarker.current) {
      liveMarker.current = new gm.Marker({ map, position: live, zIndex: 100, title: live.label,
        icon: { url: agentSvg, scaledSize: new gm.Size(52, 52), anchor: new gm.Point(26, 26), labelOrigin: new gm.Point(26, 62) },
        label: { text: live.label, fontSize: '12px', fontWeight: '800', color: '#1d4ed8', className: 'rm-label' } })
    } else liveMarker.current.setPosition(live)
  }, [ready, live])
  useEffect(() => () => { liveMarker.current?.setMap(null); liveMarker.current = null }, [])

  // (re)draw pins and lines when the stops change
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const gm = w().google.maps as typeof google.maps
    layers.current.forEach(l => l.clear()); layers.current = []
    cancelAnimationFrame(raf.current)

    const bounds = new gm.LatLngBounds()
    const nodes: { p: Pt; stop?: SketchStop }[] = [...(start ? [{ p: start }] : []), ...stops.map(s => ({ p: { lat: s.lat, lng: s.lng }, stop: s }))]
    nodes.forEach(n => bounds.extend(n.p))
    const add = (o: { setMap: (m: google.maps.Map | null) => void }) => layers.current.push({ clear: () => o.setMap(null) })

    // lines between consecutive points
    const nextLegs: { line: google.maps.Polyline; dashed: google.maps.IconSequence }[] = []
    for (let i = 1; i < nodes.length; i++) {
      const s = nodes[i].stop!
      const road = roads?.[i - 1]
      const path = (road ? decodePath(road) : []).length > 1 ? decodePath(road!) : [nodes[i - 1].p, nodes[i].p]
      const isNext = s.id === nextId
      if (s.done) {
        add(new gm.Polyline({ map, path, strokeColor: GREEN, strokeOpacity: 0.95, strokeWeight: 4, geodesic: true }))
      } else {
        const dash = { path: 'M 0,-1 0,1', strokeOpacity: 1, strokeColor: isNext ? AMBER : NAVY, scale: isNext ? 3.4 : 2.6 }
        const dashed = { icon: dash, offset: '0', repeat: isNext ? '14px' : '12px' }
        const line = new gm.Polyline({ map, path, strokeOpacity: 0, geodesic: true, icons: [dashed] })
        add(line)
        if (isNext) {
          add(new gm.Polyline({ map, path, strokeColor: AMBER, strokeOpacity: 0.22, strokeWeight: 9, geodesic: true, zIndex: 1 }))
          nextLegs.push({ line, dashed })
        }
      }
    }
    // an arrow that travels along the next leg
    if (nextLegs.length) {
      const { line, dashed: base } = nextLegs[0]
      const arrow = { path: gm.SymbolPath.FORWARD_CLOSED_ARROW, scale: 4.2, fillColor: AMBER, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 1.5 }
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      const t0 = performance.now()
      const tick = (t: number) => {
        const pct = ((t - t0) / 2600) % 1
        line.set('icons', [base, { icon: arrow, offset: `${Math.round(pct * 100)}%` }])
        raf.current = requestAnimationFrame(tick)
      }
      if (!reduce) raf.current = requestAnimationFrame(tick)
      else line.set('icons', [base, { icon: arrow, offset: '60%' }])
    }

    // pins
    if (start) {
      add(new gm.Marker({ map, position: start, title: startLabel, zIndex: 5,
        icon: { url: startSvg, scaledSize: new gm.Size(40, 40), anchor: new gm.Point(20, 20), labelOrigin: new gm.Point(20, 50) },
        label: { text: startLabel, fontSize: '11px', fontWeight: '800', color: NAVY, className: 'rm-label' } }))
    }
    stops.forEach(s => {
      const isNext = s.id === nextId
      const VIOLET = '#7c3aed'
      const fill = s.done ? (s.absent ? RED : GREEN) : isNext ? AMBER : s.waypoint ? '#ede9fe' : '#fff'
      const ink = s.done ? '#fff' : NAVY
      const ring = s.done ? fill : isNext ? AMBER : s.waypoint ? VIOLET : NAVY
      const text = s.done ? (s.absent ? '!' : '✓') : String(s.n)
      const size = isNext ? 50 : 42
      if (isNext) add(new gm.Marker({ map, position: { lat: s.lat, lng: s.lng }, clickable: false, zIndex: 1,
        icon: { url: pulseSvg, scaledSize: new gm.Size(96, 96), anchor: new gm.Point(48, 48) } }))
      const m = new gm.Marker({ map, position: { lat: s.lat, lng: s.lng }, title: s.label, zIndex: isNext ? 20 : 10,
        icon: { url: pinSvg(text, fill, ring, ink), scaledSize: new gm.Size(size, size), anchor: new gm.Point(size / 2, size / 2), labelOrigin: new gm.Point(size / 2, size + 8) },
        label: { text: s.label.length > 16 ? s.label.slice(0, 15) + '…' : s.label, fontSize: '12px', fontWeight: '700', color: NAVY, className: 'rm-label' } })
      m.addListener('click', () => { map.panTo({ lat: s.lat, lng: s.lng }); pickRef.current?.(s.id) })
      add(m)
    })

    fit.current = () => {
      if (nodes.length === 1) { map.setCenter(nodes[0].p); map.setZoom(14) }
      else map.fitBounds(bounds, { top: 56, right: 48, bottom: 64, left: 48 })
    }
    fit.current()
    return () => cancelAnimationFrame(raf.current)
  }, [ready, start, startLabel, stops, nextId, roads])

  if (failed) return <RouteSketch bare={bare} start={start} startLabel={startLabel} stops={stops} nextId={nextId} onPick={onPick} />
  if (stops.length === 0) return null

  const done = stops.filter(s => s.done).length
  return (
    <div className={bare ? 'w-full' : 'mx-auto w-full overflow-hidden rounded-[1.75rem] bg-white shadow-panel ring-1 ring-black/5'}>
      <style>{`.rm-label{background:rgba(255,255,255,.94);padding:2px 8px;border-radius:999px;box-shadow:0 1px 4px rgba(0,0,0,.22);white-space:nowrap}`}</style>
      {!bare && (
        <div className="flex items-end justify-between gap-3 bg-gradient-to-br from-ink via-[#20204a] to-[#2b2461] px-4 py-3 text-white">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">Today at a glance</p>
            <p className="mt-0.5 text-lg font-bold leading-tight">{done} of {stops.length} done</p>
          </div>
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/15">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-lime-300 transition-all" style={{ width: `${(done / stops.length) * 100}%` }} />
          </div>
        </div>
      )}
      <div className="relative">
        <div ref={box} className={`${heightClass || 'h-[420px]'} w-full bg-line`} aria-label="Map of today's visits" />
        <button type="button" onClick={() => setSat(v => !v)} className="absolute left-2 top-2 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-ink shadow-md ring-1 ring-black/10">{sat ? 'Map' : 'Satellite'}</button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2 text-[11px] text-soft">
        <span className="inline-flex items-center gap-3">
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full border-2 border-ink bg-white" />To visit</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-gold" />Next</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-green-600" />Done</span>
          {stops.some(s => s.waypoint) && <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full border-2 border-violet-600 bg-violet-100" />Subroute</span>}
        </span>
        <span>{roads?.some(Boolean) ? 'Lines follow the roads' : 'Straight lines show the order, not the road'}</span>
      </div>
    </div>
  )
}
