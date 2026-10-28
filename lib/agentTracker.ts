'use client'
// Live location sharing for an NGF agent. It lives here, outside any page, so it keeps running while the agent moves
// between pages. It runs from "attendance marked" until "punch out", and resumes by itself after a reload or re-login.
import { useSyncExternalStore } from 'react'

export type TrackerState = {
  phase: 'idle' | 'checking' | 'tracking' | 'punchedOut' | 'noAttendance'
  permission: 'granted' | 'denied' | 'prompt' | 'unknown'
  position: { latitude: number; longitude: number; accuracy: number; speed: number | null; heading: number | null; timestamp: number } | null
  lastSent: number | null
  error: string | null
}

const SEND_EVERY_MS = 10_000
let state: TrackerState = { phase: 'idle', permission: 'unknown', position: null, lastSent: null, error: null }
const subs = new Set<() => void>()
const set = (p: Partial<TrackerState>) => { state = { ...state, ...p }; subs.forEach(f => f()) }

let token = ''
let watchId: number | null = null
let timer: ReturnType<typeof setInterval> | null = null
let sending = false
let wakeLock: { release: () => Promise<void> } | null = null
let prev: { latitude: number; longitude: number; timestamp: number } | null = null
let listening = false
let lastFixAt = 0                                   // when the phone last gave us a position
let watchdog: ReturnType<typeof setInterval> | null = null
let restartTimer: ReturnType<typeof setTimeout> | null = null
const STALE_MS = 25_000                             // no position for this long = the phone's location feed has stalled

const headers = () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' })

async function keepAwake() {
  try {
    const nav = navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }
    if (!wakeLock && nav.wakeLock && !document.hidden) wakeLock = await nav.wakeLock.request('screen')
  } catch { /* not supported or refused: tracking still works while the page is open */ }
}
function letSleep() { try { wakeLock?.release() } catch {} wakeLock = null }

async function send() {
  const p = state.position
  if (!p || sending || state.phase !== 'tracking') return
  if (Date.now() - p.timestamp > 90_000) return   // an old position must not be sent as if it were live
  sending = true
  // a request that never answers (weak signal) must not block every later one
  const ctrl = new AbortController()
  const abort = setTimeout(() => ctrl.abort(), 15_000)
  try {
    const res = await fetch('/api/agent/location', {
      method: 'POST', headers: headers(), signal: ctrl.signal,
      body: JSON.stringify({ latitude: p.latitude, longitude: p.longitude, accuracy: p.accuracy, speed: p.speed, heading: p.heading, timestamp: p.timestamp }),
    })
    const json = await res.json().catch(() => ({ success: false, error: 'Unexpected reply' }))
    if (json.success) set({ lastSent: Date.now(), error: null })
    else if (res.status === 409) { halt(); await refresh() } // punched out (maybe on another device) or no attendance
    else set({ error: json.error || 'Could not send location' })
  } catch { set({ error: 'No internet. Will keep trying.' }) }
  finally { clearTimeout(abort); sending = false }
}

function onFix(pos: GeolocationPosition) {
  const c = pos.coords, now = Date.now()
  lastFixAt = now
  let speed = c.speed, heading = c.heading
  if ((speed == null || speed === 0) && prev) {
    const dt = (now - prev.timestamp) / 1000
    if (dt > 0) {
      const R = 6371000, r = Math.PI / 180
      const dLat = (c.latitude - prev.latitude) * r, dLon = (c.longitude - prev.longitude) * r
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(prev.latitude * r) * Math.cos(c.latitude * r) * Math.sin(dLon / 2) ** 2
      speed = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) / dt
      heading = (Math.atan2(dLon * Math.cos(c.latitude * r), dLat) * 180 / Math.PI + 360) % 360
    }
  }
  prev = { latitude: c.latitude, longitude: c.longitude, timestamp: now }
  const first = !state.position
  set({ position: { latitude: c.latitude, longitude: c.longitude, accuracy: c.accuracy, speed, heading, timestamp: now }, permission: 'granted', error: null })
  if (first) send() // do not wait for the next tick
}

function onWatchError(err: GeolocationPositionError) {
  if (err.code === err.PERMISSION_DENIED) { set({ permission: 'denied', error: 'Location is blocked. Allow location for this site in the browser settings.' }); return }
  set({ error: err.code === err.POSITION_UNAVAILABLE ? 'Location unavailable. Check the GPS signal. Retrying.' : 'Location request timed out. Retrying.' })
  // a phone's location feed often stops for good after an error: start a fresh one shortly
  if (restartTimer) clearTimeout(restartTimer)
  restartTimer = setTimeout(() => { restartTimer = null; if (state.phase === 'tracking') startWatch() }, 3000)
}

// (Re)start the phone's location feed. Also asks once for a position right now, which wakes a sleeping GPS.
function startWatch() {
  if (!navigator.geolocation) return
  if (watchId !== null) { try { navigator.geolocation.clearWatch(watchId) } catch {} watchId = null }
  const opts = { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 }
  watchId = navigator.geolocation.watchPosition(onFix, onWatchError, opts)
  navigator.geolocation.getCurrentPosition(onFix, () => {}, opts)
}

function begin() {
  if (state.phase === 'tracking' && watchId !== null) return
  set({ phase: 'tracking', error: null })
  if (!navigator.geolocation) { set({ error: 'This phone cannot share its location', permission: 'denied' }); return }
  lastFixAt = Date.now()
  startWatch()
  if (timer) clearInterval(timer)
  timer = setInterval(() => { if (!document.hidden) send() }, SEND_EVERY_MS)
  // watchdog: if no position has arrived for a while, the feed has stalled; restart it by itself (no need to reopen the app)
  if (watchdog) clearInterval(watchdog)
  watchdog = setInterval(() => {
    if (state.phase !== 'tracking' || document.hidden || state.permission === 'denied') return
    if (Date.now() - lastFixAt > STALE_MS) { lastFixAt = Date.now(); startWatch() }
  }, 5000)
  keepAwake()
}

function halt() {
  if (watchId !== null) { try { navigator.geolocation.clearWatch(watchId) } catch {} watchId = null }
  if (timer) { clearInterval(timer); timer = null }
  if (watchdog) { clearInterval(watchdog); watchdog = null }
  if (restartTimer) { clearTimeout(restartTimer); restartTimer = null }
  letSleep()
  prev = null
}

// Ask the server where today stands and start or stop accordingly
export async function refresh() {
  if (!token) return
  try {
    const res = await fetch('/api/agent/attendance?me=1', { headers: { Authorization: `Bearer ${token}` } })
    const json = await res.json()
    if (!json.success) return
    const d = json.data
    if (d.markedIn && !d.punchedOut) begin()
    else { halt(); set({ phase: d.punchedOut ? 'punchedOut' : 'noAttendance', position: null }) }
  } catch { /* offline: keep whatever is running */ }
}

export function startAgentTracker(sessionToken: string) {
  token = sessionToken
  if (!listening) {
    listening = true
    // coming back to the page: send straight away and take the screen lock again
    document.addEventListener('visibilitychange', () => {
      if (document.hidden || state.phase !== 'tracking') return
      keepAwake()
      lastFixAt = Date.now()
      startWatch()          // the phone usually freezes the location feed while the screen is off; start it again
      send()
      refresh()             // and confirm with the server that the day is still open
    })
    window.addEventListener('online', () => { if (state.phase === 'tracking') { startWatch(); send() } })   // signal is back: send at once
    try {
      navigator.permissions?.query({ name: 'geolocation' as PermissionName }).then(r => {
        set({ permission: r.state })
        r.onchange = () => { set({ permission: r.state }); if (r.state === 'granted' && state.phase === 'tracking') { halt(); begin() } }
      }).catch(() => {})
    } catch {}
  }
  set({ phase: 'checking' })
  refresh()
}

export function stopAgentTracker() { halt(); token = ''; set({ phase: 'idle', position: null, lastSent: null, error: null }) }

// End of day. Returns an error message, or '' when done.
export async function punchOut(): Promise<string> {
  const pos = state.position
  try {
    const res = await fetch('/api/agent/attendance', {
      method: 'PATCH', headers: headers(),
      body: JSON.stringify(pos ? { latitude: pos.latitude, longitude: pos.longitude } : {}),
    })
    const json = await res.json().catch(() => ({ success: false, error: 'Unexpected reply' }))
    if (!json.success) return json.error || 'Could not punch out'
    halt(); set({ phase: 'punchedOut', position: null })
    return ''
  } catch { return 'No internet. Try again.' }
}

export function useAgentTracker(): TrackerState {
  return useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f) } }, () => state, () => state)
}
