import assert from 'node:assert/strict'
import { effectivePermissions, permsOf, canUse, DEFAULT_ROLE_PERMISSIONS } from '../../lib/features.ts'

const acc = DEFAULT_ROLE_PERMISSIONS.accountant
assert.deepEqual(effectivePermissions(['accountant'], []).sort(), [...acc].sort())
assert.ok(effectivePermissions(['accountant'], ['payChat']).includes('payChat'))
assert.ok(!effectivePermissions(['accountant'], ['-reports']).includes('reports'))
assert.ok(!effectivePermissions(['accountant'], ['reports', '-reports']).includes('reports'))
const union = effectivePermissions(['manager', 'accountant'], [])
for (const k of [...DEFAULT_ROLE_PERMISSIONS.manager, ...acc]) assert.ok(union.includes(k))
assert.ok(!effectivePermissions([], ['nonsense']).includes('nonsense'))
assert.deepEqual(effectivePermissions([], []), [])
assert.deepEqual(permsOf('a, b'), ['a', 'b'])
assert.deepEqual(permsOf(['a']), ['a'])
assert.deepEqual(permsOf(null), [])
// canUse
assert.equal(canUse([], ['customers'], true), true)
assert.equal(canUse(['customers'], ['customers'], false), true)
assert.equal(canUse(['leads'], ['customers'], false), false)
assert.equal(canUse([], ['customers'], false), false)
assert.equal(canUse(['leads'], [], false), true)
assert.equal(canUse([], [], false), false)
console.log('ok')
