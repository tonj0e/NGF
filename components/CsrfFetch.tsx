'use client'
import { useEffect } from 'react'

// Every screen that saves something calls our own API with fetch(). The server wants a fresh security (CSRF)
// token on each save; some screens forgot to send one. This adds it for them, once, for all same-site saves.
export default function CsrfFetch() {
  useEffect(() => {
    const w = window as unknown as { __csrfFetch?: boolean }
    if (w.__csrfFetch) return
    w.__csrfFetch = true
    const original = window.fetch.bind(window)
    const cache = new Map<string, { token: string; at: number }>()

    async function tokenFor(auth: string): Promise<string> {
      const hit = cache.get(auth)
      if (hit && Date.now() - hit.at < 30 * 60_000) return hit.token
      try {
        const j = await original('/api/csrf', { headers: { Authorization: auth } }).then(r => r.json())
        const token = j?.csrfToken || j?.data?.csrfToken || ''
        if (token) cache.set(auth, { token, at: Date.now() })
        return token
      } catch { return '' }
    }

    // Settings-type lookups that every page re-asks for: reuse an answer up to 30 seconds old, and share one request when
    // several screens ask at the same moment. Any save clears them, so a change shows at once.
    const SHARED = ['/api/branches', '/api/review-options', '/api/loan-products', '/api/settings']
    const shared = new Map<string, { at: number; p: Promise<{ body: string; status: number; type: string }> }>()

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      try {
        const req0 = input instanceof Request ? input : null
        const m0 = (init?.method || req0?.method || 'GET').toUpperCase()
        const u0 = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : req0!.url, window.location.origin)
        if (u0.origin === window.location.origin && u0.pathname.startsWith('/api/')) {
          if (m0 !== 'GET' && m0 !== 'HEAD' && m0 !== 'OPTIONS') shared.clear()
          else if (m0 === 'GET' && SHARED.includes(u0.pathname) && !init?.signal && !req0) {
            const auth = new Headers(init?.headers || undefined).get('Authorization') || ''
            const key = `${auth}|${u0.pathname}${u0.search}`
            const hit = shared.get(key)
            if (hit && Date.now() - hit.at < 30_000) {
              const r = await hit.p
              return new Response(r.body, { status: r.status, headers: { 'Content-Type': r.type } })
            }
            const p = original(input, init).then(async res => ({ body: await res.clone().text(), status: res.status, type: res.headers.get('Content-Type') || 'application/json' }))
            shared.set(key, { at: Date.now(), p })
            p.then(r => { if (r.status >= 400) shared.delete(key) }, () => shared.delete(key))
            const r = await p
            return new Response(r.body, { status: r.status, headers: { 'Content-Type': r.type } })
          }
        }
      } catch { /* fall through to the normal request */ }
      try {
        const req = input instanceof Request ? input : null
        const method = (init?.method || req?.method || 'GET').toUpperCase()
        const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : req!.url
        const url = new URL(rawUrl, window.location.origin)
        if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS' && url.origin === window.location.origin
            && url.pathname.startsWith('/api/') && url.pathname !== '/api/csrf') {
          const headers = new Headers(init?.headers || req?.headers || undefined)
          const auth = headers.get('Authorization')
          if (auth && !headers.get('X-CSRF-Token')) {
            const token = await tokenFor(auth)
            if (token) { headers.set('X-CSRF-Token', token); return original(input, { ...init, headers }) }
          }
        }
      } catch { /* fall through to the normal request */ }
      return original(input, init)
    }
  }, [])
  return null
}
