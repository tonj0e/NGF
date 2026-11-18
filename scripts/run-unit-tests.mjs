#!/usr/bin/env node
// Runs every tests/unit/*.test.ts with plain Node (no test framework) and stops at the first failure.
// Each test file is a script that throws (node:assert) on a wrong result and prints "ok" at the end.
// Works on Node 22.6+ (CI, Hostinger) and Node 23+/25 (owner's Mac): --experimental-strip-types turns on
// TypeScript type stripping on 22.x (default-on from 22.18 / 23.6, where the flag is still accepted), and
// --no-warnings hides the "experimental" and "module type" notices so the output stays readable.
// Usage: npm run test:unit   (or: node scripts/run-unit-tests.mjs [name-filter])
import { readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const [major, minor] = process.versions.node.split('.').map(Number)
if (major < 22 || (major === 22 && minor < 6)) {
  console.error(`test:unit needs Node 22.6 or newer (TypeScript type stripping); this is Node ${process.versions.node}.`)
  process.exit(1)
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dir = join(root, 'tests', 'unit')
const filter = process.argv[2] || ''
const files = readdirSync(dir).filter(f => f.endsWith('.test.ts') && f.includes(filter)).sort()
if (!files.length) { console.error(`No unit tests found in tests/unit${filter ? ` matching "${filter}"` : ''}.`); process.exit(1) }

const started = Date.now()
for (const f of files) {
  const t = Date.now()
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', join('tests', 'unit', f)], { cwd: root, encoding: 'utf8' })
  const out = (r.stdout || '').trim()
  if (r.status !== 0) {
    console.error(`FAIL ${f}`)
    if (out) console.error(out)
    if (r.stderr) console.error(r.stderr.trim())
    if (r.error) console.error(r.error.message)
    console.error(`\nStopped at the first failure (${files.indexOf(f)} of ${files.length} passed before it).`)
    process.exit(1)
  }
  console.log(`pass ${f}${out && out !== 'ok' ? `  (${out})` : ''}  ${Date.now() - t} ms`)
}
console.log(`\n${files.length} unit test files passed in ${Date.now() - started} ms (Node ${process.versions.node}).`)
