import { readTable } from './supabase-db'

// Deposit ledger transaction types
export const TXN_DEPOSIT = 'Deposit'
export const TXN_INTEREST_PAYOUT = 'Interest Payout'
export const TXN_PRINCIPAL_WITHDRAWAL = 'Principal Withdrawal'

export type DepositTxn = { type: string; amount: number; date: string }

export type DepositSettings = {
  ratePerCycle: number       // percent paid per completed cycle (4% ≈ 12%/yr over 3 cycles)
  cycleDays: number          // length of an interest cycle (122 days)
  principalWithdrawEnabled: boolean
}

export const DEFAULT_DEPOSIT_SETTINGS: DepositSettings = { ratePerCycle: 4, cycleDays: 122, principalWithdrawEnabled: false }

export type DepositAccount = {
  principal: number
  totalDeposited: number
  totalPrincipalWithdrawn: number
  totalInterestPaid: number
  interestPerCycle: number
  completedCycles: number
  availableInterest: number
  cycleStart: string | null
  nextWithdrawalDate: string | null
  daysRemaining: number
  canWithdrawInterest: boolean
  firstDepositDate: string | null
  ratePerCycle: number
  cycleDays: number
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function daysBetween(a: string, b: string): number {
  return Math.floor((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000)
}
function addDaysStr(d: string, n: number): string {
  const dt = new Date(d + 'T00:00:00'); dt.setDate(dt.getDate() + n); return ymd(dt)
}

export async function getDepositSettings(): Promise<DepositSettings> {
  const rows = await readTable('Settings')
  const get = (k: string, d: string) => rows.find(r => r['Key'] === k)?.['Value'] ?? d
  return {
    ratePerCycle: Number(get('deposit:rate', '4')) || 4,
    cycleDays: Number(get('deposit:cycleDays', '122')) || 122,
    principalWithdrawEnabled: get('deposit:principalWithdraw', '0') === '1',
  }
}

// Compute a guarantor's deposit account from their ledger transactions
export function computeDepositAccount(txns: DepositTxn[], settings: DepositSettings, today = ymd(new Date())): DepositAccount {
  const sum = (t: string) => txns.filter(x => x.type === t).reduce((s, x) => s + x.amount, 0)
  const totalDeposited = sum(TXN_DEPOSIT)
  const totalPrincipalWithdrawn = sum(TXN_PRINCIPAL_WITHDRAWAL)
  const totalInterestPaid = sum(TXN_INTEREST_PAYOUT)
  const principal = Math.max(0, totalDeposited - totalPrincipalWithdrawn)

  const depositDates = txns.filter(t => t.type === TXN_DEPOSIT).map(t => t.date).sort()
  const payoutDates = txns.filter(t => t.type === TXN_INTEREST_PAYOUT).map(t => t.date).sort()
  const firstDepositDate = depositDates[0] || null
  const lastPayoutDate = payoutDates.length ? payoutDates[payoutDates.length - 1] : null
  const cycleStart = lastPayoutDate || firstDepositDate

  let completedCycles = 0, daysRemaining = 0, nextWithdrawalDate: string | null = null
  if (cycleStart) {
    const elapsed = Math.max(0, daysBetween(cycleStart, today))
    completedCycles = Math.floor(elapsed / settings.cycleDays)
    const intoCycle = elapsed % settings.cycleDays
    daysRemaining = completedCycles >= 1 ? 0 : (settings.cycleDays - intoCycle)
    nextWithdrawalDate = addDaysStr(cycleStart, Math.max(1, completedCycles) * settings.cycleDays)
  }

  const interestPerCycle = principal * (settings.ratePerCycle / 100)
  const availableInterest = Math.round(interestPerCycle * completedCycles)

  return {
    principal, totalDeposited, totalPrincipalWithdrawn, totalInterestPaid,
    interestPerCycle, completedCycles, availableInterest,
    cycleStart, nextWithdrawalDate, daysRemaining,
    canWithdrawInterest: completedCycles >= 1 && availableInterest > 0,
    firstDepositDate,
    ratePerCycle: settings.ratePerCycle, cycleDays: settings.cycleDays,
  }
}
