import { readTable, appendRow, nowIso, invalidateCache } from './supabase-db'
import { APP_CONFIG } from './config'

export type LoanProduct = {
  key: string
  label: string
  principal: number
  durationWeeks: number
  weeklyCollection: number
  lastWeekCollection: number
  totalCollection: number
  interestDeduction: number
  guarantorCommission: number
  netDisbursed: number
}

export function toRow(p: LoanProduct): Record<string, string> {
  return {
    'Key': p.key, 'Label': p.label,
    'Principal': String(p.principal), 'Duration Weeks': String(p.durationWeeks),
    'Weekly Collection': String(p.weeklyCollection), 'Last Week Collection': String(p.lastWeekCollection),
    'Total Collection': String(p.totalCollection), 'Interest Deduction': String(p.interestDeduction),
    'Guarantor Commission': String(p.guarantorCommission), 'Net Disbursed': String(p.netDisbursed),
    'Status': 'Active', 'Created At': nowIso(),
  }
}

export function fromRow(r: Record<string, string>): LoanProduct {
  const weekly = Number(r['Weekly Collection'] || 0)
  const weeks = Number(r['Duration Weeks'] || 0)
  const total = Number(r['Total Collection'] || 0)
  const lastWeek = r['Last Week Collection'] ? Number(r['Last Week Collection']) : (total - weekly * Math.max(0, weeks - 1))
  return {
    key: r['Key'], label: r['Label'] || r['Key'],
    principal: Number(r['Principal'] || 0), durationWeeks: weeks,
    weeklyCollection: weekly, lastWeekCollection: lastWeek,
    totalCollection: total, interestDeduction: Number(r['Interest Deduction'] || 0),
    guarantorCommission: Number(r['Guarantor Commission'] || 0), netDisbursed: Number(r['Net Disbursed'] || 0),
  }
}

// The built-in products, used to seed the sheet on first use
export function defaults(): LoanProduct[] {
  return APP_CONFIG.LOAN_PRODUCTS.map(p => ({
    key: p.key, label: p.label, principal: p.principal, durationWeeks: p.durationWeeks,
    weeklyCollection: p.weeklyCollection, lastWeekCollection: p.weeklyCollection,
    totalCollection: p.totalCollection, interestDeduction: p.interestDeduction,
    guarantorCommission: p.guarantorCommission, netDisbursed: p.netDisbursed,
  }))
}

export async function getLoanProducts(options?: { forceFresh?: boolean }): Promise<LoanProduct[]> {
  if (options?.forceFresh) {
    invalidateCache('LoanProducts')
  }
  let rows = await readTable('LoanProducts')
  if (rows.length === 0) {
    for (const p of defaults()) await appendRow('LoanProducts', toRow(p))
    rows = await readTable('LoanProducts')
  }
  return rows.filter(r => r['Status'] !== 'Deleted').map(fromRow)
}

export async function findLoanProduct(key: string): Promise<LoanProduct | undefined> {
  invalidateCache('LoanProducts')
  let rows = await readTable('LoanProducts')
  if (rows.length === 0) {
    for (const p of defaults()) await appendRow('LoanProducts', toRow(p))
    rows = await readTable('LoanProducts')
  }
  const products = rows.map(fromRow)
  return products.find(p => p.key === key || p.label === key)
}
