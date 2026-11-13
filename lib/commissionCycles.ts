import { addDaysIST, getTodayIST } from './dateUtils'

// Guarantor commission cycles.
//   A cycle is 5 whole weeks (Monday to Sunday, 35 days). The first cycle starts on the guarantor's start Monday
//   (Guarantors."Commission Start"); the next one starts the day after the last ends, and so on, back to back.
//   Every loan earns its commission in the week it was disbursed. A cycle ends on a Sunday; the payout is the next working day (Monday to Friday).
export const CYCLE_DAYS = 35

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const dow = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay()   // 0 Sunday ... 6 Saturday
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000)

/** The date (IST) of a stored timestamp such as "2026-10-28 18:40:50.047+00" */
export function istDay(ts: string): string {
  const t = String(ts || '').trim().replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00')
  const ms = Date.parse(t)
  return Number.isFinite(ms) ? new Date(ms + 5.5 * 3600_000).toISOString().slice(0, 10) : ''
}
export const mondayOnOrBefore = (d: string) => addDaysIST(d, -((dow(d) + 6) % 7))
export const mondayOnOrAfter = (d: string) => addDaysIST(d, (8 - dow(d)) % 7)
/** Payouts are made Monday to Friday only: the first such day on or after `d` */
export const workingDayOnOrAfter = (d: string) => { const w = dow(d); return w === 6 ? addDaysIST(d, 2) : w === 0 ? addDaysIST(d, 1) : d }

export interface CycleWeek { start: string; end: string; loans: number; amount: number }
export type CycleStatus = 'running' | 'ready' | 'requested' | 'paid'
export interface CommissionCycle {
  index: number; start: string; end: string; payoutDate: string
  weeks: CycleWeek[]; loans: number; amount: number
  status: CycleStatus; dayOfCycle: number; daysLeft: number
  payoutId: string; receiptNo: string; paidAt: string; paidNote: string
}
export interface CommissionOverview {
  startMonday: string | null; today: string
  current: CommissionCycle | null          // the cycle running today
  cycles: CommissionCycle[]                // newest first, the running one included
  ready: CommissionCycle | null            // the oldest ended cycle not yet requested or paid
  earned: number; paid: number; pending: number; available: number   // across all cycles; available = ended cycles not yet requested or paid
}

export function receiptNumber(guarantorCode: string, cycleStart: string): string {
  return `NGFR-${String(guarantorCode || 'G').toUpperCase().replace(/[^A-Z0-9]/g, '')}-${cycleStart.replace(/-/g, '')}`
}

type Row = Record<string, string>

/** Build every cycle up to today for one guarantor.
 *  `loans`: that guarantor's loan rows ("Created At" = disbursement, "Guarantor Commission"). `payouts`: their PayoutRequests rows.
 *  `commissionStart`: Guarantors."Commission Start"; with none set, the cycle starts on the Monday of the week of their first loan. */
export function buildOverview(loans: Row[], payouts: Row[], commissionStart: string | null | undefined, today = getTodayIST()): CommissionOverview {
  const dated = loans.map(l => ({ day: istDay(l['Created At']), amount: Number(l['Guarantor Commission'] || 0) })).filter(l => l.day && l.amount > 0)
  let anchor: string | null = null
  if (commissionStart && /^\d{4}-\d{2}-\d{2}/.test(commissionStart)) anchor = mondayOnOrAfter(commissionStart.slice(0, 10))
  else if (dated.length) anchor = mondayOnOrBefore(dated.map(l => l.day).sort()[0])
  const empty: CommissionOverview = { startMonday: anchor, today, current: null, cycles: [], ready: null, earned: 0, paid: 0, pending: 0, available: 0 }
  if (!anchor || today < anchor) return empty

  const live = payouts.filter(p => p['Status'] === 'Paid' || p['Status'] === 'Pending')
  const cycles: CommissionCycle[] = []
  const count = Math.floor(daysBetween(anchor, today) / CYCLE_DAYS) + 1
  for (let i = 0; i < count; i++) {
    const start = addDaysIST(anchor, i * CYCLE_DAYS), end = addDaysIST(start, CYCLE_DAYS - 1)
    const weeks: CycleWeek[] = []
    for (let w = 0; w < 5; w++) {
      const ws = addDaysIST(start, w * 7), we = addDaysIST(ws, 6)
      const inWeek = dated.filter(l => l.day >= ws && l.day <= we)
      weeks.push({ start: ws, end: we, loans: inWeek.length, amount: r2(inWeek.reduce((t, l) => t + l.amount, 0)) })
    }
    const pay = live.find(p => String(p['Cycle Start'] || '').slice(0, 10) === start)
    const ended = today >= end
    const status: CycleStatus = pay ? (pay['Status'] === 'Paid' ? 'paid' : 'requested') : ended ? 'ready' : 'running'
    cycles.push({
      index: i + 1, start, end, payoutDate: workingDayOnOrAfter(addDaysIST(end, 1)),
      weeks, loans: weeks.reduce((t, w) => t + w.loans, 0), amount: r2(weeks.reduce((t, w) => t + w.amount, 0)),
      status, dayOfCycle: Math.min(CYCLE_DAYS, daysBetween(start, today) + 1), daysLeft: Math.max(0, daysBetween(today, end)),
      payoutId: pay?.['Payout ID'] || '', receiptNo: pay?.['Receipt No'] || '', paidAt: pay?.['Status'] === 'Paid' ? String(pay['Processed At'] || '') : '', paidNote: pay?.['Notes'] || '',
    })
  }
  const sumOf = (f: (c: CommissionCycle) => boolean) => r2(cycles.filter(f).reduce((t, c) => t + c.amount, 0))
  const ready = cycles.find(c => c.status === 'ready' && c.amount > 0) || null
  return {
    startMonday: anchor, today,
    current: cycles.find(c => today >= c.start && today <= c.end) || null,
    cycles: [...cycles].reverse(), ready,
    earned: sumOf(() => true), paid: sumOf(c => c.status === 'paid'), pending: sumOf(c => c.status === 'requested'), available: sumOf(c => c.status === 'ready'),
  }
}
