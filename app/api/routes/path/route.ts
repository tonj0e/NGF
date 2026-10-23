import { NextRequest } from 'next/server'
import { apiHandler, getSession, ok, err } from '@/lib/api'
import { googleKey } from '@/lib/routeMath'

// Road shape for the route map: one Google Routes API call for the whole day, returns one encoded line per leg
// (point i -> point i+1). Display only; nothing is saved. Any logged-in user may ask, for their own screen.
const cache = new Map<string, { at: number; legs: (string | null)[] }>()
const TTL = 6 * 3600_000

export const POST = apiHandler(async (req: NextRequest) => {
  await getSession(req)
  const body = await req.json().catch(() => ({}))
  const pts = (Array.isArray(body.points) ? body.points : []) as { lat: unknown; lng: unknown }[]
  if (pts.length < 2 || pts.length > 26) return err('Need between 2 and 26 points')
  const points = pts.map(p => ({ lat: Number(p.lat), lng: Number(p.lng) }))
  if (points.some(p => !Number.isFinite(p.lat) || !Number.isFinite(p.lng) || Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180)) return err('Bad point')

  const key = points.map(p => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join('|')
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL) return ok({ legs: hit.legs })

  const apiKey = googleKey()
  if (!apiKey) return ok({ legs: points.slice(1).map(() => null) })
  const wp = (p: { lat: number; lng: number }) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } })
  try {
    let res: Response | null = null
    for (const travelMode of ['TWO_WHEELER', 'DRIVE']) {
      res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'routes.legs.polyline.encodedPolyline' },
        body: JSON.stringify({
          origin: wp(points[0]), destination: wp(points[points.length - 1]), intermediates: points.slice(1, -1).map(wp),
          travelMode, routingPreference: 'TRAFFIC_UNAWARE', polylineEncoding: 'ENCODED_POLYLINE',
        }),
        signal: AbortSignal.timeout(15000),
      })
      if (res.ok) break
    }
    if (!res || !res.ok) throw new Error(`Google Routes API ${res?.status}`)
    const j = await res.json() as { routes?: { legs?: { polyline?: { encodedPolyline?: string } }[] }[] }
    const legs = (j.routes?.[0]?.legs || []).map(l => l.polyline?.encodedPolyline || null)
    if (legs.length !== points.length - 1) throw new Error('Unexpected leg count')
    cache.set(key, { at: Date.now(), legs })
    return ok({ legs })
  } catch (e) {
    console.error('Road path failed, map will use straight lines:', e instanceof Error ? e.message : e)
    return ok({ legs: points.slice(1).map(() => null) })
  }
})
