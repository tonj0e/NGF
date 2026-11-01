import { rateLimitKey } from './rate-limiter'

// Per person, not per address: one account cannot fill the storage by sending files in a loop.
// Counted per request that carries files. 40 a minute is far above real use (a lead has at most 6 photos in one request).
export function checkUploadRate(userId: string, make: (message: string) => Error = m => new Error(m)): void {
  const rl = rateLimitKey(`upload:${userId}`, 40, 60_000)
  if (!rl.success) throw make(`Too many uploads. Wait ${rl.retryAfterSec} seconds and try again.`)
}
