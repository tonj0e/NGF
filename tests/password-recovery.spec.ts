import { test, expect } from '@playwright/test'
import bcrypt from 'bcrypt'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { validatePasswordPolicy } from '../lib/passwordPolicy'
import { devOnlyGuard } from '../lib/devOnly'
import { GET as emailConfigGET } from '../app/api/auth/email-config/route'

// Password recovery (email OTP) — API/database regression tests.
// Uses ONLY throwaway users created and deleted here; never touches real accounts.
// Never prints passwords, OTPs, tokens or hashes. Live email delivery is covered separately
// (scripts/test-email-delivery.mjs) because it needs real Resend credentials.

const EXPECTED_PROJECT_REF = 'caphecxfvfwobglxxnvv'

function readEnvFile(file: string): Record<string, string> {
  const p = path.join(process.cwd(), file)
  if (!fs.existsSync(p)) return {}
  return Object.fromEntries(
    fs.readFileSync(p, 'utf8').split('\n').filter(l => /^[A-Za-z_]+=/.test(l))
      .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')])
  )
}
const env = readEnvFile('.env.local')
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || ''
const JWT_SECRET = env.JWT_SECRET || ''
const EMAIL_CONFIGURED = !!(env.RESEND_API_KEY && env.EMAIL_FROM)

const sb = (p: string, init: RequestInit = {}) =>
  fetch(`${SUPABASE_URL}/rest/v1/${p}`, {
    ...init,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers || {}) },
  })
const rows = async (p: string) => (await (await sb(p)).json()) as any[]

const tag = crypto.randomBytes(4).toString('hex')
const strong = () => `Aa1!${crypto.randomBytes(12).toString('base64url')}`
const mk = (k: string, role: string) => ({
  id: `USRE2E${k}${tag.toUpperCase()}`, username: `e2e_${k}_${tag}`, name: `E2E ${k.toUpperCase()} ${tag}`,
  email: `e2e-${k}-${tag}@example.invalid`, role, password: strong(),
})
const U = { a: mk('a', 'Staff'), b: mk('b', 'Staff'), adm: mk('adm', 'Admin'), t: mk('t', 'Staff'), c: mk('c', 'Staff'), r: mk('r', 'Staff') }
const created: string[] = []

let ipSeq = 0
const nextIp = () => `10.77.${(Number(`0x${tag.slice(0, 2)}`) % 250) + 1}.${(++ipSeq % 250) + 1}`
const H = (ip: string) => ({ 'x-forwarded-for': ip, 'Content-Type': 'application/json' })

const otpHash = (otp: string, id: string) =>
  crypto.createHmac('sha256', JWT_SECRET).update(`otp:${id}:${otp}`).digest('hex')
const latestOtp = async (userId: string) =>
  (await rows(`password_reset_otps?user_id=eq.${userId}&order=created_at.desc&limit=1`))[0]
const clearOtps = (userId: string) => sb(`password_reset_otps?user_id=eq.${userId}`, { method: 'DELETE' })
async function waitFor<T>(fn: () => Promise<T | undefined>, ms = 8000): Promise<T | undefined> {
  const end = Date.now() + ms
  while (Date.now() < end) { const v = await fn(); if (v) return v; await new Promise(r => setTimeout(r, 250)) }
}
// Test-only: make a fresh OTP row with a code we know (the app never exposes the real code)
async function plantOtp(userId: string, otp: string, over: Record<string, unknown> = {}) {
  await clearOtps(userId)
  const id = crypto.randomUUID()
  const res = await sb('password_reset_otps', {
    method: 'POST',
    body: JSON.stringify({
      id, user_id: userId, otp_hash: otpHash(otp, id),
      expires_at: new Date(Date.now() + 600_000).toISOString(), ...over,
    }),
  })
  expect(res.ok, 'plant otp').toBe(true)
  return id
}

test.describe.configure({ mode: 'serial', retries: 0 })
test.use({ trace: 'off', screenshot: 'off', video: 'off' })

test.describe('password recovery — pure logic', () => {
  test('password policy', () => {
    expect(validatePasswordPolicy('Short1!')).toMatch(/at least 10/)
    expect(validatePasswordPolicy('alllowercaseletters')).toMatch(/three of/)
    expect(validatePasswordPolicy('Admin@123')).toBeTruthy()
    expect(validatePasswordPolicy('Password123')).toMatch(/common/)
    expect(validatePasswordPolicy('Xvincent9!Zq', { username: 'vincent' })).toMatch(/username/)
    expect(validatePasswordPolicy('x'.repeat(129) + 'Aa1')).toMatch(/at most/)
    expect(validatePasswordPolicy('Tr0ub4dor&3xyz')).toBeNull()
  })

  test('dev-only guard returns 404 in production and is open otherwise', async () => {
    const prev = { NODE_ENV: process.env.NODE_ENV, VERCEL_ENV: process.env.VERCEL_ENV, APP_ENV: process.env.APP_ENV }
    const set = (k: string, v?: string) => { if (v === undefined) delete (process.env as any)[k]; else (process.env as any)[k] = v }
    try {
      set('VERCEL_ENV'); set('APP_ENV')
      set('NODE_ENV', 'development'); expect(devOnlyGuard()).toBeNull()
      set('NODE_ENV', 'production'); expect(devOnlyGuard()?.status).toBe(404)
      set('NODE_ENV', 'development'); set('VERCEL_ENV', 'production'); expect(devOnlyGuard()?.status).toBe(404)
      set('VERCEL_ENV'); set('APP_ENV', 'production'); expect(devOnlyGuard()?.status).toBe(404)
    } finally { for (const [k, v] of Object.entries(prev)) set(k, v) }
  })

  test('email-config endpoint is 404 in production and account-independent in development', async () => {
    const prev = process.env.NODE_ENV
    const set = (v?: string) => { if (v === undefined) delete (process.env as any).NODE_ENV; else (process.env as any).NODE_ENV = v }
    try {
      set('production'); expect((await emailConfigGET()).status).toBe(404)
      set('development')
      const res = await emailConfigGET()
      expect(res.status).toBe(200)
      expect(Object.keys((await res.json()).data)).toEqual(['emailConfigured'])   // nothing about accounts
    } finally { set(prev) }
  })
})

test.describe('password recovery — API flow (throwaway users)', () => {
  test.beforeAll(async () => {
    expect(SUPABASE_URL.includes(EXPECTED_PROJECT_REF), 'unexpected Supabase project — refusing to run').toBe(true)
    expect(!!SERVICE_KEY && JWT_SECRET.length >= 32, 'env missing').toBe(true)
    for (const u of Object.values(U)) {
      const res = await sb('users', {
        method: 'POST',
        body: JSON.stringify({
          user_id: u.id, username: u.username, name: u.name, role: u.role, status: 'Active',
          email: u.email, salt: '', password_hash: await bcrypt.hash(u.password, 12),
        }),
      })
      expect(res.ok, `create ${u.username} (${res.status})`).toBe(true)
      created.push(u.id)
    }
  })

  test.afterAll(async () => {
    // Remove only the throwaway users (OTP rows cascade; audit rows in logs are intentionally kept)
    for (const id of created) await sb(`users?user_id=eq.${id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
    for (const id of created) expect((await rows(`users?user_id=eq.${id}&select=user_id`)).length, 'cleanup').toBe(0)
  })

  const login = async (request: any, u: { username: string }, password: string) => {
    const r = await request.post('/api/auth/login', { data: { username: u.username, password }, headers: H(nextIp()) })
    const j = await r.json().catch(() => ({}))
    return { status: r.status() as number, token: j?.data?.token as string | undefined }
  }
  const sessionStatus = async (request: any, token?: string) =>
    (await request.get('/api/auth/session', { headers: { Authorization: `Bearer ${token}` } })).status() as number
  const forgot = (request: any, email: string, ip = nextIp()) =>
    request.post('/api/auth/forgot', { data: { email }, headers: H(ip) })
  const verify = (request: any, email: string, otp: string, ip = nextIp()) =>
    request.post('/api/auth/verify-otp', { data: { email, otp }, headers: H(ip) })

  test('request is generic for known and unknown emails; OTP is stored only as a hash', async ({ request }) => {
    const known = await forgot(request, U.a.email)
    const unknown = await forgot(request, `nobody-${tag}@example.invalid`)
    expect(known.status()).toBe(200)
    expect(unknown.status()).toBe(known.status())
    expect(await known.json()).toEqual(await unknown.json())

    const row = await latestOtp(U.a.id)
    expect(row, 'otp row created for registered account').toBeTruthy()
    expect(row.otp_hash).toMatch(/^[0-9a-f]{64}$/)           // HMAC hex, not a 6-digit code
    expect(row.attempts).toBe(0)
    expect(row.max_attempts).toBe(5)
    const ttl = Date.parse(row.expires_at) - Date.parse(row.created_at)
    expect(ttl).toBeGreaterThan(9 * 60_000); expect(ttl).toBeLessThanOrEqual(10 * 60_000 + 5000)

    // Email status is recorded honestly: never "sent" unless the provider accepted it
    const settled = await waitFor(async () => { const r = await latestOtp(U.a.id); return r.email_status !== 'pending' ? r : undefined })
    expect(settled, 'email status recorded').toBeTruthy()
    if (!EMAIL_CONFIGURED) expect(settled!.email_status).toBe('not_configured')
    else expect(['sent', 'failed']).toContain(settled!.email_status)
    if (settled!.email_status !== 'sent') expect(settled!.email_provider_id).toBeNull()
  })

  test('resend cooldown and hourly cap are enforced; a new code invalidates the old one', async ({ request }) => {
    await clearOtps(U.t.id)
    await forgot(request, U.t.email)
    await forgot(request, U.t.email)                           // within 60 s -> silently skipped
    expect((await rows(`password_reset_otps?user_id=eq.${U.t.id}`)).length).toBe(1)
    const first = await latestOtp(U.t.id)

    // age the first row past the cooldown, then request again: old invalidated, new issued
    await sb(`password_reset_otps?id=eq.${first.id}`, { method: 'PATCH', body: JSON.stringify({ created_at: new Date(Date.now() - 120_000).toISOString() }) })
    await forgot(request, U.t.email)
    const all = await rows(`password_reset_otps?user_id=eq.${U.t.id}&order=created_at.asc`)
    expect(all.length).toBe(2)
    expect(all[0].invalidated_at).not.toBeNull()
    expect(all[1].invalidated_at).toBeNull()

    // hourly cap: 5 codes within an hour -> no further code
    await clearOtps(U.t.id)
    for (let i = 0; i < 5; i++) {
      await sb('password_reset_otps', { method: 'POST', body: JSON.stringify({
        id: crypto.randomUUID(), user_id: U.t.id, otp_hash: 'x'.repeat(64),
        expires_at: new Date(Date.now() + 600_000).toISOString(),
        created_at: new Date(Date.now() - (10 + i) * 60_000).toISOString() }) })
    }
    await forgot(request, U.t.email)
    expect((await rows(`password_reset_otps?user_id=eq.${U.t.id}`)).length).toBe(5)
  })

  test('wrong OTP is rejected with a generic message; unknown email looks identical', async ({ request }) => {
    await plantOtp(U.a.id, '123456')
    const wrong = await verify(request, U.a.email, '654321')
    const unknown = await verify(request, `nobody-${tag}@example.invalid`, '654321')
    expect(wrong.status()).toBe(400)
    expect(unknown.status()).toBe(400)
    expect(await wrong.json()).toEqual(await unknown.json())
    expect((await latestOtp(U.a.id)).attempts).toBe(1)
    expect((await verify(request, U.a.email, '12345')).status()).toBe(400)   // malformed
  })

  test('OTP locks after 5 wrong attempts, even for the correct code', async ({ request }) => {
    const id = await plantOtp(U.a.id, '111111')
    for (let i = 0; i < 5; i++) expect((await verify(request, U.a.email, '000000')).status()).toBe(400)
    const row = (await rows(`password_reset_otps?id=eq.${id}`))[0]
    expect(row.attempts).toBe(5)
    expect(row.invalidated_at).not.toBeNull()
    expect((await verify(request, U.a.email, '111111')).status()).toBe(400)
  })

  test('parallel guesses cannot exceed the attempt limit', async ({ request }) => {
    const id = await plantOtp(U.a.id, '222222')
    const results = await Promise.all(Array.from({ length: 12 }, () => verify(request, U.a.email, '000001')))
    expect(results.every(r => r.status() === 400)).toBe(true)          // every wrong guess is rejected
    const row = (await rows(`password_reset_otps?id=eq.${id}`))[0]
    expect(row.attempts).toBeLessThanOrEqual(5)                         // collisions never grant extra guesses
    // locked -> even the right code fails; not locked -> the right code still works (attempts < max)
    const right = await verify(request, U.a.email, '222222')
    expect(right.status()).toBe(row.attempts >= 5 ? 400 : 200)
  })

  test('expired OTP is rejected', async ({ request }) => {
    await plantOtp(U.a.id, '333333', { expires_at: new Date(Date.now() - 1000).toISOString() })
    expect((await verify(request, U.a.email, '333333')).status()).toBe(400)
  })

  test('successful recovery: policy enforced, single use, old password & old session revoked, others unaffected', async ({ request }) => {
    const A = U.a, B = U.b
    // sessions issued before the reset
    const a1 = await login(request, A, A.password); const b1 = await login(request, B, B.password)
    expect(a1.status).toBe(200); expect(b1.status).toBe(200)
    expect(await sessionStatus(request, a1.token)).toBe(200)
    const bBefore = (await rows(`users?user_id=eq.${B.id}&select=role,status,password_hash,email`))[0]
    const aBefore = (await rows(`users?user_id=eq.${A.id}&select=user_id,username,role,status,email,name`))[0]

    await plantOtp(A.id, '424242')
    const v = await verify(request, A.email, '424242')
    expect(v.status()).toBe(200)
    const resetToken = (await v.json()).data.resetToken as string
    expect(resetToken).toBeTruthy()

    const reset = (password: string, token = resetToken) =>
      request.post('/api/auth/reset', { data: { resetToken: token, password }, headers: H(nextIp()) })

    // server-side policy; a weak/identical password must NOT burn the verified code
    expect((await reset('short1A!')).status()).toBe(400)
    expect((await reset('alllowercasepassword')).status()).toBe(400)
    expect((await reset(A.password)).status()).toBe(400)      // same as current
    expect((await reset('totally-tampered', 'not.a.token')).status()).toBe(400)

    const newPw = strong()
    const ok = await reset(newPw)
    expect(ok.status()).toBe(200)

    // single use: token and code cannot be replayed
    expect((await reset(strong())).status()).toBe(400)
    expect((await verify(request, A.email, '424242')).status()).toBe(400)
    const used = await latestOtp(A.id)
    expect(used.consumed_at).not.toBeNull()

    // old password fails, new password works
    expect((await login(request, A, A.password)).status).not.toBe(200)
    const a2 = await login(request, A, newPw)
    expect(a2.status).toBe(200)
    expect(await sessionStatus(request, a2.token)).toBe(200)

    // previous session rejected; another user's session & data unchanged
    expect(await sessionStatus(request, a1.token)).toBe(401)
    expect(await sessionStatus(request, b1.token)).toBe(200)
    const bAfter = (await rows(`users?user_id=eq.${B.id}&select=role,status,password_hash,email`))[0]
    expect(bAfter).toEqual(bBefore)
    const aAfter = (await rows(`users?user_id=eq.${A.id}&select=user_id,username,role,status,email,name`))[0]
    expect(aAfter).toEqual(aBefore)                            // id, role, status, identity preserved

    // audit trail exists and contains no secrets
    const audit = await rows(`logs?user_id=eq.${A.id}&action=eq.PASSWORD_RESET&select=action,metadata_json`)
    expect(audit.length).toBeGreaterThan(0)
    const blob = JSON.stringify(audit)
    expect(blob.includes(newPw) || blob.includes('424242') || blob.includes(resetToken)).toBe(false)
    U.a.password = newPw
  })

  test('server cooldown is never stricter than the 60 s the UI advertises', async ({ request }) => {
    await clearOtps(U.c.id)
    const first = await forgot(request, U.c.email)
    expect((await first.json()).data.cooldownSeconds).toBe(60)          // what the UI timer uses
    const row = await latestOtp(U.c.id)

    // 45 s after the last code: UI still counting down, server also refuses
    await sb(`password_reset_otps?id=eq.${row.id}`, { method: 'PATCH', body: JSON.stringify({ created_at: new Date(Date.now() - 45_000).toISOString() }) })
    await forgot(request, U.c.email)
    expect((await rows(`password_reset_otps?user_id=eq.${U.c.id}`)).length).toBe(1)

    // 55 s: UI would allow a click at 60 s, server must already accept
    await sb(`password_reset_otps?id=eq.${row.id}`, { method: 'PATCH', body: JSON.stringify({ created_at: new Date(Date.now() - 55_000).toISOString() }) })
    await forgot(request, U.c.email)
    expect((await rows(`password_reset_otps?user_id=eq.${U.c.id}`)).length).toBe(2)
  })

  test('per-email request limit is identical for registered and unregistered emails', async ({ request }) => {
    const known = U.r.email, unknown = `nobody-r-${tag}@example.invalid`
    const run = async (email: string) => {
      const codes: number[] = []
      for (let i = 0; i < 6; i++) codes.push((await forgot(request, email)).status())   // fresh IP each call
      return codes
    }
    const a = await run(known), b = await run(unknown)
    expect(a).toEqual([200, 200, 200, 200, 200, 429])
    expect(b).toEqual(a)                                                // no existence signal
    const blocked = await forgot(request, known)
    expect(blocked.status()).toBe(429)
    expect(Number(blocked.headers()['retry-after'])).toBeGreaterThan(0)
    expect((await blocked.json()).error).toMatch(/Too many code requests/)
    expect((await forgot(request, `other-${tag}@example.invalid`)).status()).toBe(200)   // other emails unaffected
  })

  test('forgot-password endpoint is rate limited per IP without affecting other IPs', async ({ request }) => {
    const ip = nextIp()
    const codes: number[] = []
    for (let i = 0; i < 12; i++) codes.push((await forgot(request, `nobody${i}-${tag}@example.invalid`, ip)).status())
    expect(codes.slice(0, 10).every(c => c === 200)).toBe(true)
    expect(codes.slice(10).every(c => c === 429)).toBe(true)
    expect((await forgot(request, `nobody-x-${tag}@example.invalid`, nextIp())).status()).toBe(200)
  })

  test('dev-only admin utility: auth, confirmation, audit, session revocation', async ({ request }) => {
    const adm = await login(request, U.adm, U.adm.password); expect(adm.status).toBe(200)
    const stf = await login(request, U.b, U.b.password); expect(stf.status).toBe(200)
    const auth = (t?: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', 'x-forwarded-for': nextIp() })

    expect((await request.get('/api/dev/user-password-reset')).status()).toBe(401)
    expect((await request.get('/api/dev/user-password-reset', { headers: auth(stf.token) })).status()).toBe(403)
    expect((await request.get('/api/dev/user-password-reset', { headers: auth(adm.token) })).status()).toBe(200)

    const target = U.t
    const tTok = (await login(request, target, target.password)).token
    expect(await sessionStatus(request, tTok)).toBe(200)
    const body = (over: object) => ({ username: target.username, newPassword: strong(), confirm: `RESET ${target.username}`, ...over })
    const post = (data: object, t = adm.token) => request.post('/api/dev/user-password-reset', { data, headers: auth(t) })

    expect((await post(body({}), stf.token)).status()).toBe(403)                       // non-admin
    expect((await post(body({ confirm: 'yes' }))).status()).toBe(400)                  // wrong confirmation
    expect((await post(body({ newPassword: 'weak' }))).status()).toBe(400)             // policy
    expect((await post(body({ username: `nope_${tag}`, confirm: `RESET nope_${tag}` }))).status()).toBe(400)

    const newPw = strong()
    const done = await post(body({ newPassword: newPw }))
    expect(done.status()).toBe(200)
    expect(JSON.stringify(await done.json()).includes(newPw)).toBe(false)              // never echoed

    expect((await login(request, target, target.password)).status).not.toBe(200)
    expect((await login(request, target, newPw)).status).toBe(200)
    expect(await sessionStatus(request, tTok)).toBe(401)                               // target revoked
    expect(await sessionStatus(request, adm.token)).toBe(200)                          // actor unaffected
    expect(await sessionStatus(request, stf.token)).toBe(200)                          // others unaffected

    const audit = await rows(`logs?user_id=eq.${U.adm.id}&action=eq.DEV_USER_PASSWORD_RESET&select=entity_id,metadata_json`)
    expect(audit.length).toBeGreaterThan(0)
    expect(audit[0].entity_id).toBe(target.id)
    expect(JSON.stringify(audit).includes(newPw)).toBe(false)
  })
})
