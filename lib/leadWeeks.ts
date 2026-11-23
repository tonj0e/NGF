// Leads by week: weeks run Monday to Sunday (the company's standard week, same as Payment Chat), India time.
// Pure helpers only (date strings in, strings out; "today" is passed in), so they run on the server, in the browser
// and in the plain-Node unit test (tests/unit/leadWeeks.test.ts). No imports: Node runs this file directly in tests.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const YMD = /^(\d{4})-(\d{2})-(\d{2})/

// The calendar date (YYYY-MM-DD) in India for a moment in time (default: now)
export function todayIST(now: Date = new Date()): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10)
}

// A YYYY-MM-DD (or a longer ISO string starting with one) as a UTC-midnight Date, or null when it is not a real date
function cal(d: string): Date | null {
  const m = YMD.exec(d || '')
  if (!m) return null
  const t = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return t.getUTCMonth() === Number(m[2]) - 1 && t.getUTCDate() === Number(m[3]) ? t : null
}

export function addDays(d: string, n: number): string {
  const t = cal(d)
  if (!t) return ''
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}

// The Monday of the week holding this date ('' when the date is missing or not valid)
export function mondayOf(d: string): string {
  const t = cal(d)
  if (!t) return ''
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7))
  return t.toISOString().slice(0, 10)
}

// A weekStart query value: a valid YYYY-MM-DD, moved back to its Monday. '' when missing or not a date.
export function parseWeekStart(v: string | null | undefined): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? mondayOf(v!) : ''
}

const dm = (t: Date) => `${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]}`

// "23–29 Nov", "30 Nov – 6 Dec", and with the year: "9–15 Nov 2026", "29 Dec 2025 – 4 Jan 2026"
export function weekRange(monday: string, withYear = false): string {
  const a = cal(monday), b = cal(addDays(monday, 6))
  if (!a || !b) return ''
  const sameYear = a.getUTCFullYear() === b.getUTCFullYear()
  if (withYear && !sameYear) return `${dm(a)} ${a.getUTCFullYear()} – ${dm(b)} ${b.getUTCFullYear()}`
  const y = withYear ? ` ${b.getUTCFullYear()}` : ''
  return a.getUTCMonth() === b.getUTCMonth() ? `${a.getUTCDate()}–${dm(b)}${y}` : `${dm(a)} – ${dm(b)}${y}`
}

// "This week · 23–29 Nov", "Last week · 16–22 Nov", "Next week · 30 Nov – 6 Dec" (a guarantor may file a lead on next
// week's day), or any other week: "9–15 Nov", with the year only when the week is not all in the current year
// ("15–21 Dec 2025", "29 Dec 2025 – 4 Jan 2026")
export function weekLabel(monday: string, today: string): string {
  if (!monday) return 'No date'
  const cur = mondayOf(today)
  if (monday === cur) return `This week · ${weekRange(monday)}`
  if (monday === addDays(cur, 7)) return `Next week · ${weekRange(monday)}`
  if (monday === addDays(cur, -7)) return `Last week · ${weekRange(monday)}`
  const y = today.slice(0, 4)
  return weekRange(monday, monday.slice(0, 4) !== y || addDays(monday, 6).slice(0, 4) !== y)
}

// "Mon 17 Nov" (the year is added when it is not the current year: "Mon 29 Dec 2025")
export function dayLabel(d: string, today: string): string {
  const t = cal(d)
  if (!t) return ''
  const y = t.getUTCFullYear() !== Number(today.slice(0, 4)) ? ` ${t.getUTCFullYear()}` : ''
  return `${DAYS[t.getUTCDay()]} ${dm(t)}${y}`
}

// The week picker's list, newest first: `ahead` weeks after this one, this week, then the weeks before it (Mondays).
// `count` weeks from this week back.
export function recentWeeks(today: string, count = 27, ahead = 0): string[] {
  const cur = mondayOf(today)
  return Array.from({ length: count + ahead }, (_, i) => addDays(cur, 7 * (ahead - i)))
}

export type WeekGroup<T> = { monday: string; label: string; rows: T[] }

// Rows (already sorted newest first) under their week, in the order the weeks first appear.
// Rows with no valid date go to one group with monday '' ("No date").
export function groupByWeek<T>(rows: T[], dateOf: (r: T) => string, today: string): WeekGroup<T>[] {
  const groups: WeekGroup<T>[] = []
  const byMonday = new Map<string, WeekGroup<T>>()
  for (const r of rows) {
    const m = mondayOf(dateOf(r) || '')
    let g = byMonday.get(m)
    if (!g) { g = { monday: m, label: weekLabel(m, today), rows: [] }; byMonday.set(m, g); groups.push(g) }
    g.rows.push(r)
  }
  return groups
}

// ─── Lead statuses by part (shared by GET /api/leads and the Leads page) ───

// The agent has finished the verification (it waits for the office): the guarantor's "Completed", the office's "Completed leads"
export const LEAD_DONE_STATUSES = ['Verification Submitted', 'Approved']
// with an agent: the office's "Assigned leads"
export const LEAD_ASSIGNED_STATUSES = ['Agent Assigned', 'Verification In Progress']
// the customer was not at home: the office's "Partially verified"
export const LEAD_PARTIAL_STATUSES = ['Partially Verified']

export type LeadView = 'pending' | 'done' | 'returned'
export const LEAD_VIEWS: LeadView[] = ['pending', 'done', 'returned']
// a view query value, or '' when it is not one of the three
export const parseView = (v: string | null | undefined): LeadView | '' => (LEAD_VIEWS as string[]).includes(v || '') ? v as LeadView : ''

// The guarantor's In Progress part of a lead that is in progress: Not completed / Completed / Returned
export function viewOf(status: string): LeadView {
  return LEAD_DONE_STATUSES.includes(status) ? 'done' : status === 'Returned' ? 'returned' : 'pending'
}

export type LeadStage = 'new' | 'assigned' | 'partial' | 'completed'
// The office's New-leads part of an in-progress lead ('' for Returned, Converted and Rejected, which are in no part)
export function stageOf(status: string): LeadStage | '' {
  if (['Returned', 'Converted', 'Rejected'].includes(status)) return ''
  return LEAD_ASSIGNED_STATUSES.includes(status) ? 'assigned' : LEAD_DONE_STATUSES.includes(status) ? 'completed'
    : LEAD_PARTIAL_STATUSES.includes(status) ? 'partial' : 'new'
}

// Week totals for the week headers of one page of a list sorted newest first. Weeks in the middle of the page are
// complete on it; only the first week (when there is an earlier page) and the last week (when there is a later page)
// can run over pages, so only those need counting (`edges`). `totals` holds the counts of the rows on this page.
export function pageWeekTotals(dates: string[], page: number, totalPages: number): { totals: Record<string, number>; edges: string[] } {
  const totals: Record<string, number> = {}
  const order: string[] = []
  for (const d of dates) {
    const m = mondayOf(d || '')
    if (!m) continue
    if (!(m in totals)) { totals[m] = 0; order.push(m) }
    totals[m]++
  }
  const edges: string[] = []
  if (order.length && page > 1) edges.push(order[0])
  if (order.length && page < totalPages && !edges.includes(order[order.length - 1])) edges.push(order[order.length - 1])
  return { totals, edges }
}

// The latest day a lead can be filed under: the Sunday of next week (the Submit Lead page offers weekdays up to next
// week's Friday; the server allows the whole of next week)
export const lastLeadDay = (today: string) => addDays(mondayOf(today), 13)
