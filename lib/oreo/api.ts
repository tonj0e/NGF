/* eslint-disable @typescript-eslint/no-explicit-any -- tool inputs and API answers are checked by each tool */
import { NextRequest } from 'next/server'
import { getSession } from '@/lib/api'
import { generateCsrfToken } from '@/lib/csrf'

// Oreo's actions run through the CRM's own routes as the signed-in owner, so every rule, branch check and audit entry still applies.
// The route handlers are called inside this same server (no network call), because a hosted server often cannot reach its own public address.
export type ApiResult = { ok: boolean; status: number; data?: any; error?: string }

type Handler = (req: NextRequest, ctx?: any) => Promise<Response>
async function resolveHandler(method: string, path: string): Promise<{ fn: Handler; ctx?: any } | null> {
  const clean = path.split('?')[0]
  let m: RegExpMatchArray | null
  if ((m = clean.match(/^\/api\/leads\/([^/]+)$/))) {
    const mod: any = await import('@/app/api/leads/[leadId]/route')
    return mod[method] ? { fn: mod[method], ctx: { params: Promise.resolve({ leadId: decodeURIComponent(m[1]) }) } } : null
  }
  if (clean === '/api/routes') { const mod: any = await import('@/app/api/routes/route'); return mod[method] ? { fn: mod[method] } : null }
  if (clean === '/api/disbursements/bank') { const mod: any = await import('@/app/api/disbursements/bank/route'); return mod[method] ? { fn: mod[method] } : null }
  return null
}

export async function callApi(req: NextRequest, method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<ApiResult> {
  const auth = req.headers.get('authorization') || ''
  try {
    const target = await resolveHandler(method, path)
    if (!target) return { ok: false, status: 0, error: `Oreo has no route for ${method} ${path}` }
    const headers: Record<string, string> = { Authorization: auth, 'Content-Type': 'application/json' }
    if (method !== 'GET') headers['X-CSRF-Token'] = await generateCsrfToken((await getSession(req)).userId)
    const inner = new NextRequest(new URL(path, req.nextUrl.origin), { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    const res = await target.fn(inner, target.ctx)
    const j = await res.json().catch(() => null)
    if (!res.ok || j?.success === false) return { ok: false, status: res.status, error: String(j?.error || `Request failed (${res.status})`) }
    return { ok: true, status: res.status, data: j?.data ?? j }
  } catch (e) { return { ok: false, status: 0, error: e instanceof Error ? e.message : 'Network problem' } }
}
