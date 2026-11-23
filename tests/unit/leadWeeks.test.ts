import assert from 'node:assert/strict'
import { todayIST, addDays, mondayOf, parseWeekStart, weekRange, weekLabel, dayLabel, recentWeeks, groupByWeek, parseView, viewOf, stageOf, pageWeekTotals, lastLeadDay } from '../../lib/leadWeeks.ts'

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
assert.equal(weekLabel('2026-11-09', today), '9–15 Nov')                    // no year within the current year
assert.equal(weekLabel('2025-12-15', today), '15–21 Dec 2025')
assert.equal(weekLabel('2025-12-29', today), '29 Dec 2025 – 4 Jan 2026')   // runs into another year: both years
assert.equal(weekLabel('2026-11-30', today), 'Next week · 30 Nov – 6 Dec')  // a lead may be filed on next week's day
assert.equal(weekLabel('2026-12-07', today), '7–13 Dec')
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
assert.deepEqual(g.map(x => x.label), ['This week · 23–29 Nov', 'Last week · 16–22 Nov', '9–15 Nov', 'No date'])
assert.deepEqual(groupByWeek([], (r: { d: string }) => r.d, today), [])

// parseView: only the three parts
assert.equal(parseView('pending'), 'pending')
assert.equal(parseView('returned'), 'returned')
assert.equal(parseView('PENDING'), '')
assert.equal(parseView('x'), '')
assert.equal(parseView(null), '')

// viewOf: the guarantor's In Progress parts
assert.equal(viewOf('Pending'), 'pending')
assert.equal(viewOf('Agent Assigned'), 'pending')
assert.equal(viewOf('Partially Verified'), 'pending')
assert.equal(viewOf('Verification Submitted'), 'done')
assert.equal(viewOf('Approved'), 'done')
assert.equal(viewOf('Returned'), 'returned')

// stageOf: the office's four New-leads parts
assert.equal(stageOf('Pending'), 'new')
assert.equal(stageOf('Under Review'), 'new')
assert.equal(stageOf('Agent Assigned'), 'assigned')
assert.equal(stageOf('Verification In Progress'), 'assigned')
assert.equal(stageOf('Partially Verified'), 'partial')
assert.equal(stageOf('Verification Submitted'), 'completed')
assert.equal(stageOf('Approved'), 'completed')
assert.equal(stageOf('Returned'), '')
assert.equal(stageOf('Converted'), '')
assert.equal(stageOf('Rejected'), '')

// pageWeekTotals: counts of the page's rows per week; only edge weeks that can run over pages need a count
{
  const dates = ['2026-11-29', '2026-11-24', '2026-11-20', '2026-11-16', '2026-11-12']   // weeks 23 Nov, 16 Nov, 9 Nov
  assert.deepEqual(pageWeekTotals(dates, 1, 1), { totals: { '2026-11-23': 2, '2026-11-16': 2, '2026-11-09': 1 }, edges: [] })
  assert.deepEqual(pageWeekTotals(dates, 1, 3).edges, ['2026-11-09'])                     // later page: last week
  assert.deepEqual(pageWeekTotals(dates, 2, 3).edges, ['2026-11-23', '2026-11-09'])       // middle page: first and last
  assert.deepEqual(pageWeekTotals(dates, 3, 3).edges, ['2026-11-23'])                     // last page: first week
  assert.deepEqual(pageWeekTotals(['2026-11-24', '2026-11-23'], 2, 3).edges, ['2026-11-23'])   // one week: counted once
  assert.deepEqual(pageWeekTotals(['', 'bad'], 2, 3), { totals: {}, edges: [] })
}

// lastLeadDay: the Sunday of next week
assert.equal(lastLeadDay('2026-11-23'), '2026-12-06')   // Monday
assert.equal(lastLeadDay('2026-11-29'), '2026-12-06')   // Sunday
assert.equal(lastLeadDay('2026-12-28'), '2027-01-10')   // across the year

console.log('ok')
