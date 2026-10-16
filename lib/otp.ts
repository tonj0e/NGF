import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'crypto'
import { getSupabase } from './supabase-db'

// Email OTP storage and verification for password recovery.
// Only a keyed hash of the OTP is stored; the OTP itself is never persisted or logged.

export const OTP_TTL_MS = 10 * 60 * 1000
export const OTP_MAX_ATTEMPTS = 5
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000          // advertised to the UI
const OTP_COOLDOWN_ENFORCED_MS = 50 * 1000                 // enforced server-side (10 s slack for latency/clock skew)
export const OTP_MAX_PER_HOUR = 5

const TABLE = 'password_reset_otps'

function secret(): string {
  const s = process.env.JWT_SECRET
  if (!s || s.length < 32) throw new Error('JWT_SECRET must be set and at least 32 characters')
  return s
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

// Cryptographically secure six-digit code (uniform, zero-padded)
export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0')
}

// HMAC keyed with the server secret and bound to the row id, so identical codes hash differently
export function hashOtp(otp: string, id: string): string {
  return createHmac('sha256', secret()).update(`otp:${id}:${otp}`).digest('hex')
}

function otpMatches(otp: string, id: string, storedHash: string): boolean {
  const a = Buffer.from(hashOtp(otp, id))
  const b = Buffer.from(storedHash)
  return a.length === b.length && timingSafeEqual(a, b)
}

export type IssueResult =
  | { issued: true; id: string; otp: string }
  | { issued: false; reason: 'cooldown' | 'hourly_cap' }

// Creates a new OTP for the user, invalidating any older active ones.
export async function issueOtp(userId: string, requestIp: string): Promise<IssueResult> {
  const sb = getSupabase()
  const now = Date.now()

  const { data: recent, error: recentErr } = await sb
    .from(TABLE).select('created_at')
    .eq('user_id', userId)
    .gte('created_at', new Date(now - 3600_000).toISOString())
    .order('created_at', { ascending: false })
  if (recentErr) throw new Error('OTP store unavailable')

  if ((recent?.length ?? 0) >= OTP_MAX_PER_HOUR) return { issued: false, reason: 'hourly_cap' }
  if (recent?.[0] && now - Date.parse(recent[0].created_at) < OTP_COOLDOWN_ENFORCED_MS) {
    return { issued: false, reason: 'cooldown' }
  }

  const nowIso = new Date(now).toISOString()
  await sb.from(TABLE).update({ invalidated_at: nowIso })
    .eq('user_id', userId).is('invalidated_at', null).is('consumed_at', null)

  const id = randomUUID()
  const otp = generateOtp()
  const { error } = await sb.from(TABLE).insert({
    id,
    user_id: userId,
    otp_hash: hashOtp(otp, id),
    expires_at: new Date(now + OTP_TTL_MS).toISOString(),
    max_attempts: OTP_MAX_ATTEMPTS,
    request_ip: requestIp.slice(0, 64),
  })
  if (error) throw new Error('OTP store unavailable')
  return { issued: true, id, otp }
}

export async function recordEmailResult(id: string, status: 'sent' | 'failed' | 'not_configured', providerId?: string) {
  await getSupabase().from(TABLE)
    .update({ email_status: status, email_provider_id: providerId ?? null })
    .eq('id', id)
}

export type VerifyResult = { ok: true; otpId: string } | { ok: false; reason: 'invalid' | 'locked' }

// Verifies a code against the user's newest active OTP. Every guess consumes an attempt
// (incremented with an optimistic lock so parallel requests cannot bypass the limit).
export async function verifyOtp(userId: string, otp: string): Promise<VerifyResult> {
  const sb = getSupabase()
  const nowIso = new Date().toISOString()

  const { data: row } = await sb.from(TABLE).select('id, otp_hash, expires_at, attempts, max_attempts')
    .eq('user_id', userId)
    .is('invalidated_at', null).is('consumed_at', null).is('verified_at', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()

  if (!row || Date.parse(row.expires_at) <= Date.now()) return { ok: false, reason: 'invalid' }

  if (row.attempts >= row.max_attempts) {
    await sb.from(TABLE).update({ invalidated_at: nowIso }).eq('id', row.id).is('invalidated_at', null)
    return { ok: false, reason: 'locked' }
  }

  const { data: bumped } = await sb.from(TABLE)
    .update({ attempts: row.attempts + 1 })
    .eq('id', row.id).eq('attempts', row.attempts)
    .is('invalidated_at', null).is('consumed_at', null).is('verified_at', null)
    .select('id')
  if (!bumped || bumped.length === 0) return { ok: false, reason: 'invalid' }

  if (!otpMatches(otp, row.id, row.otp_hash)) {
    if (row.attempts + 1 >= row.max_attempts) {
      await sb.from(TABLE).update({ invalidated_at: nowIso }).eq('id', row.id).is('invalidated_at', null)
      return { ok: false, reason: 'locked' }
    }
    return { ok: false, reason: 'invalid' }
  }

  const { data: verified } = await sb.from(TABLE).update({ verified_at: nowIso })
    .eq('id', row.id).is('verified_at', null).is('invalidated_at', null).is('consumed_at', null)
    .select('id')
  if (!verified || verified.length === 0) return { ok: false, reason: 'invalid' }
  return { ok: true, otpId: row.id }
}

// Atomically marks a verified OTP as used. Returns false if it was already used/invalidated/expired.
export async function consumeVerifiedOtp(otpId: string, userId: string): Promise<boolean> {
  const sb = getSupabase()
  const { data } = await sb.from(TABLE).update({ consumed_at: new Date().toISOString() })
    .eq('id', otpId).eq('user_id', userId)
    .not('verified_at', 'is', null).is('consumed_at', null).is('invalidated_at', null)
    .gt('verified_at', new Date(Date.now() - OTP_TTL_MS).toISOString())
    .select('id')
  return !!data && data.length > 0
}

// After a successful reset, retire every other outstanding OTP for the user
export async function invalidateUserOtps(userId: string) {
  await getSupabase().from(TABLE).update({ invalidated_at: new Date().toISOString() })
    .eq('user_id', userId).is('invalidated_at', null).is('consumed_at', null)
}
