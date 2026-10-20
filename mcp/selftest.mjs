// Protocol self-test: starts server.mjs, speaks MCP to it over stdio, checks initialize + tools/list + ngf_list_routes (+ ngf_status if credentials are set).
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const child = spawn('node', [join(here, 'server.mjs')], { stdio: ['pipe', 'pipe', 'inherit'] })
let buf = ''; const waiting = new Map(); let n = 0
child.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (!l.trim()) continue; const m = JSON.parse(l); waiting.get(m.id)?.(m); waiting.delete(m.id) } })
const rpc = (method, params) => new Promise(r => { const id = ++n; waiting.set(id, r); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n') })
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); if (!cond) process.exitCode = 1 }

const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'selftest', version: '0' } })
ok('initialize', init.result?.serverInfo?.name === 'ngf-crm')
const list = await rpc('tools/list', {})
const names = (list.result?.tools || []).map(t => t.name)
ok('tools/list', names.includes('ngf_read') && names.includes('ngf_write'), names.join(', '))
ok('write tool is marked destructive', list.result.tools.find(t => t.name === 'ngf_write')?.annotations?.destructiveHint === true)
const routes = await rpc('tools/call', { name: 'ngf_list_routes', arguments: { filter: 'staff' } })
ok('ngf_list_routes', /\/api\/staff/.test(routes.result?.content?.[0]?.text || ''))
const src = await rpc('tools/call', { name: 'ngf_route_source', arguments: { path: '/api/staff' } })
ok('ngf_route_source', /export const (GET|POST)/.test(src.result?.content?.[0]?.text || ''))
const blocked = await rpc('tools/call', { name: 'ngf_get', arguments: { path: '/api/dev/clear' } })
ok('dev routes are blocked', blocked.result?.isError === true && /not exposed/.test(blocked.result.content[0].text))
const bad = await rpc('tools/call', { name: 'ngf_get', arguments: { path: '/api/../etc/passwd' } })
ok('path traversal is rejected', bad.result?.isError === true)
const noReason = await rpc('tools/call', { name: 'ngf_write', arguments: { method: 'POST', path: '/api/leads', reason: '' } })
ok('write without a reason is refused', noReason.result?.isError === true)
const docs = await rpc('tools/call', { name: 'ngf_search_docs', arguments: { query: 'commission cycle' } })
ok('ngf_search_docs', (docs.result?.content?.[0]?.text || '').includes('docs/'))
if (process.env.NGF_MCP_USERNAME || process.argv.includes('--live')) {
  const st = await rpc('tools/call', { name: 'ngf_status', arguments: {} })
  ok('ngf_status (login)', !st.result?.isError, st.result?.content?.[0]?.text?.replace(/\s+/g, ' ').slice(0, 160))
}
child.kill()
