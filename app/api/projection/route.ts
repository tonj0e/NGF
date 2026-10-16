import { NextRequest } from 'next/server'
import { apiHandler, requireRole, ok } from '@/lib/api'
import { readTable } from '@/lib/supabase-db'
import { project, ProjectionMode } from '@/lib/projection'
import { APP_CONFIG } from '@/lib/config'

export const GET = apiHandler(async (req: NextRequest) => {
  await requireRole(req, ['Admin'])
  const { searchParams } = new URL(req.url)
  const num = (k: string) => { const v = searchParams.get(k); return v == null || v === '' ? null : Number(v) }

  // Default loan economics from the base product (10K10W): cash out = net disbursed +
  // commission; profit = interest deduction − commission.
  const p = APP_CONFIG.LOAN_PRODUCTS[0]
  const defCash = p.netDisbursed + p.guarantorCommission
  const defProfit = p.interestDeduction - p.guarantorCommission
  const defTerm = p.durationWeeks

  // Default capital base = live available capital (lendable cash).
  let defCapital = 100000
  if (num('capital') == null) {
    const [capital, loans, repayments] = await Promise.all([
      readTable('Capital', { forceFresh: true }), readTable('Loans', { forceFresh: true }), readTable('Repayments', { forceFresh: true }),
    ])
    const totalCapital = capital.reduce((s, c) => s + Number(c['Amount'] || 0), 0)
    const totalPrincipal = loans.reduce((s, l) => s + Number(l['Principal Amount'] || 0), 0)
    const totalCollected = repayments.filter(r => r['Status'] === 'Paid').reduce((s, r) => s + Number(r['Amount'] || 0), 0)
    defCapital = Math.max(0, totalCapital - totalPrincipal + totalCollected)
  }

  const mode = (searchParams.get('mode') as ProjectionMode) || 'all'
  const result = project({
    capital: num('capital') ?? defCapital,
    cashPerLoan: num('cashPerLoan') ?? defCash,
    profitPerLoan: num('profitPerLoan') ?? defProfit,
    termWeeks: num('termWeeks') ?? defTerm,
    mode: ['none', 'fixed', 'all'].includes(mode) ? mode : 'all',
    fixedWeekly: num('fixedWeekly') ?? (defCash + defProfit),
    horizonWeeks: num('horizonWeeks') ?? 52,
  })

  return ok({
    inputs: {
      capital: num('capital') ?? defCapital,
      cashPerLoan: num('cashPerLoan') ?? defCash,
      profitPerLoan: num('profitPerLoan') ?? defProfit,
      termWeeks: num('termWeeks') ?? defTerm,
      mode,
    },
    ...result,
  })
})
