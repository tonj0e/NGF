'use client'
import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { Session, AgentLocation } from '@/types'

// Global flag to prevent multiple Google Maps API loads
declare global {
  interface Window {
    google: typeof google
    __googleMapsLoaded: boolean
    __googleMapsLoadPromise: Promise<void> | null
  }
}

if (typeof window !== 'undefined' && !window.__googleMapsLoaded) {
  window.__googleMapsLoaded = false
  window.__googleMapsLoadPromise = null
}

function getMarkerColor(isOnline: boolean, ageMinutes: number | null): string {
  if (!isOnline) return '#ef4444'
  if (ageMinutes === null) return '#ef4444'
  if (ageMinutes <= 2) return '#22c55e'
  if (ageMinutes <= 5) return '#eab308'
  return '#f97316'
}

export default function AgentTrackingPage({ session }: { session: Session }) {
  const [locations, setLocations] = useState<Map<string, AgentLocation>>(new Map())
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_JAVASCRIPT_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  const isApiKeyConfigured = !!(apiKey && apiKey !== 'your_google_maps_api_key_here')
  const [loading, setLoading] = useState(isApiKeyConfigured)
  const [error, setError] = useState<string | null>(null)
  const mapInstanceRef = useRef<google.maps.Map | null>(null)
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map())
  const infoWindowsRef = useRef<Map<string, google.maps.InfoWindow>>(new Map())
  const animationFramesRef = useRef<Map<string, number>>(new Map())

  // ===== Helper functions (defined first, before useEffects) =====

  const animateMarkerMove = useCallback((
    marker: google.maps.Marker,
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number,
    duration: number = 1000
  ) => {
    const startTimeRef = { current: Date.now() }
    const animate = () => {
      const elapsed = Date.now() - startTimeRef.current
      const progress = Math.min(elapsed / duration, 1)
      const eased = progress * (2 - progress) // ease-out

      const lat = fromLat + (toLat - fromLat) * eased
      const lng = fromLng + (toLng - fromLng) * eased

      marker.setPosition({ lat, lng })

      if (progress < 1) {
        const frame = requestAnimationFrame(animate)
        animationFramesRef.current.set(marker.getTitle() || '', frame)
      }
    }
    animate()
  }, [])

  const createInfoWindow = useCallback((loc: AgentLocation, agentId: string): google.maps.InfoWindow => {
    const color = getMarkerColor(loc.isOnline, loc.ageMinutes)

    const ageText = loc.ageMinutes === null
      ? 'Never updated'
      : loc.ageMinutes < 1
        ? 'Just now'
        : loc.ageMinutes < 60
          ? `${loc.ageMinutes}m ago`
          : `${Math.floor(loc.ageMinutes / 60)}h ago`

    const speedText = loc.speed !== null && loc.speed !== undefined
      ? `${(loc.speed * 3.6).toFixed(1)} km/h`
      : 'Unknown'

    const content = `
      <div style="min-width: 240px; padding: 10px; font-family: inherit;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <div style="width: 12px; height: 12px; border-radius: 50%; background: ${color};"></div>
          <strong style="font-size: 15px;">${loc.name}</strong>
        </div>
        ${loc.phone ? `<div style="font-size: 12px; color: #666; margin: 2px 0;">📞 ${loc.phone}</div>` : ''}
        ${loc.agentType ? `<div style="font-size: 12px; color: #666; margin: 2px 0;">🏷 ${loc.agentType}</div>` : ''}
        <div style="font-size: 12px; margin: 4px 0;">
          <span style="color: ${color}; font-weight: 600;">●</span> ${loc.isOnline ? 'LIVE' : 'Offline'}
        </div>
        <div style="font-size: 11px; color: #888; margin: 2px 0;">Updated: ${ageText}</div>
        ${loc.accuracy ? `<div style="font-size: 11px; color: #888;">Accuracy: ±${Math.round(loc.accuracy)}m</div>` : ''}
        ${loc.speed !== null ? `<div style="font-size: 11px; color: #888;">Speed: ${speedText}</div>` : ''}
        <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid #eee;">
          <a href="https://maps.google.com/?q=${loc.latitude},${loc.longitude}"
             target="_blank" rel="noopener noreferrer"
             style="font-size: 12px; color: #2563eb; text-decoration: none; font-weight: 500;">
            Open in Google Maps →
          </a>
        </div>
      </div>
    `

    return new window.google.maps.InfoWindow({ content })
  }, [])

  const createMarker = useCallback((loc: AgentLocation, agentId: string): google.maps.Marker => {
    const color = getMarkerColor(loc.isOnline, loc.ageMinutes)

    const svgMarker = {
      path: 'M 12 2 C 8.13 2 5 5.13 5 9 c 0 5.25 7 13 7 13 s 7 -7.75 7 -13 c 0 -3.87 -3.13 -7 -7 -7 z',
      fillColor: color,
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 2,
      scale: 1.3,
      anchor: new window.google.maps.Point(12, 24),
      rotation: loc.heading || 0,
    }

    const marker = new window.google.maps.Marker({
      position: { lat: loc.latitude!, lng: loc.longitude! },
      map: mapInstanceRef.current,
      icon: svgMarker,
      title: loc.name,
      label: {
        text: loc.name,
        color: '#1a1a2e',
        fontSize: '10px',
        fontWeight: '600',
      },
      optimized: false,
    })

    // Create info window
    const infoWindow = createInfoWindow(loc, agentId)
    infoWindowsRef.current.set(agentId, infoWindow)

    marker.addListener('click', () => {
      infoWindowsRef.current.forEach((iw) => iw.close())
      infoWindow.open(mapInstanceRef.current!, marker)
      if (mapInstanceRef.current) {
        mapInstanceRef.current.setCenter(marker.getPosition()!)
        mapInstanceRef.current.setZoom(15)
      }
    })

    return marker
  }, [createInfoWindow])

  const fitBoundsToOnlineAgents = useCallback(() => {
    if (!mapInstanceRef.current || !window.google) return

    const onlineMarkers = Array.from(markersRef.current.entries())
      .filter(([agentId]) => {
        const loc = locations.get(agentId)
        return loc?.isOnline
      })
      .map(([, marker]) => marker)

    if (onlineMarkers.length > 0) {
      const bounds = new window.google.maps.LatLngBounds()
      onlineMarkers.forEach(marker => bounds.extend(marker.getPosition()!))
      mapInstanceRef.current.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 })

      const listener = window.google.maps.event.addListenerOnce(mapInstanceRef.current, 'idle', () => {
        if (mapInstanceRef.current && mapInstanceRef.current.getZoom()! > 16) {
          mapInstanceRef.current.setZoom(16)
        }
      })
    }
  }, [locations])

  // Load initial agent locations
  const loadLocations = useCallback(async () => {
    try {
      const res = await fetch('/api/agent/location?activeOnly=true', {
        headers: { Authorization: `Bearer ${session.token}` },
      })
      const json = await res.json()
      if (json.success) {
        const newLocations = new Map<string, AgentLocation>()
        ;(json.data.locations || []).forEach((loc: AgentLocation) => {
          newLocations.set(loc.agentId, loc)
        })

        // Update locations with smooth transitions
        if (mapInstanceRef.current && window.google) {
          newLocations.forEach((loc, agentId) => {
            const existingMarker = markersRef.current.get(agentId)
            if (existingMarker && loc.latitude !== null && loc.longitude !== null) {
              const oldPos = existingMarker.getPosition()
              if (oldPos) {
                // Animate to new position
                animateMarkerMove(
                  existingMarker,
                  oldPos.lat(),
                  oldPos.lng(),
                  loc.latitude,
                  loc.longitude,
                  1500
                )
                // Update marker color/rotation
                const color = getMarkerColor(loc.isOnline, loc.ageMinutes)
                const currentIcon = existingMarker.getIcon()
                if (currentIcon && typeof currentIcon === 'object' && 'path' in currentIcon) {
                  existingMarker.setIcon({ ...(currentIcon as google.maps.Symbol), fillColor: color, rotation: loc.heading || 0 } as google.maps.Symbol)
                } else if (currentIcon) {
                  existingMarker.setIcon(currentIcon as google.maps.Icon)
                }
                // Update info window
                const infoWindow = infoWindowsRef.current.get(agentId)
                if (infoWindow) {
                  infoWindow.setContent(createInfoWindow(loc, agentId).getContent()!)
                }
              }
            } else if (loc.latitude !== null && loc.longitude !== null) {
              // New marker
              const marker = createMarker(loc, agentId)
              markersRef.current.set(agentId, marker)
            }
          })

          // Remove markers for agents no longer in list
          markersRef.current.forEach((marker, agentId) => {
            if (!newLocations.has(agentId)) {
              marker.setMap(null)
              markersRef.current.delete(agentId)
              infoWindowsRef.current.get(agentId)?.close()
              infoWindowsRef.current.delete(agentId)
            }
          })

          // Fit bounds to show all online agents
          fitBoundsToOnlineAgents()
        }

        setLocations(newLocations)
      } else {
        setError(json.error || 'Failed to load locations')
      }
    } catch {
      setError('Network error loading agent locations')
    } finally {
      setLoading(false)
    }
  }, [session.token, animateMarkerMove, createMarker, createInfoWindow, fitBoundsToOnlineAgents])

  // Initialize Google Map
  const initMap = useCallback(() => {
    if (!window.google || mapInstanceRef.current) return

    // Wait for DOM element to exist
    const waitForElement = (id: string, retries = 50): Promise<HTMLElement | null> => {
      return new Promise((resolve) => {
        const attempt = () => {
          const el = document.getElementById(id)
          if (el) {
            resolve(el)
          } else if (retries > 0) {
            setTimeout(() => attempt(), 50)
          } else {
            resolve(null)
          }
        }
        attempt()
      })
    }

    waitForElement('agent-map-google').then((mapDiv) => {
      if (!mapDiv || !window.google) {
        console.error('Map container not found')
        return
      }

      const center = { lat: 10.8505, lng: 76.2711 }

      mapInstanceRef.current = new window.google.maps.Map(mapDiv, {
        center,
        zoom: 12,
        mapTypeControl: true,
        streetViewControl: false,
        fullscreenControl: true,
        mapTypeId: window.google.maps.MapTypeId.ROADMAP,
        gestureHandling: 'greedy',
      })

      // Add existing markers from state
      locations.forEach((loc, agentId) => {
        if (loc.latitude !== null && loc.longitude !== null) {
          createMarker(loc, agentId)
        }
      })

      // Fit bounds to online agents
      fitBoundsToOnlineAgents()
    })
  }, [locations, createMarker, fitBoundsToOnlineAgents])

  // Connect to SSE for real-time updates (polling fallback)
  const connectSSE = useCallback(() => {
    // Fallback: poll every 5 seconds for real-time feel
    const pollInterval = setInterval(() => {
      loadLocations()
    }, 5000)

    // Also listen for visibility change to reduce polling when tab hidden
    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearInterval(pollInterval)
      } else {
        loadLocations()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      clearInterval(pollInterval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [loadLocations])

  // Load Google Maps JS API (only once globally)
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_JAVASCRIPT_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

    if (!apiKey || apiKey === 'your_google_maps_api_key_here') {
      // State already set via initial value
      console.error('Google Maps API key not configured. Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to .env.local')
      return
    }

    // If already loaded globally, just init the map
    if (window.__googleMapsLoaded && window.google) {
      initMap()
      connectSSE()
      return
    }

    // If loading in progress, wait for it
    if (window.__googleMapsLoadPromise) {
      window.__googleMapsLoadPromise.then(() => {
        if (window.google) {
          initMap()
          connectSSE()
        }
      })
      return
    }

    // Start loading
    window.__googleMapsLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=marker`
      script.async = true
      script.defer = true
      script.onload = () => {
        window.__googleMapsLoaded = true
        resolve()
      }
      script.onerror = () => {
        window.__googleMapsLoadPromise = null
        reject(new Error('Failed to load Google Maps API'))
      }
      document.head.appendChild(script)
    })

    window.__googleMapsLoadPromise
      .then(() => {
        if (window.google) {
          initMap()
          connectSSE()
        }
      })
      .catch((err) => {
        setError(err.message)
      })

    return () => {
      // Don't destroy mapInstanceRef here - let it persist for reuse
    }
  }, [initMap, connectSSE])

  // Convert to array for sidebar
  const markersArray = useMemo(() => {
    return Array.from(locations.values())
      .filter(loc => loc.latitude !== null && loc.longitude !== null)
      .map(loc => ({
        id: loc.agentId,
        name: loc.name,
        phone: loc.phone,
        agentType: loc.agentType,
        lat: loc.latitude!,
        lng: loc.longitude!,
        accuracy: loc.accuracy,
        isOnline: loc.isOnline,
        ageMinutes: loc.ageMinutes,
        lastUpdate: loc.locationUpdatedAt,
        speed: loc.speed,
        heading: loc.heading,
      }))
  }, [locations])

  const formatTimeAgo = (dateStr: string | null, ageMinutes: number | null) => {
    if (!dateStr || ageMinutes === null) return 'Never'
    if (ageMinutes < 1) return 'Just now'
    if (ageMinutes < 60) return `${ageMinutes}m ago`
    const hours = Math.floor(ageMinutes / 60)
    return `${hours}h ago`
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex h-96 items-center justify-center rounded-[1.75rem] border border-white/70 bg-white shadow-panel">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#1a1a2e] border-t-transparent" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header Controls */}
      <div className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel p-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm font-semibold">Agent Live Tracking <span className="ml-2 text-xs text-green-600 font-normal animate-pulse">LIVE</span></p>
            <p className="mt-1 text-xs text-[#697586]">
              {Array.from(locations.values()).filter(l => l.isOnline).length} of {locations.size} agents online · Updates every 5s
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={loadLocations} disabled={loading} className="rounded-xl border border-[#e5e7eb] bg-white px-3 py-2 text-xs font-semibold disabled:opacity-50">
              {loading ? 'Refreshing…' : 'Refresh Now'}
            </button>
          </div>
        </div>
      </div>

      {/* Map + Sidebar */}
      <div className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel overflow-hidden">
        <div className="flex flex-col lg:flex-row">
          {/* Map Area */}
          <div className="lg:w-3/4 relative h-[560px]">
            <div id="agent-map-google" className="w-full h-full" />
          </div>

          {/* Sidebar - Agent List */}
          <div className="lg:w-1/4 border-l border-white/70 bg-[#fafafa] overflow-y-auto max-h-[560px] p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#697586] mb-3">Agents ({locations.size})</p>
            {locations.size === 0 ? (
              <div className="text-center py-8 text-xs text-[#697586]">
                <p>No agents sharing location</p>
                <p className="mt-1">Agents must start tracking from their portal</p>
              </div>
            ) : (
              <div className="space-y-2">
                {markersArray.map(agent => {
                  const color = getMarkerColor(agent.isOnline, agent.ageMinutes)
                  const statusText = agent.isOnline ? 'LIVE' : 'Offline'
                  const statusClass = agent.isOnline ? 'bg-green-100 text-green-700 animate-pulse' : 'bg-red-100 text-red-700'
                  return (
                    <div
                      key={agent.id}
                      className="rounded-xl bg-white p-3 border border-white/70 shadow-sm hover:shadow-md transition"
                      onClick={() => {
                        if (mapInstanceRef.current) {
                          mapInstanceRef.current.setCenter({ lat: agent.lat, lng: agent.lng })
                          mapInstanceRef.current.setZoom(16)
                          const iw = infoWindowsRef.current.get(agent.id)
                          const marker = markersRef.current.get(agent.id)
                          if (iw && marker) iw.open(mapInstanceRef.current, marker)
                        }
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className={`h-2.5 w-2.5 rounded-full ${statusClass}`} style={{ backgroundColor: color }} />
                            <p className="text-sm font-medium truncate">{agent.name}</p>
                            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${statusClass}`}>{statusText}</span>
                          </div>
                          {agent.phone && <p className="text-xs text-[#697586] mt-0.5">{agent.phone}</p>}
                          {agent.agentType && <p className="text-xs text-[#697586] mt-0.5">{agent.agentType}</p>}
                          {agent.speed !== null && agent.speed !== undefined && (
                            <p className="text-[10px] text-blue-600 mt-0.5">🚗 {(agent.speed * 3.6).toFixed(1)} km/h</p>
                          )}
                          <p className="text-[10px] text-[#9ca3af] mt-1">
                            {agent.isOnline && agent.ageMinutes !== null ? `Updated ${formatTimeAgo(agent.lastUpdate, agent.ageMinutes)}` : 'No recent location'}
                            {agent.accuracy && agent.isOnline && ` · ±${Math.round(agent.accuracy)}m`}
                          </p>
                        </div>
                        {agent.lat && agent.lng && (
                          <a href={`https://maps.google.com/?q=${agent.lat},${agent.lng}`} target="_blank" rel="noopener noreferrer"
                            className="shrink-0 rounded-lg bg-blue-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-blue-700 transition">
                            Maps
                          </a>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
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

declare global {
  interface Window {
    google: typeof google
  }
}