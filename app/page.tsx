'use client'
import { useEffect, useState } from 'react'
import Login from '@/components/Login'
import AppShell from '@/components/AppShell'
import { Session } from '@/types'

function AttendanceModal({ session, onDone }: { session: Session; onDone: () => void }) {
  const [gettingLocation, setGettingLocation] = useState(false)
  const [location, setLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    // Auto-get location on mount
    getLocation()
  }, [])

  function getLocation() {
    setGettingLocation(true)
    setError('')
    navigator.geolocation.getCurrentPosition(
      pos => {
        const loc = { 
          lat: pos.coords.latitude, 
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy || 0
        }
        setLocation(loc)
        setGettingLocation(false)
      },
      err => {
        setError(err.message || 'Location access denied. Please enable location permission.')
        setGettingLocation(false)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  async function markAttendance() {
    if (!location) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/agent/attendance', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: location.lat,
          longitude: location.lng,
          accuracy: location.accuracy,
        }),
      })
      const json = await res.json()
      if (json.success) {
        setSuccess(true)
        setTimeout(() => onDone(), 1500)
      } else {
        setError(json.error || 'Failed to mark attendance')
      }
    } catch {
      setError('Network error')
    } finally {
      setSubmitting(false)
    }
  }

  function skip() {
    onDone()
  }

  if (success) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-md rounded-[1.75rem] border border-white/70 bg-white shadow-panel p-6 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-lg font-semibold">Attendance Marked</p>
          <p className="mt-2 text-sm text-soft">Location saved successfully</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-[1.75rem] border border-white/70 bg-white shadow-panel p-6">
        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-blue-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold">Mark Attendance</h3>
          <p className="mt-1 text-sm text-soft">Welcome back! Please confirm your location to start your day.</p>
        </div>

        {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

        <div className="rounded-xl bg-mist p-4 mb-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-soft mb-2">Current Location</p>
          {gettingLocation ? (
            <div className="flex items-center gap-3">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-ink border-t-transparent" />
              <span className="text-sm text-soft">Getting GPS location...</span>
            </div>
          ) : location ? (
            <p className="font-mono text-sm">{location.lat.toFixed(6)}, {location.lng.toFixed(6)} <span className="text-xs text-soft">(±{Math.round(location.accuracy)}m)</span></p>
          ) : (
            <button onClick={getLocation} className="w-full rounded-xl bg-white border border-line px-4 py-3 text-sm font-medium">
              Retry Location
            </button>
          )}
        </div>

        <div className="flex gap-2">
          <button onClick={skip} className="flex-1 rounded-2xl border border-line bg-white px-4 py-3 text-sm font-semibold text-soft hover:bg-mist">
            Skip for Now
          </button>
          <button onClick={markAttendance} disabled={submitting || gettingLocation || !location}
            className="flex-1 rounded-2xl bg-ink px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
            {submitting ? 'Saving...' : 'Mark Attendance'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAttendance, setShowAttendance] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const stored = localStorage.getItem('ngf_token')
      let payload: (Session & { exp: number }) | null = null
      if (stored) {
        try { payload = JSON.parse(atob(stored.split('.')[1])) } catch { payload = null }
        if (!payload || !(payload.exp * 1000 > Date.now())) { localStorage.removeItem('ngf_token'); payload = null }
      }
      if (stored && payload) {
        // Confirm the server still accepts the token (e.g. not revoked by a password change) BEFORE showing
        // the signed-in UI, so a revoked session never flashes the previous user's portal.
        try {
          const r = await fetch('/api/auth/session', { headers: { Authorization: `Bearer ${stored}` } })
          if (r.status === 401) localStorage.removeItem('ngf_token')
          else if (!cancelled) setSession({ ...payload, token: stored })
        } catch {
          if (!cancelled) setSession({ ...payload, token: stored }) // offline: keep existing behaviour
        }
      }
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  const onLogin = (s: Session) => {
    localStorage.setItem('ngf_token', s.token)
    if (s.role === 'NGF AGENT') {
      setShowAttendance(true)
    } else {
      setSession(s)
    }
  }

  const onAttendanceDone = () => {
    setShowAttendance(false)
    // Get the session from localStorage since we haven't set it in state yet
    const stored = localStorage.getItem('ngf_token')
    if (stored) {
      try {
        const payload = JSON.parse(atob(stored.split('.')[1]))
        setSession({ ...payload, token: stored })
      } catch {}
    }
  }

  const onLogout = () => {
    localStorage.removeItem('ngf_token')
    localStorage.removeItem('ngf_qrtrust')
    try { window.history.replaceState(null, '', window.location.pathname) } catch {}
    setSession(null)
  }

  // While the saved login is checked, show the app's own frame (bar, header, cards) instead of a blank white page
  if (loading) return (
    <div className="flex h-screen bg-mist" aria-busy="true" aria-label="Loading">
      <div className="hidden w-14 shrink-0 flex-col items-center gap-4 border-r border-line bg-white py-5 sm:flex">
        {[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="h-7 w-7 animate-pulse rounded-lg bg-[#e8eaf0]" />)}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-16 items-center justify-between border-b border-line bg-white px-5">
          <div className="h-5 w-36 animate-pulse rounded bg-[#e8eaf0]" />
          <div className="h-8 w-8 animate-pulse rounded-full bg-[#e8eaf0]" />
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map(i => <div key={i} className="h-28 animate-pulse rounded-2xl bg-white" />)}
        </div>
      </div>
    </div>
  )

  if (!session && !showAttendance) return <Login onLogin={onLogin} />
  
  if (showAttendance) {
    const tempSession = (() => {
      const stored = localStorage.getItem('ngf_token')
      if (stored) {
        try {
          const payload = JSON.parse(atob(stored.split('.')[1]))
          return { ...payload, token: stored } as Session
        } catch { return null }
      }
      return null
    })()
    if (tempSession) return <AttendanceModal session={tempSession} onDone={onAttendanceDone} />
  }
  
  return <AppShell session={session!} onLogout={onLogout} />
}
