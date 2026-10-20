#!/usr/bin/env node
// NGF CRM MCP server (stdio, zero dependencies).
// Lets Claude operate the CRM as an Admin by calling the CRM's own /api routes, so every business rule, permission check
// and audit log in the app still applies. It never touches the database directly and never bypasses the login.
//
// Config (env or mcp/.env, never committed):
//   NGF_API_URL         base URL of the CRM (default http://localhost:3000; set https://ngffincorp.com for live)
//   NGF_MCP_USERNAME    username of a dedicated Admin account for Claude
//   NGF_MCP_PASSWORD    its password
//   NGF_MCP_READONLY    "1" = block the write tool
//
// Protocol: newline-delimited JSON-RPC 2.0 on stdin/stdout (MCP stdio transport). Logs go to stderr only.

import { readFileSync, readdirSync, statSync, appendFileSync, existsSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const SERVER_INFO = { name: 'ngf-crm', version: '0.1.0' }
const MAX_OUT = 60000

function loadEnvFile(file) {
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m || line.trim().startsWith('#')) continue
    let v = m[2]; if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1)
    if (process.env[m[1]] === undefined) process.env[m[1]] = v
  }
}
loadEnvFile(join(HERE, '.env'))
const CFG = {
  base: (process.env.NGF_API_URL || 'http://localhost:3000').replace(/\/+$/, ''),
  user: process.env.NGF_MCP_USERNAME || '',
  pass: process.env.NGF_MCP_PASSWORD || '',
  readonly: process.env.NGF_MCP_READONLY === '1',
}
const log = (...a) => process.stderr.write(`[ngf-mcp] ${a.join(' ')}\n`)

// Audit log: method, path, status and body FIELD NAMES only (never values, passwords or tokens)
function audit(entry) {
  try { appendFileSync(join(HERE, 'audit.log'), JSON.stringify({ ts: new Date().toISOString(), base: CFG.base, ...entry }) + '\n') } catch { /* best effort */ }
}

// ---------- auth + HTTP ----------
let session = { token: '', csrf: '', user: null }
async function login() {
  if (!CFG.user || !CFG.pass) throw new Error('Set NGF_MCP_USERNAME and NGF_MCP_PASSWORD in mcp/.env')
  const res = await fetch(`${CFG.base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: CFG.user, password: CFG.pass }) })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.success) throw new Error(`Login failed: ${json.error || res.status}`)
  if (json.data?.needQr) throw new Error('This account needs QR login. Use an Admin account (Admins skip QR).')
  const cookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []
  const csrf = (cookies.find(c => c.startsWith('csrf_token=')) || '').split(';')[0].replace('csrf_token=', '')
  session = { token: json.data.token, csrf, user: json.data.user }
  audit({ event: 'login', user: json.data.user?.username, role: json.data.user?.role })
}

const BLOCKED_PREFIXES = ['/api/dev/', '/api/setup', '/api/auth/']
function checkPath(path) {
  if (typeof path !== 'string' || !path.startsWith('/api/')) throw new Error('path must start with /api/')
  if (path.includes('..') || path.includes('//') || /[\s\\]/.test(path.split('?')[0])) throw new Error('invalid path')
  if (BLOCKED_PREFIXES.some(p => path.startsWith(p))) throw new Error(`${path} is not exposed here (dev, setup and login routes are blocked)`)
}
function qs(query) {
  if (!query || typeof query !== 'object') return ''
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  const s = p.toString(); return s ? `?${s}` : ''
}
async function api(method, path, { query, body } = {}, retry = true) {
  checkPath(path)
  if (!session.token) await login()
  const headers = { authorization: `Bearer ${session.token}` }
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (method !== 'GET' && session.csrf) headers['x-csrf-token'] = session.csrf
  const res = await fetch(`${CFG.base}${path}${qs(query)}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined })
  if (res.status === 401 && retry) { session.token = ''; await login(); return api(method, path, { query, body }, false) }
  const text = await res.text(); let data; try { data = JSON.parse(text) } catch { data = text }
  audit({ event: 'api', method, path, query: query ? Object.keys(query) : undefined, bodyKeys: body && typeof body === 'object' ? Object.keys(body) : undefined, status: res.status, as: session.user?.username })
  return { status: res.status, ok: res.ok, data }
}

// ---------- local project helpers ----------
function walk(dir, out = []) { for (const n of readdirSync(dir)) { const p = join(dir, n); statSync(p).isDirectory() ? walk(p, out) : out.push(p) } return out }
function listRoutes() {
  const base = join(ROOT, 'app', 'api'); if (!existsSync(base)) return []
  return walk(base).filter(f => /route\.(ts|js)$/.test(f)).map(f => {
    const src = readFileSync(f, 'utf8')
    const methods = [...src.matchAll(/export\s+(?:const|async function|function)\s+(GET|POST|PUT|PATCH|DELETE)\b/g)].map(m => m[1])
    return { path: '/' + relative(join(ROOT, 'app'), dirname(f)).split(sep).join('/'), methods: [...new Set(methods)] }
  }).sort((a, b) => a.path.localeCompare(b.path))
}
function routeFile(path) {
  checkPath(path); const clean = path.split('?')[0].replace(/\/+$/, '')
  const f = join(ROOT, 'app', ...clean.split('/').filter(Boolean), 'route.ts')
  if (!resolve(f).startsWith(join(ROOT, 'app', 'api')) || !existsSync(f)) throw new Error(`No route file for ${clean} (dynamic segments look like /api/leads/[leadId])`)
  return f
}
function docFile(p) {
  const f = resolve(ROOT, 'docs', p.replace(/^docs\//, ''))
  if (!f.startsWith(join(ROOT, 'docs') + sep) || !f.endsWith('.md') || !existsSync(f)) throw new Error('doc not found (docs/*.md only)')
  return f
}
function searchDocs(q) {
  const dir = join(ROOT, 'docs'); if (!existsSync(dir)) return []
  const words = String(q).toLowerCase().split(/\s+/).filter(Boolean); const hits = []
  for (const f of walk(dir).filter(x => x.endsWith('.md') && !x.includes('.obsidian'))) {
    readFileSync(f, 'utf8').split(/\r?\n/).forEach((l, i) => { const ll = l.toLowerCase(); if (words.length && words.every(w => ll.includes(w))) hits.push({ file: relative(ROOT, f), line: i + 1, text: l.trim().slice(0, 220) }) })
  }
  return hits.slice(0, 40)
}

// ---------- tools ----------
const READ_PRESETS = {
  dashboard: { path: '/api/dashboard' }, org: { path: '/api/branches/org-hierarchy' }, staff: { path: '/api/staff' },
  leads: { path: '/api/leads' }, customers: { path: '/api/customers' }, loans: { path: '/api/loans' },
  collections: { path: '/api/collections' }, collection_sheet: { path: '/api/collection-sheet' },
  settlements: { path: '/api/settlements' }, settlements_due: { path: '/api/settlements/due' }, payments: { path: '/api/payments' },
  payouts: { path: '/api/commissions/payout', query: { all: '1' } }, deposits: { path: '/api/deposits' }, capital: { path: '/api/capital' },
  agent_locations: { path: '/api/agent/location', query: { activeOnly: 'true' } }, agents: { path: '/api/agent' }, trips: { path: '/api/agent/trips' },
  notifications: { path: '/api/notifications' }, review_options: { path: '/api/review-options' }, loan_products: { path: '/api/loan-products' },
  settings: { path: '/api/settings' }, routes: { path: '/api/routes' }, financial_analytics: { path: '/api/financial-analytics' },
  projection: { path: '/api/projection' }, repayments: { path: '/api/repayments' },
}
const obj = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false })
const RO = { readOnlyHint: true, openWorldHint: false }
const TOOLS = [
  { name: 'ngf_status', title: 'Connection status', description: 'Check the connection: base URL, login result, role of the account in use, and whether writes are on. Call this first.', inputSchema: obj({}), annotations: RO,
    run: async () => { if (!session.token) await login(); const u = session.user; return { base: CFG.base, writesEnabled: !CFG.readonly, loggedInAs: u ? { username: u.username, role: u.role } : 'unknown', warning: u && u.role !== 'Admin' ? 'Not an Admin account: admin-only routes will be refused.' : undefined } } },
  { name: 'ngf_read', title: 'Read CRM data (preset)', description: `Read a CRM list or report by name: ${Object.keys(READ_PRESETS).join(', ')}. Optional query filters. For anything else use ngf_get.`,
    inputSchema: obj({ what: { type: 'string', enum: Object.keys(READ_PRESETS) }, query: { type: 'object', additionalProperties: true } }, ['what']), annotations: RO,
    run: async ({ what, query }) => { const p = READ_PRESETS[what]; if (!p) throw new Error('unknown preset'); return api('GET', p.path, { query: { ...(p.query || {}), ...(query || {}) } }) } },
  { name: 'ngf_get', title: 'GET any CRM API route', description: 'GET any /api route (read-only). See ngf_list_routes and ngf_route_source.',
    inputSchema: obj({ path: { type: 'string' }, query: { type: 'object', additionalProperties: true } }, ['path']), annotations: RO, run: async ({ path, query }) => api('GET', path, { query }) },
  { name: 'ngf_write', title: 'Change CRM data (POST/PATCH/PUT/DELETE)',
    description: 'Change data through any /api route as the Admin account. Read the route first with ngf_route_source so the body is right. A short `reason` is required and is written to the audit log. Some routes are irreversible (delete user/branch, approve payout or loan): say what you will do before calling.',
    inputSchema: obj({ method: { type: 'string', enum: ['POST', 'PATCH', 'PUT', 'DELETE'] }, path: { type: 'string' }, body: { type: 'object', additionalProperties: true }, query: { type: 'object', additionalProperties: true }, reason: { type: 'string' } }, ['method', 'path', 'reason']),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    run: async ({ method, path, body, query, reason }) => {
      if (CFG.readonly) throw new Error('Writes are disabled (NGF_MCP_READONLY=1)')
      if (!reason || String(reason).trim().length < 4) throw new Error('reason is required')
      audit({ event: 'write-intent', method, path, reason: String(reason).slice(0, 300) })
      return api(method, path, { query, body })
    } },
  { name: 'ngf_list_routes', title: 'List CRM API routes', description: 'List every API route and the HTTP methods it supports (read from the source).', inputSchema: obj({ filter: { type: 'string' } }), annotations: RO,
    run: async ({ filter }) => listRoutes().filter(r => !filter || r.path.includes(filter)) },
  { name: 'ngf_route_source', title: "Read an API route's source", description: 'Return the source of an API route file (what it accepts, who may call it, what it returns). Use before ngf_write.', inputSchema: obj({ path: { type: 'string', description: 'e.g. /api/staff or /api/leads/[leadId]' } }, ['path']), annotations: RO,
    run: async ({ path }) => readFileSync(routeFile(path), 'utf8') },
  { name: 'ngf_search_docs', title: 'Search the project notes', description: 'Search the docs/ vault (how the CRM works, rules, known issues). Returns file, line and text.', inputSchema: obj({ query: { type: 'string' } }, ['query']), annotations: RO, run: async ({ query }) => searchDocs(query) },
  { name: 'ngf_read_doc', title: 'Read a project note', description: 'Read one note from docs/, e.g. "04 Money/Payment Matching.md".', inputSchema: obj({ path: { type: 'string' } }, ['path']), annotations: RO, run: async ({ path }) => readFileSync(docFile(path), 'utf8') },
]
const TOOL_MAP = new Map(TOOLS.map(t => [t.name, t]))
const render = v => { let t = typeof v === 'string' ? v : JSON.stringify(v, null, 1); if (t.length > MAX_OUT) t = t.slice(0, MAX_OUT) + `\n…[truncated ${t.length - MAX_OUT} characters; use query filters]`; return t }

// ---------- JSON-RPC over stdio ----------
const send = msg => process.stdout.write(JSON.stringify(msg) + '\n')
const reply = (id, result) => send({ jsonrpc: '2.0', id, result })
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } })
async function handle({ id, method, params }) {
  try {
    switch (method) {
      case 'initialize': return reply(id, { protocolVersion: params?.protocolVersion || '2025-06-18', capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: 'Operates the NGF FINCORP CRM as Admin through its own API. Start with ngf_status. Read a route with ngf_route_source before changing data with ngf_write. Never print passwords or tokens.' })
      case 'ping': return reply(id, {})
      case 'tools/list': return reply(id, { tools: TOOLS.map(({ run, ...t }) => t) })
      case 'tools/call': {
        const tool = TOOL_MAP.get(params?.name); if (!tool) return fail(id, -32602, `Unknown tool ${params?.name}`)
        try { const out = await tool.run(params.arguments || {}); return reply(id, { content: [{ type: 'text', text: render(out) }], isError: !!(out && typeof out === 'object' && out.ok === false) }) }
        catch (e) { audit({ event: 'tool-error', tool: tool.name, error: String(e?.message || e).slice(0, 300) }); return reply(id, { content: [{ type: 'text', text: `Error: ${e?.message || e}` }], isError: true }) }
      }
      default: if (id !== undefined && !String(method).startsWith('notifications/')) return fail(id, -32601, `Method not found: ${method}`)
    }
  } catch (e) { if (id !== undefined) fail(id, -32603, String(e?.message || e)) }
}
if (process.argv.includes('--list-tools')) { console.log(TOOLS.map(t => `${t.name}${t.annotations.readOnlyHint ? '' : '  [writes]'}: ${t.description.slice(0, 80)}`).join('\n')); process.exit(0) }
log(`ready · base ${CFG.base} · writes ${CFG.readonly ? 'OFF' : 'ON'}`)
createInterface({ input: process.stdin }).on('line', line => { if (!line.trim()) return; let m; try { m = JSON.parse(line) } catch { return fail(null, -32700, 'Parse error') } handle(m) })
