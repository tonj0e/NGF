import assert from 'node:assert/strict'
import { chunk, cleanSearch, pageBounds } from '../../lib/db-pure.ts'

assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]])
assert.deepEqual(chunk([], 2), [])
assert.equal(chunk(Array.from({ length: 400 }, (_, i) => i), 200).length, 2)
assert.equal(cleanSearch('ab,c(d)%*"\;'), 'ab c d')
assert.equal(cleanSearch('  anju   mol  '), 'anju mol')
assert.equal(cleanSearch(null), '')
assert.equal(cleanSearch('x'.repeat(200)).length, 60)
assert.equal(cleanSearch('name.eq.a,or=(id.gt.0)'), 'name.eq.a or= id.gt.0')   // separators gone: cannot add a second filter
assert.deepEqual(pageBounds(1, 50), { page: 1, pageSize: 50, from: 0, to: 49 })
assert.deepEqual(pageBounds(3, 20), { page: 3, pageSize: 20, from: 40, to: 59 })
assert.deepEqual(pageBounds('x', 'y'), { page: 1, pageSize: 50, from: 0, to: 49 })
assert.equal(pageBounds(1, 99999).pageSize, 200)
assert.equal(pageBounds(-4, 0).page, 1)
console.log('ok')
