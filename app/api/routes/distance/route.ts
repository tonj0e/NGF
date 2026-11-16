import { NextRequest } from 'next/server'
import { apiHandler, getSession, ok, err } from '@/lib/api'
import { googleKey } from '@/lib/routeMath'
import { reportError } from '@/lib/monitor'

// Road distance between two points (Google Routes API, same DRIVE mode the staff Verification Routes use), for the agent's trip form.
// Display help only; the agent can still edit the number. Returns km: null when Google is not set up or cannot find a road.
const cache = new Map<string, { at: number; km: number }>()
const TTL = 6 * 3600_000

export const POST = apiHandler(async (req: NextRequest) => {
  await getSession(req)
  const body = await req.json().catch(() => ({}))
  const from = { lat: Number(body.from?.lat), lng: Number(body.from?.lng) }
  const to = { lat: Number(body.to?.lat), lng: Number(body.to?.lng) }
  if ([from.lat, from.lng, to.lat, to.lng].some(n => !Number.isFinite(n)) || Math.abs(from.lat) > 90 || Math.abs(to.lat) > 90 || Math.abs(from.lng) > 180 || Math.abs(to.lng) > 180) return err('Bad point')

  const key = `${from.lat.toFixed(4)},${from.lng.toFixed(4)}|${to.lat.toFixed(4)},${to.lng.toFixed(4)}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL) return ok({ km: hit.km })

  const apiKey = googleKey()
  if (!apiKey) return ok({ km: null })
  const wp = (p: { lat: number; lng: number }) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } })
  try {
    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'routes.distanceMeters' },
      body: JSON.stringify({ origin: wp(from), destination: wp(to), travelMode: 'DRIVE', routingPreference: 'TRAFFIC_UNAWARE' }),
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) throw new Error(`Google Routes API ${res.status}`)
    const j = await res.json() as { routes?: { distanceMeters?: number }[] }
    const m = j.routes?.[0]?.distanceMeters
    if (m == null) return ok({ km: null })
    const km = Math.round(m / 100) / 10
    cache.set(key, { at: Date.now(), km })
    return ok({ km })
  } catch (e) {
    reportError('Road distance for trip failed', e)
    return ok({ km: null })
  }
})
