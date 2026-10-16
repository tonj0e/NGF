import { test, expect } from '@playwright/test'

const USER = process.env.PLAYWRIGHT_MANAGER_USERNAME || ''
const PASS = process.env.PLAYWRIGHT_MANAGER_PASSWORD || ''

// A structurally valid but unaccepted token (not signed by the server), unexpired per its exp claim
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
const staleToken = () =>
  `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ userId: 'USRR7UH3LF4', username: 'vincent', role: 'Staff', name: 'X', email: '', pv: 'stale', exp: Math.floor(Date.now() / 1000) + 3600 })}.invalid`

async function signIn(page: any, password: string) {
  await page.goto('/')
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  await page.reload()
  await page.waitForSelector('input[name="username"]', { timeout: 15000 })
  await page.fill('input[name="username"]', USER)
  await page.fill('input[name="password"]', password)
  const resp = page.waitForResponse((r: any) => r.url().includes('/api/auth/login'))
  await page.click('button[type="submit"]:has-text("Sign in")')
  return (await resp).status()
}

test.describe('session invalidation', () => {
  test.skip(!USER || !PASS, 'PLAYWRIGHT_MANAGER_* not configured')

  test('unauthenticated session check is 401', async ({ request }) => {
    expect((await request.get('/api/auth/session')).status()).toBe(401)
  })

  test('revoked/stale stored token is cleared and user returns to login', async ({ page }) => {
    await page.goto('/')
    await page.evaluate((t) => localStorage.setItem('ngf_token', t), staleToken())
    await page.reload()
    await page.waitForSelector('input[name="username"]', { timeout: 15000 })
    expect(await page.evaluate(() => localStorage.getItem('ngf_token'))).toBeNull()
  })

  test('current credential logs in and session is accepted', async ({ page }) => {
    expect(await signIn(page, PASS)).toBe(200)
    await expect(page.getByRole('button', { name: /VINCENT ANTONY/ })).toBeVisible({ timeout: 20000 })
    const token = await page.evaluate(() => localStorage.getItem('ngf_token'))
    const r = await page.request.get('/api/auth/session', { headers: { Authorization: `Bearer ${token}` } })
    expect(r.status()).toBe(200)
  })

  test('incorrect password is rejected', async ({ page }) => {
    await signIn(page, PASS + 'x')
    await expect(page.locator('text=Invalid credentials')).toBeVisible({ timeout: 15000 })
    expect(await page.evaluate(() => localStorage.getItem('ngf_token'))).toBeNull()
  })
})
