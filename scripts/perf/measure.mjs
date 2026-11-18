// Read-only page speed measurement for the NGF CRM.
// Usage: node measure.mjs <roleKey> [baseUrl] [--mobile] [--passes=2] [--only=Label1,Label2]
// Signs in with creds.json[roleKey], then clicks every item in the side menu (as a person would) and records,
// for each page: time until the page has finished loading its data, every /api call (time, size, status),
// main-thread long tasks (jank) and console errors. Nothing is ever submitted except the sign-in form.
import { createRequire } from 'module'
import fs from 'fs'
import path from 'path'
const require = createRequire('/Users/tonjo6/Downloads/projects/ngf-crm-main/package.json')
const { chromium, devices } = require('playwright')

const DIR = path.dirname(new URL(import.meta.url).pathname)
const role = process.argv[2]
const base = (process.argv[3] && !process.argv[3].startsWith('--')) ? process.argv[3] : 'http://localhost:3100'
const mobile = process.argv.includes('--mobile')
const passes = Number((process.argv.find(a => a.startsWith('--passes=')) || '--passes=2').split('=')[1])
const only = (process.argv.find(a => a.startsWith('--only=')) || '').replace('--only=', '').split(',').filter(Boolean)
const host = new URL(base).hostname
if (!['localhost', '127.0.0.1'].includes(host)) { console.error('Refusing: test logins are only used on localhost'); process.exit(2) }
const creds = JSON.parse(fs.readFileSync(process.env.NGF_TEST_CREDS || path.join(process.env.HOME, '.config/ngf-dev/creds.json'), 'utf8'))[role]
if (!creds) { console.error('Unknown role key', role); process.exit(2) }

const QUIET_MS = 1500, MAX_MS = 30000
// One measurement at a time on this machine (several agents run in parallel; parallel browsers would distort the numbers)
const LOCK = path.join(process.env.HOME, '.config/ngf-dev/.measure.lock')
for (let waited = 0; ; waited += 2000) {
  try { fs.mkdirSync(LOCK); fs.writeFileSync(path.join(LOCK, 'owner'), `${role} ${process.pid} ${new Date().toISOString()}`); break }
  catch {
    try { const age = Date.now() - fs.statSync(LOCK).mtimeMs; if (age > 15 * 60_000) fs.rmSync(LOCK, { recursive: true, force: true }) } catch {}
    if (waited % 30000 === 0) console.log(`waiting for another measurement to finish (${Math.round(waited / 1000)}s)…`)
    await new Promise(r => setTimeout(r, 2000))
  }
}
const release = () => { try { fs.rmSync(LOCK, { recursive: true, force: true }) } catch {} }
process.on('exit', release); process.on('SIGINT', () => { release(); process.exit(130) }); process.on('uncaughtException', e => { release(); console.error(e); process.exit(1) })
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const ctx = await browser.newContext(mobile ? { ...devices['iPhone 13'] } : { viewport: { width: 1440, height: 900 } })
await ctx.grantPermissions([])   // no location, camera or notifications
const page = await ctx.newPage()

// network bookkeeping
const inflight = new Map()
let calls = [], lastActivity = 0, consoleErrors = [], nonGet = []
const isApi = u => { try { return new URL(u).pathname.startsWith('/api/') } catch { return false } }
page.on('request', r => {
  if (!isApi(r.url())) return
  inflight.set(r, performance.now()); lastActivity = performance.now()
  if (r.method() !== 'GET') nonGet.push({ method: r.method(), path: new URL(r.url()).pathname, body: (r.postData() || '').slice(0, 120).replace(/"password":"[^"]*"/, '"password":"***"') })
})
const done = async (r, failed) => {
  if (!inflight.has(r)) return
  const t0 = inflight.get(r); inflight.delete(r); lastActivity = performance.now()
  let size = 0, status = failed ? 'FAILED' : 0
  if (!failed) { try { const resp = await r.response(); status = resp?.status() || 0; size = Number(resp?.headers()['content-length'] || 0) || (await resp?.body().catch(() => Buffer.alloc(0)))?.length || 0 } catch {} }
  const u = new URL(r.url())
  calls.push({ method: r.method(), path: u.pathname + (u.search ? '?' + [...u.searchParams.keys()].map(k => `${k}=${(u.searchParams.get(k) || '').slice(0, 24)}`).join('&') : ''), ms: Math.round(performance.now() - t0), status, kb: Math.round(size / 102.4) / 10 })
}
page.on('requestfinished', r => done(r, false))
page.on('requestfailed', r => done(r, true))
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)) })
page.on('pageerror', e => consoleErrors.push('PAGEERROR ' + String(e.message).slice(0, 200)))

async function settle(t0) {
  // wait until no /api call has been running or finishing for QUIET_MS (pages that poll are cut at MAX_MS)
  lastActivity = t0   // quiet is measured from the click, so the previous page's last call cannot end this wait early
  await page.waitForTimeout(150)
  while (performance.now() - t0 < MAX_MS) {
    const quiet = inflight.size === 0 && performance.now() - lastActivity > QUIET_MS
    if (quiet) break
    await page.waitForTimeout(100)
  }
  const end = calls.length ? Math.max(...calls.map(c => c._end || 0)) : 0
  return Math.round(Math.max(0, (lastActivity || t0) - t0))
}
async function longTasks() {
  return page.evaluate(() => { const l = window.__lt || []; window.__lt = []; return { count: l.length, totalMs: Math.round(l.reduce((s, x) => s + x, 0)), maxMs: Math.round(Math.max(0, ...l)) } })
}
await page.addInitScript(() => {
  window.__lt = []
  try { new PerformanceObserver(list => { for (const e of list.getEntries()) window.__lt.push(e.duration) }).observe({ type: 'longtask', buffered: true }) } catch {}
})

const result = { role, user: creds.username, base, mobile, at: new Date().toISOString(), firstLoad: null, login: null, pages: [], nonGet: [], errors: [] }

// 1. first load of the sign-in page (cold)
let t0 = performance.now()
await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 90000 }); await page.waitForLoadState('load', { timeout: 30000 }).catch(() => {})
const nav = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; const res = performance.getEntriesByType('resource'); return { ttfbMs: Math.round(n.responseStart), domContentLoadedMs: Math.round(n.domContentLoadedEventEnd), loadMs: Math.round(n.loadEventEnd), jsKB: Math.round(res.filter(r => r.initiatorType === 'script').reduce((s, r) => s + (r.encodedBodySize || 0), 0) / 1024), cssKB: Math.round(res.filter(r => r.initiatorType === 'link' || r.name.endsWith('.css')).reduce((s, r) => s + (r.encodedBodySize || 0), 0) / 1024), requests: res.length } })
result.firstLoad = nav
await page.waitForSelector('input[name="username"]', { timeout: 30000 })

// 2. sign in
calls = []
await page.fill('input[name="username"]', creds.username)
await page.fill('input[name="password"]', creds.password)
t0 = performance.now()
await page.click('button[type="submit"]')
const outcome = await Promise.race([
  page.waitForSelector('nav button, nav a', { timeout: 30000 }).then(() => 'in'),
  page.waitForSelector('text=/scan|QR/i', { timeout: 30000 }).then(() => 'qr'),
  page.waitForSelector('.text-red-600', { timeout: 30000 }).then(async () => 'error: ' + (await page.textContent('.text-red-600'))),
]).catch(e => 'timeout ' + e.message.slice(0, 80))
const loginMs = await settle(t0)
result.login = { outcome, ms: loginMs, calls: calls.slice() }
if (outcome !== 'in') { result.errors.push('Login did not reach the app: ' + outcome); fs.writeFileSync(path.join(process.env.NGF_PERF_OUT || path.join(process.env.HOME, '.config/ngf-dev/reports'), `result-${role}${mobile ? '-mobile' : ''}.json`), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result.login)); await browser.close(); process.exit(1) }
await longTasks()

// 3. menu items
const openMenu = async () => {
  if (mobile) {
    const b = page.locator('button[aria-label*="menu" i]').first()
    if (await b.count()) { await b.click().catch(() => {}); await page.waitForTimeout(300) }
    return
  }
  // desktop: the sidebar is collapsed to icons; hovering expands it (labels appear). Admin keeps some pages in a "Features" group.
  await page.hover('aside nav').catch(() => {})
  await page.waitForTimeout(300)
  const feat = page.locator('aside nav button[aria-expanded="false"]').first()
  if (await feat.count()) { await feat.click().catch(() => {}); await page.waitForTimeout(200) }
}
const navSel = () => mobile ? 'nav' : 'aside nav'
await openMenu()
let labels = await page.$$eval(navSel() + ' button', bs => bs.filter(b => !b.hasAttribute('aria-expanded')).map(b => (b.innerText || b.getAttribute('title') || '').trim().split('\n')[0]).filter(Boolean))
labels = [...new Set(labels)].filter(l => !/^logout$/i.test(l))
if (only.length) labels = labels.filter(l => only.includes(l))
result.menu = labels

for (let pass = 1; pass <= passes; pass++) {
  for (const label of labels) {
    await openMenu()
    calls = []
    const before = await page.evaluate(() => location.hash)
    t0 = performance.now()
    const btn = page.locator(navSel() + ' button').filter({ hasText: label }).first()
    try { await btn.click({ timeout: 5000 }) } catch (e) { result.errors.push(`Could not open ${label}: ${e.message.slice(0, 80)}`); continue }
    const ms = await settle(t0)
    const lt = await longTasks()
    const hash = await page.evaluate(() => location.hash)
    const slow = calls.slice().sort((a, b) => b.ms - a.ms)
    result.pages.push({ pass, label, hash, from: before, settledMs: ms, apiCalls: calls.length, apiKB: Math.round(calls.reduce((s, c) => s + c.kb, 0)), slowest: slow.slice(0, 6), failed: calls.filter(c => c.status === 'FAILED' || c.status >= 400), longTasks: lt, consoleErrors: consoleErrors.splice(0) })
    console.log(`pass ${pass}  ${label.padEnd(28)} ${String(ms).padStart(6)} ms  api=${calls.length}  ${Math.round(calls.reduce((s, c) => s + c.kb, 0))}KB  jank=${lt.totalMs}ms  slowest=${slow[0] ? slow[0].path + ' ' + slow[0].ms + 'ms' : '-'}`)
  }
}
result.nonGet = nonGet
fs.writeFileSync(path.join(process.env.NGF_PERF_OUT || path.join(process.env.HOME, '.config/ngf-dev/reports'), `result-${role}${mobile ? '-mobile' : ''}.json`), JSON.stringify(result, null, 2))
console.log(`firstLoad ${JSON.stringify(nav)}  login ${loginMs}ms  nonGET calls=${nonGet.length}`)
await browser.close()
