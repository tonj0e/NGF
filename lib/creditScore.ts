// NGF Score (our own 0 to 850 score, not a CIBIL score): built from the repayment history and the staff reviews in the database.
// Pure functions: no database access, so the rules can be tested and changed in one place.
//
// RULES (owner's first draft, to be finalised):
//  * A payment recorded on or before 3:30 pm IST on its Saturday is on time and costs nothing.
//  * Finishing a whole loan cycle adds points. Each next loan adds the next step, so a customer who never slips climbs
//    200, 400, 600, 750, 850 and then stays frozen (about 4.7 ten-week cycles fit in a year).
//  * A late payment costs points; a week that is overdue and still unpaid costs more.
//  * Staff reviews (1-5 stars, left when a payment is collected) add or remove a few points: 5 stars +4, 4 stars +2, 3 stars 0, 2 stars -4, 1 star -8,
//    and the total from reviews can never move the score by more than 100 either way.
export const SCORE_RULES = {
  cutoffTime: '15:30',              // IST, on the due Saturday
  max: 850,
  cycleSteps: [200, 200, 200, 150, 100], // points for the 1st, 2nd, 3rd ... completed loan (later loans add nothing)
  latePenalty: 10,                  // recorded after the cutoff
  extraPerLateWeek: 10,             // for every further full week of delay
  overduePenalty: 20,               // a past-due week that is still unpaid (per week)
  reviewPoints: { 5: 4, 4: 2, 3: 0, 2: -4, 1: -8 } as Record<number, number>, // per reviewed payment
  reviewCap: 100,                   // reviews never move the score by more than this, up or down
  bands: [
    { min: 750, label: 'Excellent' },
    { min: 600, label: 'Good' },
    { min: 400, label: 'Fair' },
    { min: 1, label: 'Building' },
    { min: 0, label: 'New' },
  ],
}

export type WeekInput = {
  weekNo: number
  dueDate: string                   // YYYY-MM-DD (the Saturday)
  amount: number
  status: string                    // Paid | Pending | Delayed | Waived
  paidDate: string | null           // YYYY-MM-DD
  recordedAt: string | null         // ISO timestamp of when the payment was entered in the system
  rating?: number                   // staff review, 1-5 stars (0 or missing = no review)
}

export type LoanInput = {
  loanId: string
  status: string
  startDate: string
  durationWeeks: number
  weeks: WeekInput[]
}

export type WeekResult = WeekInput & {
  outcome: 'on-time' | 'late' | 'overdue' | 'upcoming' | 'waived'
  lateMinutes: number               // for paid-late and overdue weeks
  estimated: boolean                // true when only a paid date (no timestamp) was available
  penalty: number
}

export type LoanResult = {
  loanId: string
  status: string
  startDate: string
  durationWeeks: number
  weeks: WeekResult[]
  paidWeeks: number
  onTimeWeeks: number
  lateWeeks: number
  overdueWeeks: number
  completed: boolean                // every week Paid (or Waived)
  points: number                    // cycle points earned (0 until completed)
  penalty: number
}

export type ScoreResult = {
  value: number
  max: number
  band: string
  completedLoans: number
  onTimeRate: number | null         // 0-100, over paid weeks
  parts: { cyclePoints: number; penalties: number; reviewPoints: number }   // how the number was made
  reviews: { count: number; average: number | null }
  inProgress: { loanId: string; paidWeeks: number; totalWeeks: number; nextPoints: number } | null
  loans: LoanResult[]
  rules: typeof SCORE_RULES
}

const IST = '+05:30'
export const cutoffOf = (dueDate: string) => Date.parse(`${dueDate}T${SCORE_RULES.cutoffTime}:00${IST}`)

export function evaluateWeek(w: WeekInput, nowMs: number): WeekResult {
  const cutoff = cutoffOf(w.dueDate)
  const base = { ...w, lateMinutes: 0, estimated: false, penalty: 0 }
  if (w.status === 'Waived') return { ...base, outcome: 'waived' }

  if (w.status === 'Paid') {
    let paidAt: number | null = w.recordedAt ? Date.parse(w.recordedAt) : null
    let estimated = false
    if (paidAt == null || Number.isNaN(paidAt)) {
      // Older rows have no timestamp: trust the paid date (end of that day if it is after the Saturday)
      estimated = true
      paidAt = w.paidDate ? (w.paidDate <= w.dueDate ? cutoff : Date.parse(`${w.paidDate}T23:59:00${IST}`)) : cutoff
    }
    if (paidAt <= cutoff) return { ...base, outcome: 'on-time', estimated }
    const lateMinutes = Math.round((paidAt - cutoff) / 60000)
    const extraWeeks = Math.floor(lateMinutes / (7 * 24 * 60))
    const penalty = SCORE_RULES.latePenalty + extraWeeks * SCORE_RULES.extraPerLateWeek
    return { ...base, outcome: 'late', lateMinutes, estimated, penalty }
  }

  // Not paid yet
  if (nowMs > cutoff) {
    const lateMinutes = Math.round((nowMs - cutoff) / 60000)
    return { ...base, outcome: 'overdue', lateMinutes, penalty: SCORE_RULES.overduePenalty }
  }
  return { ...base, outcome: 'upcoming' }
}

export function bandOf(value: number, hasLoans: boolean): string {
  if (!hasLoans) return 'New'
  if (value < 1) return 'Building'
  return SCORE_RULES.bands.find(b => value >= b.min)?.label || 'Building'
}

export function computeScore(loans: LoanInput[], nowMs: number = Date.now()): ScoreResult {
  const ordered = [...loans].sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)))
  let completedCount = 0
  let totalPoints = 0
  let totalPenalty = 0
  let paidWeeksAll = 0, onTimeAll = 0
  let ratingSum = 0, ratingCount = 0, reviewRaw = 0
  const results: LoanResult[] = []

  for (const l of ordered) {
    const weeks = l.weeks.map(w => evaluateWeek(w, nowMs)).sort((a, b) => a.weekNo - b.weekNo)
    const paid = weeks.filter(w => w.outcome === 'on-time' || w.outcome === 'late')
    const completed = weeks.length > 0 && weeks.every(w => w.outcome === 'on-time' || w.outcome === 'late' || w.outcome === 'waived')
    let points = 0
    if (completed) {
      points = SCORE_RULES.cycleSteps[completedCount] ?? 0
      completedCount++
    }
    const penalty = weeks.reduce((s, w) => s + w.penalty, 0)
    for (const w of l.weeks) { const r = Number(w.rating) || 0; if (r >= 1 && r <= 5) { ratingSum += r; ratingCount++; reviewRaw += SCORE_RULES.reviewPoints[r] ?? 0 } }
    totalPoints += points
    totalPenalty += penalty
    paidWeeksAll += paid.length
    onTimeAll += paid.filter(w => w.outcome === 'on-time').length
    results.push({
      loanId: l.loanId, status: l.status, startDate: l.startDate, durationWeeks: l.durationWeeks, weeks,
      paidWeeks: paid.length, onTimeWeeks: paid.filter(w => w.outcome === 'on-time').length,
      lateWeeks: paid.filter(w => w.outcome === 'late').length, overdueWeeks: weeks.filter(w => w.outcome === 'overdue').length,
      completed, points, penalty,
    })
  }

  const reviewPoints = Math.max(-SCORE_RULES.reviewCap, Math.min(SCORE_RULES.reviewCap, reviewRaw))
  const value = Math.max(0, Math.min(SCORE_RULES.max, totalPoints - totalPenalty + reviewPoints))
  const open = [...results].reverse().find(r => !r.completed && r.weeks.length > 0)
  return {
    value, max: SCORE_RULES.max, band: bandOf(value, results.length > 0), completedLoans: completedCount,
    onTimeRate: paidWeeksAll ? Math.round((onTimeAll / paidWeeksAll) * 100) : null,
    parts: { cyclePoints: totalPoints, penalties: totalPenalty, reviewPoints },
    reviews: { count: ratingCount, average: ratingCount ? Math.round((ratingSum / ratingCount) * 10) / 10 : null },
    inProgress: open ? { loanId: open.loanId, paidWeeks: open.paidWeeks, totalWeeks: open.weeks.length, nextPoints: SCORE_RULES.cycleSteps[completedCount] ?? 0 } : null,
    loans: results, rules: SCORE_RULES,
  }
}
