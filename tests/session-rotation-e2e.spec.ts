import { test, expect } from '@playwright/test'
import bcrypt from 'bcrypt'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

// End-to-end: a browser session opened before a password rotation is rejected afterwards.
// Uses two throwaway users (never real accounts) created and deleted by this test.
// Never logs passwords, tokens or hashes.

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

const sb = (p: string, init: RequestInit = {}) =>
  fetch(`${SUPABASE_URL}/rest/v1/${p}`, {
    ...init,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal', ...(init.headers || {}) },
  })

const tag = crypto.randomBytes(4).toString('hex').toUpperCase()
const users = {
  a: { id: `USRE2EA${tag}`, username: `e2e_a_${tag}`.toLowerCase(), name: `E2E SESSION A ${tag}`, password: crypto.randomBytes(24).toString('base64url') },
  b: { id: `USRE2EB${tag}`, username: `e2e_b_${tag}`.toLowerCase(), name: `E2E SESSION B ${tag}`, password: crypto.randomBytes(24).toString('base64url') },
}
const created: string[] = []

test.use({ trace: 'off', screenshot: 'off', video: 'off' })
test.describe.configure({ mode: 'serial', retries: 0 })

test.describe('session invalidation after password rotation (E2E)', () => {
  test.beforeAll(async () => {
    expect(SUPABASE_URL.includes(EXPECTED_PROJECT_REF), 'unexpected Supabase project — refusing to run').toBe(true)
    expect(!!SERVICE_KEY, 'service key missing').toBe(true)
    for (const u of Object.values(users)) {
      const res = await sb('users', {
        method: 'POST',
        body: JSON.stringify({
          user_id: u.id, username: u.username, name: u.name, role: 'Staff', status: 'Active',
          email: `${u.username}@example.invalid`, salt: '', password_hash: await bcrypt.hash(u.password, 12),
        }),
      })
      expect(res.ok, `create test user (${res.status})`).toBe(true)
      created.push(u.id)
    }
  })

  test.afterAll(async () => {
    // Remove only the throwaway users created above (audit log rows are intentionally left intact)
    for (const id of created) await sb(`users?user_id=eq.${id}`, { method: 'DELETE' })
    for (const id of created) {
      const r = await sb(`users?user_id=eq.${id}&select=user_id`, { headers: { Prefer: '' } })
      expect(((await r.json()) as unknown[]).length, 'test user removed').toBe(0)
    }
  })

  async function signIn(page: any, username: string, password: string) {
    await page.goto('/')
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
    await page.reload()
    await page.waitForSelector('input[name="username"]', { timeout: 15000 })
    await page.fill('input[name="username"]', username)
    await page.fill('input[name="password"]', password)
    const resp = page.waitForResponse((r: any) => r.url().includes('/api/auth/login'))
    await page.click('button[type="submit"]:has-text("Sign in")')
    return (await resp).status() as number
  }

  test('old session is rejected after rotation; new password works; other user unaffected', async ({ page, request, browser }) => {
    const A = users.a, B = users.b

    // 1-2. A signs in; portal loads
    expect(await signIn(page, A.username, A.password)).toBe(200)
    await expect(page.getByRole('button', { name: new RegExp(A.name) })).toBeVisible({ timeout: 20000 })

    // 3. keep A's existing token; B signs in in a separate browser context
    const oldTokenA = await page.evaluate(() => localStorage.getItem('ngf_token'))
    expect(oldTokenA).toBeTruthy()
    const ctxB = await browser.newContext()
    const pageB = await ctxB.newPage()
    expect(await signIn(pageB, B.username, B.password)).toBe(200)
    await expect(pageB.getByRole('button', { name: new RegExp(B.name) })).toBeVisible({ timeout: 20000 })
    const tokenB = await pageB.evaluate(() => localStorage.getItem('ngf_token'))
    const authed = async (token: string | null, url = '/api/auth/session') =>
      (await request.get(url, { headers: { Authorization: `Bearer ${token}` } })).status()
    expect(await authed(oldTokenA)).toBe(200)

    // 4. rotate A's password (controlled test-only DB update, same bcrypt cost as the app)
    const newPassword = crypto.randomBytes(24).toString('base64url')
    const rot = await sb(`users?user_id=eq.${A.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ password_hash: await bcrypt.hash(newPassword, 12), updated_at: new Date().toISOString() }),
    })
    expect(rot.ok).toBe(true)

    // 5. reload without signing in again: old session rejected, back at login screen
    await page.reload()
    await page.waitForSelector('input[name="username"]', { timeout: 20000 })
    expect(await page.evaluate(() => localStorage.getItem('ngf_token'))).toBeNull()
    await expect(page.getByRole('button', { name: new RegExp(A.name) })).toHaveCount(0)

    // 6. old token gets 401 from session check and a protected endpoint
    expect(await authed(oldTokenA)).toBe(401)
    expect(await authed(oldTokenA, '/api/dashboard')).toBe(401)

    // 7. new password signs in; portal loads
    expect(await signIn(page, A.username, newPassword)).toBe(200)
    await expect(page.getByRole('button', { name: new RegExp(A.name) })).toBeVisible({ timeout: 20000 })

    // old password no longer works
    expect(await signIn(page, A.username, A.password)).not.toBe(200)

    // 8. incorrect password rejected
    expect(await signIn(page, A.username, newPassword + 'x')).not.toBe(200)
    await expect(page.locator('text=Invalid credentials')).toBeVisible({ timeout: 15000 })

    // 9. B's existing session is unaffected: token still valid, page reload keeps B signed in
    expect(await authed(tokenB)).toBe(200)
    await pageB.reload()
    await expect(pageB.getByRole('button', { name: new RegExp(B.name) })).toBeVisible({ timeout: 20000 })
    expect(await pageB.evaluate(() => localStorage.getItem('ngf_token'))).toBeTruthy()
    await ctxB.close()
  })
})
