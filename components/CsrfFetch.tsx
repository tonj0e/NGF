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

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
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
