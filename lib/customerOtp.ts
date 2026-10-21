import { randomUUID, timingSafeEqual } from 'crypto'
import { getSupabase } from './supabase-db'
import { generateOtp, hashOtp } from './otp'

// OTPs sent to a CUSTOMER's phone (new-lead verification at the house, renewal approval at the branch).
// Only a keyed hash of the code is stored; the code itself is never persisted, logged or returned.
// Same safety model as the password-reset OTP in lib/otp.ts: 10 minute expiry, 5 tries, resend cooldown, hourly cap.

export type OtpPurpose = 'lead_verification' | 'renewal_approval'
export const CUSTOMER_OTP_TTL_MS = 10 * 60 * 1000
export const CUSTOMER_OTP_MAX_ATTEMPTS = 5
export const CUSTOMER_OTP_COOLDOWN_MS = 60 * 1000       // first resend wait, advertised to the UI
const TABLE = 'customer_otps'

// ---- Sending limits (stop runaway SMS cost). Layered: lead, phone, account, IP, whole system. ----
// Counted from customer_otps itself, so the limits survive restarts and apply to every server instance.
export const OTP_LIMITS = {
  resendGapsSec: [60, 120, 300],        // wait before the 2nd, 3rd, 4th code for the SAME lead within an hour (a 5th is refused)
  perLeadPerHour: 4,
  perPhonePerHour: 6, perPhonePerDay: 10, // the same mobile number, across every lead
  perUserPerHour: 20, perUserPerDay: 80, // the same staff / agent account
  perIpPerHour: 60,                      // the same network address (agents may share a mobile-carrier IP)
  get dailyCap(): number { const n = Number(process.env.OTP_DAILY_CAP); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 200 },  // whole system, per IST day
}

export type DenyReason = 'cooldown' | 'lead_cap' | 'phone_cap' | 'user_cap' | 'ip_cap' | 'daily_cap' | 'store'
export type IssueResult =
  | { issued: true; id: string; otp: string; usedToday: number; nextWaitSec: number }
  | { issued: false; reason: DenyReason; retryAfterSec: number }

const HOUR = 3600_000, DAY = 24 * HOUR
const IST_OFFSET = 5.5 * HOUR
/** Start of today in India, as a UTC ISO string (the daily budget resets at midnight IST) */
function istDayStart(now = Date.now()): string { return new Date(Math.floor((now + IST_OFFSET) / DAY) * DAY - IST_OFFSET).toISOString() }

/** How many of these timestamps fall in the window, and how long until the oldest one leaves it */
function windowCount(times: number[], now: number, windowMs: number) {
  const inside = times.filter(t => now - t < windowMs)
  const oldest = inside.length ? Math.min(...inside) : now
  return { count: inside.length, retryAfterSec: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)) }
}

const inflight = new Map<string, Promise<unknown>>()
/** One request at a time per lead inside this server, so two quick clicks cannot both pass the count check */
async function serialised<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = inflight.get(key) ?? Promise.resolve()
  const run = prev.catch(() => undefined).then(fn)
  const tail = run.catch(() => undefined)
  inflight.set(key, tail)
  try { return await run } finally { if (inflight.get(key) === tail) inflight.delete(key) }
}

/** Today's usage for the admin screen */
export async function otpUsageToday(): Promise<{ today: number; cap: number }> {
  const { count } = await getSupabase().from(TABLE).select('id', { count: 'exact', head: true }).gte('created_at', istDayStart())
  return { today: count ?? 0, cap: OTP_LIMITS.dailyCap }
}

/** Creates a new OTP for this lead + purpose and retires older active ones, after every sending limit has passed. */
export function issueCustomerOtp(opts: { purpose: OtpPurpose; subjectId: string; phone: string; requestedBy: string; ip: string }): Promise<IssueResult> {
  return serialised(`${opts.purpose}:${opts.subjectId}`, () => issueNow(opts))
}

async function issueNow(opts: { purpose: OtpPurpose; subjectId: string; phone: string; requestedBy: string; ip: string }): Promise<IssueResult> {
  const sb = getSupabase(); const now = Date.now(); const L = OTP_LIMITS
  const since = new Date(now - DAY).toISOString()
  const times = (rows: { created_at: string }[] | null) => (rows || []).map(r => Date.parse(r.created_at))
  const [lead, phone, user, ip, today] = await Promise.all([
    sb.from(TABLE).select('created_at').eq('subject_id', opts.subjectId).eq('purpose', opts.purpose).gte('created_at', new Date(now - HOUR).toISOString()),
    sb.from(TABLE).select('created_at').eq('phone', opts.phone).gte('created_at', since),
    sb.from(TABLE).select('created_at').eq('requested_by', opts.requestedBy).gte('created_at', since),
    sb.from(TABLE).select('created_at').eq('request_ip', opts.ip.slice(0, 64)).gte('created_at', new Date(now - HOUR).toISOString()),
    sb.from(TABLE).select('id', { count: 'exact', head: true }).gte('created_at', istDayStart(now)),
  ])
  if (lead.error || phone.error || user.error || ip.error || today.error) return { issued: false, reason: 'store', retryAfterSec: 30 }

  // 1. whole system, per day: the money cap
  if ((today.count ?? 0) >= L.dailyCap) return { issued: false, reason: 'daily_cap', retryAfterSec: Math.ceil((new Date(istDayStart(now)).getTime() + DAY - now) / 1000) }
  // 2. same lead: escalating wait, then an hourly cap
  const leadTimes = times(lead.data)
  if (leadTimes.length >= L.perLeadPerHour) return { issued: false, reason: 'lead_cap', retryAfterSec: windowCount(leadTimes, now, HOUR).retryAfterSec }
  if (leadTimes.length > 0) {
    const gap = L.resendGapsSec[Math.min(leadTimes.length - 1, L.resendGapsSec.length - 1)] * 1000
    const wait = Math.max(...leadTimes) + gap - now
    if (wait > 1000) return { issued: false, reason: 'cooldown', retryAfterSec: Math.ceil(wait / 1000) }
  }
  // 3. same phone (any lead), 4. same account, 5. same IP
  const pt = times(phone.data), ut = times(user.data), it = times(ip.data)
  const checks: Array<[{ count: number; retryAfterSec: number }, number, DenyReason]> = [
    [windowCount(pt, now, HOUR), L.perPhonePerHour, 'phone_cap'], [windowCount(pt, now, DAY), L.perPhonePerDay, 'phone_cap'],
    [windowCount(ut, now, HOUR), L.perUserPerHour, 'user_cap'], [windowCount(ut, now, DAY), L.perUserPerDay, 'user_cap'],
    [windowCount(it, now, HOUR), L.perIpPerHour, 'ip_cap'],
  ]
  for (const [w, max, reason] of checks) if (w.count >= max) return { issued: false, reason, retryAfterSec: w.retryAfterSec }

  await sb.from(TABLE).update({ invalidated_at: new Date(now).toISOString() })
    .eq('subject_id', opts.subjectId).eq('purpose', opts.purpose).is('invalidated_at', null).is('verified_at', null)

  const id = randomUUID(); const otp = generateOtp()
  const { error } = await sb.from(TABLE).insert({
    id, purpose: opts.purpose, subject_id: opts.subjectId, phone: opts.phone,
    otp_hash: hashOtp(otp, id), expires_at: new Date(now + CUSTOMER_OTP_TTL_MS).toISOString(),
    max_attempts: CUSTOMER_OTP_MAX_ATTEMPTS, requested_by: opts.requestedBy, request_ip: opts.ip.slice(0, 64),
  })
  if (error) return { issued: false, reason: 'store', retryAfterSec: 30 }
  const nextWaitSec = L.resendGapsSec[Math.min(leadTimes.length, L.resendGapsSec.length - 1)]
  return { issued: true, id, otp, usedToday: (today.count ?? 0) + 1, nextWaitSec }
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
