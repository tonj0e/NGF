// Lending projection engine.
// Models a revolving micro-loan book where interest is taken upfront and weekly
// collections are re-lent. "Compounding" mode re-lends all surplus each week.

export type ProjectionMode = 'none' | 'fixed' | 'all'

export interface ProjectionInput {
  capital: number          // starting cash to deploy
  cashPerLoan: number      // D — cash actually disbursed per loan (e.g. 9000)
  profitPerLoan: number    // I — interest/profit per loan (e.g. 1000)
  termWeeks: number        // T — loan length in weeks (e.g. 10)
  mode: ProjectionMode     // reinvestment strategy
  fixedWeekly?: number     // for 'fixed' mode: cash re-lent per week
  horizonWeeks?: number    // simulation length (default 52)
}

export interface ProjectionPeriod {
  label: string
  weeks: number
  loans: number
  profit: number
  returnPct: number
  capital: number
}

export interface ProjectionResult {
  totalLoans: number
  totalProfit: number
  yearReturnPct: number
  perDayPct: number
  periods: ProjectionPeriod[]
  curve: { week: number; collection: number; funded: number; cumProfit: number }[]
}

export function project(input: ProjectionInput): ProjectionResult {
  const { capital, cashPerLoan: D, profitPerLoan: I, termWeeks: T, mode, fixedWeekly = 0 } = input
  const H = input.horizonWeeks ?? 52
  const R = (D + I) / T // weekly repayment per loan

  let cash = capital
  let totalFunded = 0
  const rem = new Array(T + 1).fill(0) // rem[r] = loans with r weekly payments left
  const fund = (n: number) => { if (n > 0) { rem[T] += n; cash -= n * D; totalFunded += n } }

  if (capital > 0 && D > 0 && T > 0) fund(Math.floor(cash / D)) // initial deployment

  const curve: ProjectionResult['curve'] = []
  for (let w = 1; w <= H; w++) {
    let active = 0
    for (let r = 1; r <= T; r++) active += rem[r]
    const collection = active * R
    cash += collection
    for (let r = 1; r < T; r++) rem[r] = rem[r + 1] // age loans
    rem[T] = 0
    let n = 0
    if (D > 0) {
      if (mode === 'all') n = Math.floor(cash / D)
      else if (mode === 'fixed') n = Math.floor(Math.min(cash, fixedWeekly) / D)
    }
    fund(n)
    curve.push({ week: w, collection: Math.round(collection), funded: n, cumProfit: totalFunded * I })
  }

  const snap = (w: number): ProjectionPeriod => {
    const e = curve[Math.min(Math.max(w, 1), H) - 1]
    const profit = e ? e.cumProfit : 0
    const loans = profit / (I || 1)
    // Calculate capital at this week: cash after funding loans for this week
    // We need to track cash at each week. The curve stores funded count per week.
    // At week w, cash = capital + total collections - total funded * D
    let weekCash = capital
    for (let i = 1; i <= w; i++) {
      const curveEntry = curve[i - 1]
      if (curveEntry) {
        weekCash += curveEntry.collection
        weekCash -= curveEntry.funded * D
      }
    }
    return { label: '', weeks: w, loans, profit, returnPct: capital ? +(profit / capital * 100).toFixed(1) : 0, capital: Math.max(0, weekCash) }
  }

  const periods: ProjectionPeriod[] = [
    { ...snap(1), label: '1 Week' },
    { ...snap(4), label: '1 Month' },
    { ...snap(T), label: `${T}-Week Cycle` },
    { ...snap(26), label: '6 Months' },
    { ...snap(52), label: '1 Year' },
  ]

  const yearProfit = totalFunded * I
  const yearReturnPct = capital ? +(yearProfit / capital * 100).toFixed(1) : 0

  return {
    totalLoans: totalFunded,
    totalProfit: yearProfit,
    yearReturnPct,
    perDayPct: +(yearReturnPct / 365).toFixed(2),
    periods,
    curve,
  }
}
