import assert from 'node:assert/strict'
import { todayIST, addDays, mondayOf, parseWeekStart, weekRange, weekLabel, dayLabel, recentWeeks, groupByWeek } from '../../lib/leadWeeks.ts'

// Weeks run Monday..Sunday in India time. 2026-11-23 is a Monday, 2026-11-29 a Sunday.

// todayIST: the India date flips at 18:30 UTC, not at UTC midnight
assert.equal(todayIST(new Date('2026-11-22T18:29:59Z')), '2026-11-22')   // Sun 23:59:59 IST
assert.equal(todayIST(new Date('2026-11-22T18:30:00Z')), '2026-11-23')   // Mon 00:00 IST
assert.equal(todayIST(new Date('2026-12-31T18:30:00Z')), '2027-01-01')   // new year in India first

// mondayOf: Monday..Sunday belong to the same week; Sunday is the last day, not the first
for (const d of ['2026-11-23', '2026-11-25', '2026-11-28', '2026-11-29']) assert.equal(mondayOf(d), '2026-11-23')
assert.equal(mondayOf('2026-11-22'), '2026-11-16')
assert.equal(mondayOf('2026-11-30'), '2026-11-30')
assert.equal(mondayOf('2026-11-17T10:00:00'), '2026-11-16')              // longer ISO strings use their date part
// month and year edges
assert.equal(mondayOf('2026-12-03'), '2026-11-30')
assert.equal(mondayOf('2027-01-03'), '2026-12-28')                         // Sunday 3 Jan 2027 is in the week of 28 Dec
assert.equal(mondayOf('2024-03-01'), '2024-02-26')                         // leap year
assert.equal(mondayOf(''), '')
assert.equal(mondayOf('2026-02-30'), '')
assert.equal(mondayOf('nonsense'), '')

assert.equal(addDays('2026-12-28', 7), '2027-01-04')
assert.equal(addDays('2024-02-28', 1), '2024-02-29')

// parseWeekStart: only YYYY-MM-DD, moved back to its Monday
assert.equal(parseWeekStart('2026-11-23'), '2026-11-23')
assert.equal(parseWeekStart('2026-11-26'), '2026-11-23')
assert.equal(parseWeekStart(''), '')
assert.equal(parseWeekStart(null), '')
assert.equal(parseWeekStart('2026-11-23;drop'), '')
assert.equal(parseWeekStart('2026-13-01'), '')

// weekRange
assert.equal(weekRange('2026-11-23'), '23–29 Nov')
assert.equal(weekRange('2026-11-30'), '30 Nov – 6 Dec')
assert.equal(weekRange('2026-11-09', true), '9–15 Nov 2026')
assert.equal(weekRange('2026-11-30', true), '30 Nov – 6 Dec 2026')
assert.equal(weekRange('2025-12-29', true), '29 Dec 2025 – 4 Jan 2026')

// weekLabel: This week / Last week, older weeks with the year
const today = '2026-11-25'   // Wednesday
assert.equal(weekLabel('2026-11-23', today), 'This week · 23–29 Nov')
assert.equal(weekLabel('2026-11-16', today), 'Last week · 16–22 Nov')
assert.equal(weekLabel('2026-11-09', today), '9–15 Nov 2026')
assert.equal(weekLabel('2026-11-30', today), 'Next week · 30 Nov – 6 Dec')  // a lead may be filed on next week's day
assert.equal(weekLabel('2026-12-07', today), '7–13 Dec 2026')
assert.equal(weekLabel('', today), 'No date')
// on a Sunday, the week is still the one that started on Monday; on Monday a new week starts
assert.equal(weekLabel('2026-11-23', '2026-11-29'), 'This week · 23–29 Nov')
assert.equal(weekLabel('2026-11-23', '2026-11-30'), 'Last week · 23–29 Nov')
// across a new year
assert.equal(weekLabel('2026-12-28', '2027-01-03'), 'This week · 28 Dec – 3 Jan')
assert.equal(weekLabel('2026-12-28', '2027-01-04'), 'Last week · 28 Dec – 3 Jan')
assert.equal(weekLabel('2026-12-21', '2027-01-04'), '21–27 Dec 2026')

// dayLabel
assert.equal(dayLabel('2026-11-17', today), 'Tue 17 Nov')
assert.equal(dayLabel('2026-11-23', today), 'Mon 23 Nov')
assert.equal(dayLabel('2025-12-29', today), 'Mon 29 Dec 2025')
assert.equal(dayLabel('', today), '')

// recentWeeks: this week first, then one week back each
assert.deepEqual(recentWeeks('2026-11-25', 3), ['2026-11-23', '2026-11-16', '2026-11-09'])
assert.equal(recentWeeks('2027-01-02').length, 27)
assert.equal(recentWeeks('2027-01-02')[1], '2026-12-21')
assert.deepEqual(recentWeeks('2026-11-25', 2, 1), ['2026-11-30', '2026-11-23', '2026-11-16'])

// groupByWeek: keeps the row order, one group per week, in the order the weeks appear
const rows = [
  { id: 'a', d: '2026-11-29' }, { id: 'b', d: '2026-11-23' },   // this week (Sun, Mon)
  { id: 'c', d: '2026-11-22' }, { id: 'd', d: '2026-11-17' },   // last week
  { id: 'e', d: '2026-11-10' },                                  // older
  { id: 'f', d: '' },                                            // no date
]
const g = groupByWeek(rows, r => r.d, today)
assert.deepEqual(g.map(x => x.monday), ['2026-11-23', '2026-11-16', '2026-11-09', ''])
assert.deepEqual(g.map(x => x.rows.map(r => r.id).join('')), ['ab', 'cd', 'e', 'f'])
assert.deepEqual(g.map(x => x.label), ['This week · 23–29 Nov', 'Last week · 16–22 Nov', '9–15 Nov 2026', 'No date'])
assert.deepEqual(groupByWeek([], (r: { d: string }) => r.d, today), [])

console.log('ok')
