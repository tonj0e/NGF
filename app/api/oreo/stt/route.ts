import { NextRequest } from 'next/server'
import { apiHandler, requireRole, ok, err } from '@/lib/api'
import { csrfProtection } from '@/lib/csrf'
import { rateLimitKey } from '@/lib/rate-limiter'
import { speechToText } from '@/lib/oreo/voice'
import { dailyCapUsd, oreoSpentToday } from '@/lib/oreo/agent'

// Listening: the browser sends a short recording (up to about 30 seconds); the answer is the words.
export const maxDuration = 60
export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ['Admin'])
  const csrf = csrfProtection(req, session.userId); if (csrf) return csrf
  if (!rateLimitKey(`oreo-stt:${session.userId}`, 30, 60_000).success) return err('Slow down a little.', 429)
  if ((await oreoSpentToday()) >= (await dailyCapUsd())) return err("Oreo's daily limit is reached.", 429)
  const lang = new URL(req.url).searchParams.get('lang') === 'ml-IN' ? 'ml-IN' : 'en-IN'
  const buf = Buffer.from(await req.arrayBuffer())
  if (buf.length < 800) return err('The recording was too short.')
  if (buf.length > 6_000_000) return err('The recording was too long. Keep it under 30 seconds.')
  const secs = Math.min(60, Math.max(1, Number(req.headers.get('x-audio-seconds')) || 6))
  try { return ok(await speechToText(buf, req.headers.get('content-type') || 'audio/webm', lang, secs, session.userId)) }
  catch (e) { return err(`Could not understand the audio (${e instanceof Error ? e.message.slice(0, 120) : 'error'}). Try again or type.`) }
})
