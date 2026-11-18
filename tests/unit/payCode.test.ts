import assert from 'node:assert/strict'
import { payCodeFromLoanId } from '../../lib/payCode.ts'

// The pay code is the number inside the loan ID; it must be the same for every loan of the same customer.
assert.equal(payCodeFromLoanId('GBN-7425'), '7425')
assert.equal(payCodeFromLoanId('NGF-GBN-7425'), '7425')
assert.equal(payCodeFromLoanId('NGF-GBN-7425R2'), '7425')             // renewal suffix ignored
assert.equal(payCodeFromLoanId('NGF-GBN-7425R12'), '7425')            // two-digit renewal number too
assert.equal(payCodeFromLoanId('NGF-GBN-7425R2'), payCodeFromLoanId('GBN-7425'))   // stable across renewals
assert.equal(payCodeFromLoanId('  GBN-0042  '), '0042')               // trimmed; leading zeros kept (it is a string)

// Format: 3 to 6 trailing digits; the last 6 if longer
assert.equal(payCodeFromLoanId('GBN-123'), '123')
assert.equal(payCodeFromLoanId('X-123456'), '123456')
assert.equal(payCodeFromLoanId('X-1234567'), '234567')
for (const id of ['GBN-7425', 'NGF-GBN-7425R2', 'X-123456']) assert.match(payCodeFromLoanId(id), /^\d{3,6}$/)

// No code (empty string) when there is no usable trailing number. Current behaviour, documented:
assert.equal(payCodeFromLoanId('GBN-12'), '')                         // fewer than 3 digits
assert.equal(payCodeFromLoanId('GBN-7425R'), '')                      // "R" with no renewal number
assert.equal(payCodeFromLoanId('7425-GBN'), '')                       // number not at the end
assert.equal(payCodeFromLoanId('abc'), '')
assert.equal(payCodeFromLoanId(''), '')
assert.equal(payCodeFromLoanId(null), '')
assert.equal(payCodeFromLoanId(undefined), '')
assert.equal(payCodeFromLoanId(), '')
console.log('ok')
