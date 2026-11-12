import { readTable } from './supabase-db'
import { addDaysIST, getTodayIST } from './dateUtils'
import type { Session } from '../types'

export const CYCLE_DAYS = 35
export const PERM_GP_COMMISSIONS = 'gp:commissions'

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export interface CommissionCycle { start: string; end: string; amount: number; past: boolean }
export interface CommissionSummary {
  earned: number; eligible: number; locked: number; paid: number; pending: number; available: number
  todayIST: string; nextPayoutDate: string | null; cycles: CommissionCycle[]
}

/** Group loans (with a start date and commission) into consecutive 35-day cycles. */
export function buildCycles(loans: Record<string, string>[], today = getTodayIST()): CommissionCycle[] {
  let remaining = loans
    .filter(l => l['Start Date'] && Number(l['Guarantor Commission'] || 0) > 0)
    .sort((a, b) => a['Start Date'].localeCompare(b['Start Date']))
  const cycles: CommissionCycle[] = []
  while (remaining.length > 0) {
    const start = remaining[0]['Start Date']
    const end = addDaysIST(start, CYCLE_DAYS)
    const inCycle = remaining.filter(l => l['Start Date'] < end)
    remaining = remaining.filter(l => l['Start Date'] >= end)
    cycles.push({
      start, end,
      amount: r2(inCycle.reduce((s, l) => s + Number(l['Guarantor Commission'] || 0), 0)),
      past: end <= today,
    })
  }
  return cycles
}

/** Commission an Admin or Staff recorded straight in the cash book (Settlements) without a payout request. A settlement that names a
 *  payout (PYOUT...) is the same money as that payout row, so it is not counted twice. */
export function manualCommissionPaid(settlements: Record<string, string>[]): number {
  return r2(settlements.filter(s => s['Entity Type'] === 'GuarantorCommission' && !/PYOUT\d+/.test(String(s['Notes'] || '')))
    .reduce((t, s) => t + Number(s['Amount Submitted'] || 0), 0))
}

export function computeSummary(
  guarantorLoans: Record<string, string>[], payouts: Record<string, string>[], today = getTodayIST(), manualPaid = 0,
): CommissionSummary {
  const cycles = buildCycles(guarantorLoans, today)
  const earned = r2(cycles.reduce((s, c) => s + c.amount, 0))
  const eligible = r2(cycles.filter(c => c.past).reduce((s, c) => s + c.amount, 0))
  const sumBy = (st: string) => r2(payouts.filter(p => p['Status'] === st).reduce((s, p) => s + Number(p['Amount'] || 0), 0))
  const paid = r2(sumBy('Paid') + manualPaid)
  const pending = sumBy('Pending')
  const future = cycles.filter(c => !c.past).map(c => c.end).sort()
  return {
    earned, eligible, locked: r2(Math.max(0, earned - eligible)), paid, pending,
    available: r2(Math.max(0, eligible - paid - pending)),
    todayIST: today, nextPayoutDate: future[0] ?? null, cycles,
  }
}

function permsOf(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[]
  return String(raw || '').split(',').map(s => s.trim()).filter(Boolean)
}

/** Guarantor with no custom page list keeps every page; with one, needs gp:commissions. Non-guarantors: true. */
export async function guarantorCanSeeCommissions(session: Session): Promise<boolean> {
  if (session.role !== 'Guarantor') return true
  const acc = await readTable('StaffAccess', { forceFresh: true })
  const mine = acc.find(a => a['User ID'] === session.userId)
  const perms = permsOf(mine?.['Permissions'])
  if (!perms.includes('pages:custom')) return true
  return perms.includes(PERM_GP_COMMISSIONS)
}
