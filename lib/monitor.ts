// One place to report problems that are caught and carried on (best-effort steps that fail quietly), and to switch error tracking on.
// The Sentry key can be saved in Dev > Error tracking (encrypted) or set as SENTRY_DSN on the server; either is picked up without a rebuild.
import * as Sentry from '@sentry/nextjs'
import { getConfig } from './integrations'
import { scrubEvent, scrubLog } from './sentryScrub'

export function newRequestId(): string { return crypto.randomUUID().slice(0, 8) }

let checkedAt = 0
/** Starts Sentry on the server once a key exists (checked at most every 30 s). Never throws. */
export async function ensureSentry(): Promise<boolean> {
  try {
    if (Sentry.getClient()?.getOptions().dsn) return true
    if (Date.now() - checkedAt < 30_000) return false
    checkedAt = Date.now()
    const dsn = await getConfig('SENTRY_DSN')
    if (!dsn) return false
    Sentry.init({ dsn, environment: process.env.NODE_ENV, tracesSampleRate: 0, beforeSend: scrubEvent, beforeSendLog: scrubLog })
    return true
  } catch { return false }
}

export function reportError(where: string, e: unknown, tags: Record<string, string> = {}): void {
  const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : (e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : 'unknown error')
  console.error(`[${where}] ${msg}`)
  void ensureSentry().then(() => { try { Sentry.captureException(e instanceof Error ? e : new Error(`${where}: ${msg}`), { level: 'warning', tags: { where, ...tags } }) } catch { /* reporting must never break the request */ } })
}
