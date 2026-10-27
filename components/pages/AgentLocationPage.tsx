'use client'
import { useState } from 'react'
import { Session } from '@/types'
import { punchOut, useAgentTracker } from '@/lib/agentTracker'

// Status page for the agent. Sharing itself is run by lib/agentTracker.ts (started once in the app shell), so it keeps
// going when the agent opens other pages. It starts when attendance is marked and stops at punch-out.
export default function AgentLocationPage({ session: _session }: { session: Session }) {
  const t = useAgentTracker()
  const position = t.position
  const tracking = t.phase === 'tracking'
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const lastSent = t.lastSent ? new Date(t.lastSent).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : null
  const error = msg || t.error
  const permission = t.permission

  // Format coordinates
  const formatCoords = (lat: number, lng: number) => {
    const latDir = lat >= 0 ? 'N' : 'S'
    const lngDir = lng >= 0 ? 'E' : 'W'
    return `${Math.abs(lat).toFixed(6)}°${latDir}, ${Math.abs(lng).toFixed(6)}°${lngDir}`
  }

  // Accuracy badge color
  const accuracyColor = (acc: number | null) => {
    if (!acc) return 'bg-gray-100 text-gray-600'
    if (acc <= 10) return 'bg-green-100 text-green-700'
    if (acc <= 50) return 'bg-yellow-100 text-yellow-700'
    return 'bg-red-100 text-red-700'
  }

  return (
    <div className="space-y-4">
      {/* Status Card */}
      <div className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Live Location Tracking</p>
            <p className="mt-1 text-xs text-soft">Share your GPS position with admin & staff</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tracking ? 'bg-green-100 text-green-700' : permission === 'denied' ? 'bg-red-100 text-red-700' : 'bg-mist text-soft'}`}>
            {tracking ? 'TRACKING ACTIVE' : permission === 'denied' ? 'PERMISSION DENIED' : t.phase === 'punchedOut' ? 'PUNCHED OUT' : 'STANDBY'}
          </span>
        </div>

        {permission === 'denied' && (
          <div className="mt-4 p-4 rounded-xl bg-red-50 border border-red-200">
            <p className="text-sm font-medium text-red-700 mb-1">Location Access Blocked</p>
            <p className="text-xs text-red-600">Allow location for this site in your browser settings, then come back. Sharing starts again by itself.</p>
          </div>
        )}

        {t.phase === 'noAttendance' && <p className="mt-4 rounded-xl bg-mist px-4 py-3 text-xs text-soft">Tracking starts when you mark attendance. Sign in again to mark it.</p>}
        {t.phase === 'punchedOut' && <p className="mt-4 rounded-xl bg-mist px-4 py-3 text-xs text-soft">You punched out for today. Tracking is off.</p>}

        {tracking && (
          <button disabled={busy} onClick={async () => {
            if (!confirm('Punch out for today? Location sharing will stop.')) return
            setBusy(true); setMsg(''); const e = await punchOut(); setBusy(false); if (e) setMsg(e)
          }} className="mt-4 w-full rounded-2xl bg-ink px-4 py-3 text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50">
            {busy ? 'Saving…' : 'Punch out'}
          </button>
        )}
      </div>

      {/* Current Position */}
      <div className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel p-5">
        <p className="text-sm font-semibold mb-4">Current Position</p>
        {position ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-soft">Coordinates</p>
                <p className="font-mono text-sm">{formatCoords(position.latitude, position.longitude)}</p>
              </div>
              <div>
                <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-soft">Accuracy</p>
                <p className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${accuracyColor(position.accuracy)}`}>
                    ±{Math.round(position.accuracy)} m
                  </span>
                  {position.accuracy && position.accuracy <= 10 && <span className="text-green-600 text-xs">Excellent</span>}
                  {position.accuracy && position.accuracy > 10 && position.accuracy <= 50 && <span className="text-yellow-600 text-xs">Good</span>}
                  {position.accuracy && position.accuracy > 50 && <span className="text-red-600 text-xs">Low</span>}
                </p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-soft">Google Maps</p>
                <a href={`https://maps.google.com/?q=${position.latitude},${position.longitude}`} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                  Open in Maps
                </a>
              </div>
            </div>
            {lastSent && (
              <div className="pt-2 border-t border-black/5">
                <p className="text-xs text-soft">Last sent to server: <span className="font-mono text-ink">{lastSent}</span></p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-line bg-panel text-xs text-soft">
            {tracking ? 'Waiting for the first GPS fix…' : 'Tracking is off'}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel p-5 space-y-3">
        <p className="text-sm font-semibold text-ink">How it works</p>
        <div className="space-y-2 text-xs text-soft">
          <p className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-ink shrink-0"></span>GPS position captured via browser Geolocation API</p>
          <p className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-ink shrink-0"></span>Starts when you mark attendance and stops when you punch out. It keeps going on every page</p>
          <p className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-ink shrink-0"></span>Sent to the server every 10 seconds. Keep this page open; your phone may pause it if the screen is locked or you switch apps</p>
          <p className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-ink shrink-0"></span>Admin & Staff can view your location on map in real-time</p>
          <p className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-ink shrink-0"></span>Accuracy shown so you know GPS quality (green ≤10m, yellow ≤50m)</p>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button onClick={() => setMsg('')} className="text-red-600 hover:text-red-800 font-semibold">✕</button>
        </div>
      )}
    </div>
  )
}