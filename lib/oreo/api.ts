/* eslint-disable @typescript-eslint/no-explicit-any -- tool inputs and API answers are checked by each tool */
import { NextRequest } from 'next/server'

// Oreo's actions run through the CRM's own API as the signed-in owner, so every rule, branch check and audit entry still applies.
export type ApiResult = { ok: boolean; status: number; data?: any; error?: string }
export async function callApi(req: NextRequest, method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<ApiResult> {
  const auth = req.headers.get('authorization') || ''
  // The server calls itself: try its own local address first (the public address can be a tunnel or proxy it cannot reach)
  const bases = [process.env.INTERNAL_BASE_URL, `http://127.0.0.1:${process.env.PORT || 3000}`, req.nextUrl.origin].filter((x): x is string => !!x)
  let base = bases[0], lastErr = 'Network problem'
  try {
    for (const b of bases) {
      try { const r = await fetch(`${b}/api/ping`, { signal: AbortSignal.timeout(4000) }); if (r.ok) { base = b; lastErr = ''; break } } catch (e) { lastErr = e instanceof Error ? e.message : lastErr }
    }
    if (lastErr) return { ok: false, status: 0, error: `Could not reach the CRM's own API (${lastErr})` }
    let csrf = ''
    if (method !== 'GET') {
      const c = await fetch(`${base}/api/csrf`, { headers: { Authorization: auth } }).then(r => r.json()).catch(() => null)
      csrf = c?.csrfToken || c?.data?.csrfToken || ''
    }
    const res = await fetch(`${base}${path}`, {
      method, headers: { Authorization: auth, 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60_000),
    })
    const j = await res.json().catch(() => null)
    if (!res.ok || j?.success === false) return { ok: false, status: res.status, error: String(j?.error || `Request failed (${res.status})`) }
    return { ok: true, status: res.status, data: j?.data ?? j }
  } catch (e) { return { ok: false, status: 0, error: e instanceof Error ? e.message : 'Network problem' } }
}
