/* eslint-disable @typescript-eslint/no-explicit-any */
// Small browser helpers for calling our own API with the session token (and a fresh CSRF token on writes).
export type ApiResult<T = any> = { ok: boolean; status: number; data?: T; error?: string; retryAfterSec?: number }

async function parse(res: Response): Promise<ApiResult> {
  const json = await res.json().catch(() => ({}))
  return json?.success ? { ok: true, status: res.status, data: json.data } : { ok: false, status: res.status, error: json?.error || `Request failed (${res.status})`, retryAfterSec: typeof json?.retryAfterSec === 'number' ? json.retryAfterSec : undefined }
}

export async function apiGet<T = any>(token: string, url: string): Promise<ApiResult<T>> {
  try { return await parse(await fetch(url, { headers: { Authorization: `Bearer ${token}` } })) } catch { return { ok: false, status: 0, error: 'Network problem. Check the connection.' } }
}

export async function apiSend<T = any>(token: string, method: 'POST' | 'PATCH' | 'DELETE', url: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const csrf = await fetch('/api/csrf', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).catch(() => null)
    return await parse(await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf?.csrfToken || csrf?.data?.csrfToken || '' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }))
  } catch { return { ok: false, status: 0, error: 'Network problem. Check the connection.' } }
}
