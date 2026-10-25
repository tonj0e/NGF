import assert from 'node:assert/strict'
import { effectivePermissions, permsOf, canUse, DEFAULT_ROLE_PERMISSIONS, lead, hasAnyLead, LEAD_PARTS } from '../../lib/features.ts'

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
// Leads parts
assert.equal(canUse(['leads'], lead('leadsApprove'), false), true)          // old all-parts key still works
assert.equal(canUse(['leadsView'], lead('leadsApprove'), false), false)
assert.equal(canUse(['leadsApprove'], lead('leadsApprove'), false), true)
assert.equal(hasAnyLead(['leadsDisburse']), true)
assert.equal(hasAnyLead(['customers']), false)
assert.deepEqual(effectivePermissions(['accountant'], []).filter(k => k.startsWith('leads')).sort(), ['leadsApprove', 'leadsDisburse', 'leadsView'])
assert.ok(!effectivePermissions(['assistant_manager'], []).includes('leadsDelete'))
assert.equal(LEAD_PARTS.every(k => effectivePermissions(['manager'], []).includes(k)), true)
console.log('ok')
