// Pure helpers for Verification Day Routes: Google Maps link parsing, road-distance lookup and route ordering.
// No database access here (see lib/routes.ts for that), so it can be tested on its own.

export type LatLng = { lat: number; lng: number }
export type Leg = { km: number; min: number }
export type Matrix = Leg[][]

export const MAX_STOPS = 24 // Google's matrix limit is 625 elements per call: (24 stops + 1 start)^2

// ─── Google Maps links ────────────────────────────────────────────────────────

function validPoint(lat: number, lng: number): LatLng | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  if (lat === 0 && lng === 0) return null
  return { lat, lng }
}

// Pulls coordinates out of a pasted Google Maps URL or a bare "lat,lng".
export function parseLatLng(text: string): LatLng | null {
  let s = String(text || '').trim()
  try { s = decodeURIComponent(s) } catch { /* keep the raw text */ }
  if (!s) return null
  const patterns = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,           // place pin inside data=
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,               // map centre
    /\/maps\/(?:search|place|dir)\/(?:[^/?]*\/)?(-?\d+\.\d+)[, +]+(-?\d+\.\d+)(?:[/?#]|$)/, // short links now open /maps/search/9.87,+76.32
    /[?&](?:q|ll|query|destination|daddr|center)=(-?\d+(?:\.\d+)?)[, +]+(-?\d+(?:\.\d+)?)/,
    /^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/,     // bare "10.12, 76.34"
  ]
  for (const re of patterns) {
    const m = s.match(re)
    if (m) {
      const p = validPoint(Number(m[1]), Number(m[2]))
      if (p) return p
    }
  }
  return null
}

const SHORT_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl'])
const MAPS_HOSTS = /^(www\.)?(google\.[a-z.]+|maps\.google\.[a-z.]+)$/

// Google's short-link server now and then drops a connection at random (the same link works on the next try),
// so a failed connection is tried again a couple of times before giving up.
async function fetchWithRetry(href: string): Promise<Response | null> {
  for (let attempt = 0; attempt < 7; attempt++) {
    try { return await fetch(href, { redirect: 'manual', signal: AbortSignal.timeout(4000), headers: { 'User-Agent': 'Mozilla/5.0' } }) }
    catch { await new Promise(r => setTimeout(r, 200 * (attempt + 1))) }
  }
  return null
}

// Reads a link, following the Google short-link redirect (maps.app.goo.gl) when needed. Only Google hosts are fetched.
export async function resolveMapsLink(text: string): Promise<LatLng | null> {
  const direct = parseLatLng(text)
  if (direct) return direct
  const urlText = (String(text || '').match(/https?:\/\/[^\s]+/) || [])[0]
  if (!urlText) return null
  let url: URL
  try { url = new URL(urlText) } catch { return null }
  for (let hop = 0; hop < 5; hop++) {
    if (url.protocol !== 'https:') return null
    const host = url.hostname.toLowerCase()
    if (!SHORT_HOSTS.has(host) && !MAPS_HOSTS.test(host)) return null
    const found = parseLatLng(url.toString())
    if (found) return found
    if (!SHORT_HOSTS.has(host) && !url.pathname.startsWith('/maps')) return null
    const res = await fetchWithRetry(url.toString())
    if (!res) return null
    const loc = res.headers.get('location')
    if (!loc) {
      // Final page: coordinates are sometimes only inside the HTML
      if (res.status === 200) {
        const body = (await res.text().catch(() => '')).slice(0, 400_000)
        const m = body.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || body.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
        if (m) return validPoint(Number(m[1]), Number(m[2]))
      }
      return null
    }
    try { url = new URL(loc, url) } catch { return null }
  }
  return null
}

// ─── Distance ─────────────────────────────────────────────────────────────────

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371, rad = (d: number) => d * Math.PI / 180
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

// Straight-line estimate used when Google is unavailable: roads are about 1.4x longer, ridden at about 28 km/h on Kerala roads.
export function estimateLeg(a: LatLng, b: LatLng): Leg {
  const km = haversineKm(a, b) * 1.4
  return { km: Math.round(km * 10) / 10, min: Math.max(1, Math.round(km / 28 * 60)) }
}

export function pairKey(a: LatLng, b: LatLng): string {
  const f = (p: LatLng) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`
  return `${f(a)}>${f(b)}`
}

export function googleKey(): string {
  return process.env.GOOGLE_MAPS_SERVER_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''
}

// One Google Routes API call for the full grid of road distances between the points.
export async function googleMatrix(points: LatLng[]): Promise<Matrix> {
  const key = googleKey()
  if (!key) throw new Error('No Google Maps key')
  const wp = (p: LatLng) => ({ waypoint: { location: { latLng: { latitude: p.lat, longitude: p.lng } } } })
  const res = await fetch('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'originIndex,destinationIndex,duration,distanceMeters,condition' },
    body: JSON.stringify({ origins: points.map(wp), destinations: points.map(wp), travelMode: 'DRIVE', routingPreference: 'TRAFFIC_UNAWARE' }),
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`Google Routes API ${res.status}`)
  const rows = await res.json() as { originIndex?: number; destinationIndex?: number; duration?: string; distanceMeters?: number; condition?: string }[]
  const n = points.length
  const out: Matrix = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? { km: 0, min: 0 } : estimateLeg(points[i], points[j]))))
  for (const r of rows) {
    const i = r.originIndex ?? 0, j = r.destinationIndex ?? 0
    if (i === j || r.condition !== 'ROUTE_EXISTS' || r.distanceMeters == null) continue
    const secs = Number(String(r.duration || '0').replace('s', '')) || 0
    out[i][j] = { km: Math.round(r.distanceMeters / 100) / 10, min: Math.max(1, Math.round(secs / 60)) }
  }
  return out
}

// ─── Ordering ─────────────────────────────────────────────────────────────────

export const WINDOWS = ['Morning', 'Afternoon', 'Evening'] as const
export const windowRank = (w: string | null | undefined) => { const i = WINDOWS.indexOf((w || '') as typeof WINDOWS[number]); return i }
// Estimated clock: the day starts at 9:00, each visit takes about 30 minutes. A stop reached outside its window costs 3x the minutes it is off.
const DAY_START = 9 * 60
const VISIT_MIN = 30
const WINDOW_SPAN: Record<string, [number, number]> = { Morning: [9 * 60, 12 * 60], Afternoon: [12 * 60, 16 * 60], Evening: [16 * 60, 19 * 60] }
const WINDOW_PENALTY_PER_MIN = 3

export type OrderInput = {
  // minutes between stops (stop i -> stop j) and from the start point to each stop (null when there is no start point)
  stops: Matrix
  fromStart: Leg[] | null
  windows: (string | null | undefined)[]
  pins: (string | null | undefined)[] // 'first' | 'last' | ''
}

function seqCost(seq: number[], inp: OrderInput, useWindows: boolean): number {
  if (!seq.length) return 0
  let c = 0
  let clock = DAY_START
  for (let k = 0; k < seq.length; k++) {
    const leg = k === 0 ? (inp.fromStart ? inp.fromStart[seq[0]].min : 0) : inp.stops[seq[k - 1]][seq[k]].min
    c += leg
    clock += leg
    const span = useWindows ? WINDOW_SPAN[inp.windows[seq[k]] || ''] : undefined
    if (span) {
      if (clock < span[0]) c += (span[0] - clock) * WINDOW_PENALTY_PER_MIN
      else if (clock > span[1]) c += (clock - span[1]) * WINDOW_PENALTY_PER_MIN
    }
    clock += VISIT_MIN
  }
  return c
}

// Nearest-neighbour start, then 2-opt and move-one improvements. Exact enough for the 10-24 stops an agent does in a day.
export function optimizeOrder(inp: OrderInput, useWindows: boolean): number[] {
  const n = inp.stops.length
  if (n <= 1) return n ? [0] : []
  const all = Array.from({ length: n }, (_, i) => i)
  const first = all.find(i => inp.pins[i] === 'first')
  const last = all.find(i => inp.pins[i] === 'last' && i !== first)
  const free = all.filter(i => i !== first && i !== last)
  const head = first != null ? [first] : []
  const tail = last != null ? [last] : []
  const full = (mid: number[]) => [...head, ...mid, ...tail]
  const cost = (mid: number[]) => seqCost(full(mid), inp, useWindows)

  const starts = !head.length && !inp.fromStart ? free : [-1] // no start point at all: try every stop as the beginning
  let best: number[] = free
  let bestCost = Infinity
  for (const s of starts) {
    const left = new Set(free)
    const mid: number[] = []
    let cur = head.length ? head[0] : s >= 0 ? s : -1
    if (s >= 0) { mid.push(s); left.delete(s) }
    while (left.size) {
      let pick = -1, pc = Infinity
      for (const j of left) {
        const d = cur >= 0 ? inp.stops[cur][j].min : (inp.fromStart ? inp.fromStart[j].min : 0)
        if (d < pc) { pc = d; pick = j }
      }
      mid.push(pick); left.delete(pick); cur = pick
    }
    let improved = true, guard = 0
    while (improved && guard++ < 60) {
      improved = false
      let base = cost(mid)
      for (let i = 0; i < mid.length - 1; i++) {
        for (let j = i + 1; j < mid.length; j++) {
          const cand = [...mid.slice(0, i), ...mid.slice(i, j + 1).reverse(), ...mid.slice(j + 1)]
          const c = cost(cand)
          if (c + 1e-9 < base) { mid.splice(0, mid.length, ...cand); base = c; improved = true }
        }
      }
      for (let i = 0; i < mid.length; i++) {
        for (let j = 0; j < mid.length; j++) {
          if (i === j) continue
          const cand = mid.slice(); const [x] = cand.splice(i, 1); cand.splice(j, 0, x)
          const c = cost(cand)
          if (c + 1e-9 < base) { mid.splice(0, mid.length, ...cand); base = c; improved = true }
        }
      }
    }
    const c = cost(mid)
    if (c < bestCost) { bestCost = c; best = mid.slice() }
  }
  return full(best)
}

// Distance and time of each leg of an ordered route, plus the totals.
export function legsFor(order: number[], inp: OrderInput): { legs: Leg[]; totalKm: number; totalMin: number } {
  const legs: Leg[] = order.map((s, k) => (k === 0 ? (inp.fromStart ? inp.fromStart[s] : { km: 0, min: 0 }) : inp.stops[order[k - 1]][s]))
  const totalKm = Math.round(legs.reduce((a, l) => a + l.km, 0) * 10) / 10
  const totalMin = legs.reduce((a, l) => a + l.min, 0)
  return { legs, totalKm, totalMin }
}
