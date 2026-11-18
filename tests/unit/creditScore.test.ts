import assert from 'node:assert/strict'
import { bandOf, computeScore, cutoffOf, SCORE_RULES } from '../../lib/creditScore.ts'

// Bands of the NGF Score (0-850). No loans at all is always "New", whatever the number.
assert.equal(bandOf(0, false), 'New')
assert.equal(bandOf(500, false), 'New')
// With loans: below 1 is "Building" (never "New")
assert.equal(bandOf(-5, true), 'Building')
assert.equal(bandOf(0, true), 'Building')
assert.equal(bandOf(0.5, true), 'Building')
// Boundaries: Building 1-399, Fair 400-599, Good 600-749, Excellent 750+
assert.equal(bandOf(1, true), 'Building')
assert.equal(bandOf(399, true), 'Building')
assert.equal(bandOf(399.9, true), 'Building')
assert.equal(bandOf(400, true), 'Fair')
assert.equal(bandOf(599, true), 'Fair')
assert.equal(bandOf(600, true), 'Good')
assert.equal(bandOf(749, true), 'Good')
assert.equal(bandOf(750, true), 'Excellent')
assert.equal(bandOf(850, true), 'Excellent')
assert.equal(bandOf(900, true), 'Excellent')
assert.equal(SCORE_RULES.max, 850)
assert.deepEqual(SCORE_RULES.bands.map(b => b.min), [750, 600, 400, 1, 0])

// A customer with no loans scores 0, band New, nothing in progress
const empty = computeScore([], 0)
assert.equal(empty.value, 0)
assert.equal(empty.band, 'New')
assert.equal(empty.onTimeRate, null)
assert.equal(empty.inProgress, null)

// The on-time cutoff is 3:30 pm IST on the due Saturday (= 10:00 UTC)
assert.equal(new Date(cutoffOf('2026-11-21')).toISOString(), '2026-11-21T10:00:00.000Z')
console.log('ok')
