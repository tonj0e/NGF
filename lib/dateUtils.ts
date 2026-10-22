/**
 * IST (Indian Standard Time) Date Utilities
 *
 * Server runs in UTC but business logic operates in IST (UTC+5:30).
 * Use these utilities instead of native Date methods for date boundaries.
 *
 * IST Offset: 5.5 hours = 19,800,000 milliseconds
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000 // 19,800,000

/**
 * Get current timestamp adjusted to IST
 */
export function nowIST(): Date {
  return new Date(Date.now() + IST_OFFSET_MS)
}

/**
 * Get today's date in IST as YYYY-MM-DD string
 */
export function getTodayIST(): string {
  return nowIST().toISOString().slice(0, 10)
}

/**
 * First weekly payment date for a loan handed over today (IST): always the NEXT Saturday after today.
 * Wed or Fri -> this coming Saturday. Saturday -> a week later. (Owner's rule, 2026-10-21.)
 */
export function firstPaymentSaturdayIST(): string {
  const d = nowIST()
  const day = d.getUTCDay()               // 0 Sun .. 6 Sat
  const diff = ((6 - day + 7) % 7) || 7
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().slice(0, 10)
}

/**
 * Get current date-time in IST as ISO string
 */
export function getNowIST(): string {
  return nowIST().toISOString()
}

/**
 * Convert a date string (YYYY-MM-DD) to a Date object in IST midnight
 */
export function parseDateIST(dateStr: string): Date {
  // Parse as ISO in IST timezone, not local
  return new Date(`${dateStr}T00:00:00.000+05:30`)
}

/**
 * Get the week number for a date in IST
 * Week 1 = first week with a Saturday (matching business logic)
 */
export function getWeekNoIST(dateStr: string, startDateStr: string): number {
  const date = parseDateIST(dateStr)
  const start = parseDateIST(startDateStr)
  const diffMs = date.getTime() - start.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  return Math.floor(diffDays / 7) + 1
}

/**
 * Get the nearest upcoming Saturday in IST
 * If today is Saturday, returns today
 */
export function getThisSaturday(): string {
  const d = nowIST()
  const day = d.getUTCDay() // 0=Sun, 6=Sat
  const diff = day === 6 ? 0 : (6 - day)
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().slice(0, 10)
}

/**
 * Get the Saturday after the upcoming one (always +7 days from this Saturday)
 */
export function getNextSaturday(): string {
  const d = nowIST()
  const day = d.getUTCDay()
  const diff = day === 6 ? 0 : (6 - day)
  d.setUTCDate(d.getUTCDate() + diff + 7)
  return d.toISOString().slice(0, 10)
}

/**
 * Add days to a date (dateStr in YYYY-MM-DD format)
 * Returns new date in YYYY-MM-DD
 */
// A calendar date as UTC midnight: getUTC* then reads the same day as the string. (parseDateIST is IST midnight = the previous
// day 18:30 UTC, so using it with setUTCDate/getUTCDay/toISOString was one day early.)
const calDate = (dateStr: string): Date => new Date(`${dateStr}T00:00:00.000Z`)

export function addDaysIST(dateStr: string, days: number): string {
  const d = calDate(dateStr)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Get start of week (Monday) in IST for a given date
 */
export function getWeekStartIST(dateStr: string): string {
  const d = calDate(dateStr)
  const day = d.getUTCDay() // 0=Sun, 1=Mon...
  const diff = day === 0 ? -6 : (1 - day) // Monday = 1
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().slice(0, 10)
}

/**
 * Get end of week (Sunday) in IST for a given date
 */
export function getWeekEndIST(dateStr: string): string {
  const d = calDate(dateStr)
  const day = d.getUTCDay()
  const diff = day === 0 ? 0 : (7 - day) // Sunday = 0
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().slice(0, 10)
}

/**
 * Check if a date is overdue (before today in IST)
 */
export function isOverdueIST(dueDateStr: string): boolean {
  return dueDateStr < getTodayIST()
}

/**
 * Check if a date is today in IST
 */
export function isTodayIST(dateStr: string): boolean {
  return dateStr === getTodayIST()
}

/**
 * Check if a date is this Saturday in IST
 */
export function isThisSaturdayIST(dateStr: string): boolean {
  return dateStr === getThisSaturday()
}

/**
 * Check if a date is next Saturday in IST
 */
export function isNextSaturdayIST(dateStr: string): boolean {
  return dateStr === getNextSaturday()
}

/**
 * Format a date for display (DD/MM/YYYY)
 */
export function formatDisplayIST(dateStr: string): string {
  const d = calDate(dateStr)
  const day = String(d.getUTCDate()).padStart(2, '0')
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const year = d.getUTCFullYear()
  return `${day}/${month}/${year}`
}

/**
 * Get current time in IST as HH:MM
 */
export function getCurrentTimeIST(): string {
  const d = nowIST()
  const hours = String(d.getUTCHours()).padStart(2, '0')
  const minutes = String(d.getUTCMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

/**
 * Get current date-time in IST for database timestamps
 */
export function nowISTForDB(): string {
  return getNowIST()
}

/**
 * Convert a due date string to the Saturday it belongs to
 * (used for weekly collection scheduling)
 */
export function dueDateToSaturday(dueDateStr: string): string {
  const d = calDate(dueDateStr)
  const day = d.getUTCDay()
  const diff = day === 6 ? 0 : (6 - day)
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().slice(0, 10)
}

/**
 * Generate a full repayment schedule from start date
 * Returns array of { dueDate, weekNo }
 */
export function generateSchedule(startDateStr: string, durationWeeks: number): Array<{ dueDate: string; weekNo: number }> {
  const schedule: Array<{ dueDate: string; weekNo: number }> = []
  for (let w = 0; w < durationWeeks; w++) {
    const due = addDaysIST(startDateStr, w * 7)
    schedule.push({ dueDate: due, weekNo: w + 1 })
  }
  return schedule
}

/**
 * Get the most recent Saturday (could be today if Saturday)
 */
export function getMostRecentSaturday(): string {
  const d = nowIST()
  const day = d.getUTCDay()
  const diff = day === 6 ? 0 : -(day + 1) // go back to last Saturday
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().slice(0, 10)
}

/**
 * Check if date is within the current collection week (Saturday to Friday)
 */
export function isInCurrentCollectionWeek(dateStr: string): boolean {
  const today = getTodayIST()
  const thisSat = getThisSaturday()
  const nextSat = getNextSaturday()

  if (today === thisSat) {
    // Today is Saturday - current week is this Saturday to next Friday
    return dateStr >= thisSat && dateStr < nextSat
  } else if (today > thisSat) {
    // We're in the week after this Saturday
    return dateStr >= thisSat && dateStr < nextSat
  } else {
    // We're before this Saturday - previous week
    const prevSat = addDaysIST(thisSat, -7)
    return dateStr >= prevSat && dateStr < thisSat
  }
}