import { randomUUID, timingSafeEqual } from 'crypto'
import { getSupabase } from './supabase-db'
import { generateOtp, hashOtp } from './otp'

// OTPs sent to a CUSTOMER's phone (new-lead verification at the house, renewal approval at the branch).
// Only a keyed hash of the code is stored; the code itself is never persisted, logged or returned.
// Same safety model as the password-reset OTP in lib/otp.ts: 10 minute expiry, 5 tries, resend cooldown, hourly cap.

export type OtpPurpose = 'lead_verification' | 'renewal_approval'
export const CUSTOMER_OTP_TTL_MS = 10 * 60 * 1000
export const CUSTOMER_OTP_MAX_ATTEMPTS = 5
export const CUSTOMER_OTP_COOLDOWN_MS = 60 * 1000       // advertised to the UI
const COOLDOWN_ENFORCED_MS = 50 * 1000                  // enforced (10 s slack for latency)
export const CUSTOMER_OTP_MAX_PER_HOUR = 5
const TABLE = 'customer_otps'

export type IssueResult =
  | { issued: true; id: string; otp: string }
  | { issued: false; reason: 'cooldown' | 'hourly_cap' | 'store' }

/** Creates a new OTP for this lead + purpose and retires older active ones. */
export async function issueCustomerOtp(opts: { purpose: OtpPurpose; subjectId: string; phone: string; requestedBy: string; ip: string }): Promise<IssueResult> {
  const sb = getSupabase(); const now = Date.now()
  const { data: recent, error: recentErr } = await sb.from(TABLE).select('created_at')
    .eq('subject_id', opts.subjectId).eq('purpose', opts.purpose)
    .gte('created_at', new Date(now - 3600_000).toISOString()).order('created_at', { ascending: false })
  if (recentErr) return { issued: false, reason: 'store' }
  if ((recent?.length ?? 0) >= CUSTOMER_OTP_MAX_PER_HOUR) return { issued: false, reason: 'hourly_cap' }
  if (recent?.[0] && now - Date.parse(recent[0].created_at) < COOLDOWN_ENFORCED_MS) return { issued: false, reason: 'cooldown' }

  await sb.from(TABLE).update({ invalidated_at: new Date(now).toISOString() })
    .eq('subject_id', opts.subjectId).eq('purpose', opts.purpose).is('invalidated_at', null).is('verified_at', null)

  const id = randomUUID(); const otp = generateOtp()
  const { error } = await sb.from(TABLE).insert({
    id, purpose: opts.purpose, subject_id: opts.subjectId, phone: opts.phone,
    otp_hash: hashOtp(otp, id), expires_at: new Date(now + CUSTOMER_OTP_TTL_MS).toISOString(),
    max_attempts: CUSTOMER_OTP_MAX_ATTEMPTS, requested_by: opts.requestedBy, request_ip: opts.ip.slice(0, 64),
  })
  if (error) return { issued: false, reason: 'store' }
  return { issued: true, id, otp }
}

export async function recordSendResult(id: string, status: 'sent' | 'test_email' | 'failed' | 'not_configured', provider?: string, ref?: string) {
  await getSupabase().from(TABLE).update({ send_status: status, provider: provider ?? null, provider_ref: ref ?? null }).eq('id', id)
}

function matches(otp: string, id: string, stored: string): boolean {
  const a = Buffer.from(hashOtp(otp, id)), b = Buffer.from(stored)
  return a.length === b.length && timingSafeEqual(a, b)
}

export type VerifyResult = { ok: true; otpId: string; phone: string } | { ok: false; reason: 'none' | 'invalid' | 'locked' }

/** Checks a code against the newest active OTP for this lead + purpose. Every guess burns an attempt (optimistic lock). */
export async function verifyCustomerOtp(opts: { purpose: OtpPurpose; subjectId: string; code: string }): Promise<VerifyResult> {
  const sb = getSupabase(); const nowIso = new Date().toISOString()
  const code = String(opts.code || '').replace(/\D/g, '')
  if (code.length !== 6) return { ok: false, reason: 'invalid' }

  const { data: row } = await sb.from(TABLE).select('id, otp_hash, phone, expires_at, attempts, max_attempts')
    .eq('subject_id', opts.subjectId).eq('purpose', opts.purpose).is('invalidated_at', null).is('verified_at', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!row || Date.parse(row.expires_at) <= Date.now()) return { ok: false, reason: 'none' }
  if (row.attempts >= row.max_attempts) {
    await sb.from(TABLE).update({ invalidated_at: nowIso }).eq('id', row.id).is('invalidated_at', null)
    return { ok: false, reason: 'locked' }
  }
  const { data: bumped } = await sb.from(TABLE).update({ attempts: row.attempts + 1 })
    .eq('id', row.id).eq('attempts', row.attempts).is('invalidated_at', null).is('verified_at', null).select('id')
  if (!bumped || bumped.length === 0) return { ok: false, reason: 'invalid' }

  if (!matches(code, row.id, row.otp_hash)) {
    if (row.attempts + 1 >= row.max_attempts) {
      await sb.from(TABLE).update({ invalidated_at: nowIso }).eq('id', row.id).is('invalidated_at', null)
      return { ok: false, reason: 'locked' }
    }
    return { ok: false, reason: 'invalid' }
  }
  const { data: done } = await sb.from(TABLE).update({ verified_at: nowIso })
    .eq('id', row.id).is('verified_at', null).is('invalidated_at', null).select('id')
  if (!done || done.length === 0) return { ok: false, reason: 'invalid' }
  return { ok: true, otpId: row.id, phone: row.phone }
}

/** What the UI may show about the latest OTP: when it was sent, how it went, whether it is verified. Never the code. */
export async function otpStatus(purpose: OtpPurpose, subjectId: string) {
  const { data } = await getSupabase().from(TABLE).select('created_at, expires_at, verified_at, send_status, phone, attempts, max_attempts, invalidated_at')
    .eq('subject_id', subjectId).eq('purpose', purpose).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!data) return null
  return {
    sentAt: data.created_at as string, expiresAt: data.expires_at as string, verifiedAt: (data.verified_at as string) || null,
    sendStatus: (data.send_status as string) || '', active: !data.invalidated_at && !data.verified_at && Date.parse(data.expires_at) > Date.now(),
    attemptsLeft: Math.max(0, (data.max_attempts as number) - (data.attempts as number)),
  }
}
