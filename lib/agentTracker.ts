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
  sending = true
  try {
    const res = await fetch('/api/agent/location', {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ latitude: p.latitude, longitude: p.longitude, accuracy: p.accuracy, speed: p.speed, heading: p.heading, timestamp: p.timestamp }),
    })
    const json = await res.json().catch(() => ({ success: false, error: 'Unexpected reply' }))
    if (json.success) set({ lastSent: Date.now(), error: null })
    else if (res.status === 409) { halt(); await refresh() } // punched out (maybe on another device) or no attendance
    else set({ error: json.error || 'Could not send location' })
  } catch { set({ error: 'No internet. Will keep trying.' }) }
  finally { sending = false }
}

function onFix(pos: GeolocationPosition) {
  const c = pos.coords, now = Date.now()
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

function begin() {
  if (state.phase === 'tracking' && watchId !== null) return
  set({ phase: 'tracking', error: null })
  if (!navigator.geolocation) { set({ error: 'This phone cannot share its location', permission: 'denied' }); return }
  watchId = navigator.geolocation.watchPosition(onFix, err => {
    if (err.code === err.PERMISSION_DENIED) set({ permission: 'denied', error: 'Location is blocked. Allow location for this site in the browser settings.' })
    else if (err.code === err.POSITION_UNAVAILABLE) set({ error: 'Location unavailable. Check the GPS signal.' })
    else set({ error: 'Location request timed out. Retrying.' })
  }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 })
  if (timer) clearInterval(timer)
  timer = setInterval(() => { if (!document.hidden) send() }, SEND_EVERY_MS)
  keepAwake()
}

function halt() {
  if (watchId !== null) { try { navigator.geolocation.clearWatch(watchId) } catch {} watchId = null }
  if (timer) { clearInterval(timer); timer = null }
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
      keepAwake(); send()
    })
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
