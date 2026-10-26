// Road shapes for the route maps, remembered in this browser for 6 hours so the same stop order is never asked from Google twice.
type Pt = { lat: number; lng: number }
const TTL = 6 * 3600_000
const keyOf = (pts: Pt[]) => 'ngf_roads:' + pts.map(p => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join('|')

export async function fetchRoads(token: string, pts: Pt[]): Promise<(string | null)[] | null> {
  const key = keyOf(pts)
  try {
    const hit = JSON.parse(localStorage.getItem(key) || 'null')
    if (hit && Date.now() - hit.at < TTL) return hit.legs
  } catch { /* storage unavailable: just ask */ }
  const res = await fetch('/api/routes/path', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ points: pts }) })
  const j = await res.json().catch(() => null)
  if (!j?.success) return null
  try {
    // keep the store small: drop old road entries first
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k?.startsWith('ngf_roads:')) { try { if (Date.now() - JSON.parse(localStorage.getItem(k) || '{}').at > TTL) localStorage.removeItem(k) } catch { localStorage.removeItem(k) } }
    }
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), legs: j.data.legs }))
  } catch { /* full or blocked: fine */ }
  return j.data.legs
}
