'use client'
import { useEffect, useState, useRef } from 'react'
import { Session } from '@/types'

export default function AgentLocationPage({ session }: { session: Session }) {
  const [tracking, setTracking] = useState(false)
  const [permission, setPermission] = useState<'granted' | 'denied' | 'prompt' | 'checking'>('checking')
  const [position, setPosition] = useState<{ latitude: number; longitude: number; accuracy: number; speed: number | null; heading: number | null; timestamp: number } | null>(null)
  const [lastSent, setLastSent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const watchIdRef = useRef<number | null>(null)
  const sendIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const isVisibleRef = useRef(true)
  const lastPositionRef = useRef<{ latitude: number; longitude: number; timestamp: number } | null>(null)

  // Check geolocation permission on mount
  useEffect(() => {
    if (!navigator.geolocation) {
      setPermission('denied')
      setError('Geolocation is not supported by this browser')
      return
    }
    navigator.permissions.query({ name: 'geolocation' as PermissionName }).then(result => {
      setPermission(result.state)
      result.onchange = () => setPermission(result.state)
    }).catch(() => setPermission('prompt'))
  }, [])

  // Page visibility - pause tracking when tab hidden
  useEffect(() => {
    const handleVisibilityChange = () => {
      isVisibleRef.current = !document.hidden
      if (document.hidden && tracking) {
        setError('Tab hidden — location updates paused')
      } else if (!document.hidden && tracking && !error) {
        setError(null)
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [tracking, error])

  // Start watching position
  const startWatch = () => {
    if (!navigator.geolocation) return
    watchIdRef.current = navigator.geolocation.watchPosition(
      pos => {
        const now = Date.now()
        const coords = pos.coords
        let speed: number | null = coords.speed
        let heading: number | null = coords.heading

        // Calculate speed/heading from previous position if not available
        if ((speed === null || speed === 0) && lastPositionRef.current) {
          const prev = lastPositionRef.current
          const dt = (now - prev.timestamp) / 1000 // seconds
          if (dt > 0) {
            const R = 6371000 // Earth radius in meters
            const lat1 = prev.latitude * Math.PI / 180
            const lat2 = coords.latitude * Math.PI / 180
            const dLat = (coords.latitude - prev.latitude) * Math.PI / 180
            const dLon = (coords.longitude - prev.longitude) * Math.PI / 180
            const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(dLon/2) * Math.sin(dLon/2)
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
            const distance = R * c
            speed = distance / dt // m/s
            heading = Math.atan2(dLon * Math.cos(lat2), dLat) * 180 / Math.PI
            if (heading < 0) heading += 360
          }
        }

        lastPositionRef.current = { latitude: coords.latitude, longitude: coords.longitude, timestamp: now }

        setPosition({
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
          speed,
          heading,
          timestamp: now,
        })
        setPermission('granted')
        setError(null)
      },
      err => {
        if (err.code === err.PERMISSION_DENIED) {
          setPermission('denied')
          setError('Location permission denied. Enable in browser settings.')
          stopTracking()
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setError('Location unavailable. Check GPS signal.')
        } else if (err.code === err.TIMEOUT) {
          setError('Location request timed out.')
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    )
  }

  // Stop watching position
  const stopWatch = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
  }

  // Send location to server
  const sendLocation = async () => {
    if (!position || loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/agent/location', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: position.latitude,
          longitude: position.longitude,
          accuracy: position.accuracy,
          speed: position.speed,
          heading: position.heading,
          timestamp: position.timestamp,
        }),
      })
      const json = await res.json()
      if (json.success) {
        setLastSent(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
      } else {
        setError(json.error || 'Failed to send location')
      }
    } catch {
      setError('Network error sending location')
    } finally {
      setLoading(false)
    }
  }

  // Start/stop tracking
  const startTracking = async () => {
    if (permission === 'denied') {
      setError('Please enable location permission in browser settings')
      return
    }
    setTracking(true)
    setError(null)
    startWatch()

    // Send immediately
    await sendLocation()

    // Then send every 10 seconds when tab visible (more real-time like Zomato)
    sendIntervalRef.current = setInterval(() => {
      if (isVisibleRef.current && position) sendLocation()
    }, 10000)
  }

  const stopTracking = async () => {
    setTracking(false)
    stopWatch()
    if (sendIntervalRef.current) {
      clearInterval(sendIntervalRef.current)
      sendIntervalRef.current = null
    }
    setLoading(false)
    try {
      await fetch('/api/agent/location/toggle', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ isTracking: false }),
      })
    } catch {}
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopWatch()
      if (sendIntervalRef.current) clearInterval(sendIntervalRef.current)
    }
  }, [])

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
            <p className="mt-1 text-xs text-[#697586]">Share your GPS position with admin & staff</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tracking ? 'bg-green-100 text-green-700' : permission === 'denied' ? 'bg-red-100 text-red-700' : 'bg-[#f4f5f7] text-[#697586]'}`}>
            {tracking ? 'TRACKING ACTIVE' : permission === 'denied' ? 'PERMISSION DENIED' : 'STANDBY'}
          </span>
        </div>

        {permission === 'denied' && (
          <div className="mt-4 p-4 rounded-xl bg-red-50 border border-red-200">
            <p className="text-sm font-medium text-red-700 mb-1">Location Access Blocked</p>
            <p className="text-xs text-red-600 mb-3">Enable location permission in your browser settings to use tracking.</p>
            <button onClick={() => startTracking()} className="rounded-xl bg-red-600 px-3 py-2 text-xs font-semibold text-white">Retry Permission</button>
          </div>
        )}

        {tracking && permission === 'granted' && (
          <button onClick={stopTracking} className="mt-4 w-full rounded-2xl bg-red-600 px-4 py-3 text-sm font-semibold text-white flex items-center justify-center gap-2">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
            Stop Tracking
          </button>
        )}

        {!tracking && permission !== 'denied' && (
          <button onClick={startTracking} disabled={loading} className="mt-4 w-full rounded-2xl bg-[#1a1a2e] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Starting...
              </>
            ) : (
              <>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                Start Tracking
              </>
            )}
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
                <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-[#697586]">Coordinates</p>
                <p className="font-mono text-sm">{formatCoords(position.latitude, position.longitude)}</p>
              </div>
              <div>
                <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-[#697586]">Accuracy</p>
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
                <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-[#697586]">Google Maps</p>
                <a href={`https://maps.google.com/?q=${position.latitude},${position.longitude}`} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                  Open in Maps
                </a>
              </div>
            </div>
            {lastSent && (
              <div className="pt-2 border-t border-black/5">
                <p className="text-xs text-[#697586]">Last sent to server: <span className="font-mono text-[#1a1a2e]">{lastSent}</span></p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-[#e5e7eb] bg-[#f9fafb] text-xs text-[#697586]">
            {permission === 'prompt' ? 'Requesting location permission...' : permission === 'checking' ? 'Checking permission...' : 'Start tracking to get position'}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel p-5 space-y-3">
        <p className="text-sm font-semibold text-[#1a1a2e]">How it works</p>
        <div className="space-y-2 text-xs text-[#697586]">
          <p className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[#1a1a2e] shrink-0"></span>GPS position captured via browser Geolocation API</p>
          <p className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[#1a1a2e] shrink-0"></span>Sent to server every 30 seconds while tracking is ON</p>
          <p className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[#1a1a2e] shrink-0"></span>Pauses automatically when browser tab is hidden (battery saving)</p>
          <p className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[#1a1a2e] shrink-0"></span>Admin & Staff can view your location on map in real-time</p>
          <p className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[#1a1a2e] shrink-0"></span>Accuracy shown so you know GPS quality (green ≤10m, yellow ≤50m)</p>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800 font-semibold">✕</button>
        </div>
      )}
    </div>
  )
}