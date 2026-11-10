import { NextRequest } from 'next/server'
import { apiHandler, requireRole, err } from '@/lib/api'
import { csrfProtection } from '@/lib/csrf'
import { rateLimitKey } from '@/lib/rate-limiter'
import { runOreo, OreoEvent } from '@/lib/oreo/agent'
import { Tier } from '@/lib/oreo/models'

// Oreo's chat. The answer comes as a stream of small JSON lines (progress, confirm cards, final text) so the screen can show what Oreo is doing.
export const maxDuration = 120
export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ['Admin'])
  const csrf = csrfProtection(req, session.userId); if (csrf) return csrf
  const rl = rateLimitKey(`oreo:${session.userId}`, 20, 60_000)
  if (!rl.success) return err(`Slow down: wait ${rl.retryAfterSec} seconds.`, 429)
  const body = await req.json().catch(() => ({}))
  const text = String(body.message || '').trim()
  if (!text) return err('Write or say something for Oreo')
  const tier: 'auto' | Tier = ['haiku', 'sonnet', 'opus'].includes(body.model) ? body.model : 'auto'

  const enc = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: OreoEvent) => { try { controller.enqueue(enc.encode(JSON.stringify(e) + '\n')) } catch { /* the screen was closed */ } }
      try { await runOreo({ req, userId: session.userId, userName: session.name, threadId: body.threadId ? String(body.threadId) : undefined, text, tier, voice: !!body.voice }, emit) }
      catch (e) { emit({ type: 'error', message: e instanceof Error ? e.message.slice(0, 200) : 'Something went wrong' }) }
      controller.close()
    },
  })
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } }) as never
})
