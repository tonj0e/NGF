import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, requireRole, err } from '@/lib/api'
import { csrfProtection } from '@/lib/csrf'
import { rateLimitKey } from '@/lib/rate-limiter'
import { textToSpeech } from '@/lib/oreo/voice'
import { dailyCapUsd, oreoSpentToday } from '@/lib/oreo/agent'

// Speaking: text in, natural voice (mp3) out. If it fails the screen uses the browser's own voice.
export const maxDuration = 60
export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ['Admin'])
  const csrf = csrfProtection(req, session.userId); if (csrf) return csrf
  if (!rateLimitKey(`oreo-tts:${session.userId}`, 40, 60_000).success) return err('Slow down a little.', 429)
  if ((await oreoSpentToday()) >= (await dailyCapUsd())) return err("Oreo's daily limit is reached.", 429)
  const b = await req.json().catch(() => ({}))
  const text = String(b.text || '').trim().slice(0, 500); if (!text) return err('Nothing to say')
  try {
    const r = await textToSpeech(text, b.lang === 'ml-IN' ? 'ml-IN' : 'en-IN', session.userId)
    return new NextResponse(new Uint8Array(r.audio), { status: 200, headers: { 'Content-Type': r.mime, 'Cache-Control': 'no-store' } })
  } catch (e) { return err(`Could not speak (${e instanceof Error ? e.message.slice(0, 120) : 'error'})`, 502) }
})
