import assert from 'node:assert/strict'
import { addDaysIST, getWeekStartIST, getWeekEndIST, dueDateToSaturday, formatDisplayIST, generateSchedule, parseDateIST, getWeekNoIST } from '../../lib/dateUtils.ts'

// Only the pure helpers (a date string in, a date string out). The "today"/"now" helpers depend on the clock and are not tested here.
// 2026-11-16 Mon, 2026-11-19 Thu, 2026-11-21 Sat, 2026-11-22 Sun. Results must not depend on the machine's time zone.

// addDaysIST: calendar arithmetic across month, year and leap-day edges
assert.equal(addDaysIST('2026-11-21', 0), '2026-11-21')
assert.equal(addDaysIST('2026-11-21', 7), '2026-11-28')
assert.equal(addDaysIST('2026-12-28', 7), '2027-01-04')
assert.equal(addDaysIST('2024-02-28', 1), '2024-02-29')
assert.equal(addDaysIST('2026-03-01', -1), '2026-02-28')

// Week = Monday..Sunday
for (const d of ['2026-11-16', '2026-11-19', '2026-11-21', '2026-11-22']) {
  assert.equal(getWeekStartIST(d), '2026-11-16')
  assert.equal(getWeekEndIST(d), '2026-11-22')
}

// dueDateToSaturday: the Saturday on or after the date (a Sunday goes to the next Saturday)
assert.equal(dueDateToSaturday('2026-11-16'), '2026-11-21')
assert.equal(dueDateToSaturday('2026-11-19'), '2026-11-21')
assert.equal(dueDateToSaturday('2026-11-21'), '2026-11-21')
assert.equal(dueDateToSaturday('2026-11-22'), '2026-11-28')

assert.equal(formatDisplayIST('2026-11-19'), '19/11/2026')
assert.equal(formatDisplayIST('2027-01-04'), '04/01/2027')

// generateSchedule: weekly from the start date, week numbers from 1
assert.deepEqual(generateSchedule('2026-11-21', 3), [
  { dueDate: '2026-11-21', weekNo: 1 },
  { dueDate: '2026-11-28', weekNo: 2 },
  { dueDate: '2026-12-05', weekNo: 3 },
])
assert.deepEqual(generateSchedule('2026-11-21', 0), [])
assert.equal(generateSchedule('2026-11-21', 10)[9].dueDate, '2027-01-23')

// parseDateIST is IST midnight (18:30 UTC the day before); getWeekNoIST counts 7-day blocks from the start date
assert.equal(parseDateIST('2026-11-21').toISOString(), '2026-11-20T18:30:00.000Z')
assert.equal(getWeekNoIST('2026-11-21', '2026-11-21'), 1)
assert.equal(getWeekNoIST('2026-11-27', '2026-11-21'), 1)
assert.equal(getWeekNoIST('2026-11-28', '2026-11-21'), 2)
assert.equal(getWeekNoIST('2026-11-20', '2026-11-21'), 0)            // the day before the start is week 0
console.log('ok')
