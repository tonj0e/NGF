import assert from 'node:assert/strict'
import { fetchAllPages } from '../../lib/paginate.ts'

const table = Array.from({ length: 2500 }, (_, i) => ({ id: i }))
const fake = async (from: number, to: number) => table.slice(from, Math.min(to, 999 + from) + 1)   // like the server: never more than 1000 rows
assert.equal((await fetchAllPages(fake)).length, 2500)
assert.equal((await fetchAllPages(async (f, t) => table.slice(f, t + 1).slice(0, 1000))).length, 2500)
const exact = Array.from({ length: 2000 }, (_, i) => i)               // exactly two full pages: needs a third (empty) request
assert.equal((await fetchAllPages(async (f, t) => exact.slice(f, t + 1))).length, 2000)
assert.deepEqual(await fetchAllPages(async () => []), [])
assert.equal((await fetchAllPages(async (f, t) => table.slice(f, t + 1), 7)).length, 2500)
assert.deepEqual((await fetchAllPages(fake)).map(r => r.id).slice(998, 1002), [998, 999, 1000, 1001])
console.log('ok')
