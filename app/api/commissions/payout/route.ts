import { NextRequest } from 'next/server'
import { apiHandler, getSession, requireRole, ok, err } from '@/lib/api'
import { readTable, appendRow, updateById, invalidateCache, findRecord } from '@/lib/supabase-db'
import { addDaysIST, getTodayIST } from '@/lib/dateUtils'

const CYCLE_DAYS = 35

function buildCycles(loans: any[]): { pastCycles: any[]; currentCycle: any | null } {
  const sorted = [...loans].filter(l => l.startDate).sort((a, b) => a.startDate.localeCompare(b.startDate))
  const cycles: any[] = []
  let remaining = [...sorted]
  let cycleIdx = 0
  while (remaining.length > 0) {
    const start = remaining[0].startDate
    const end = addDaysIST(start, CYCLE_DAYS)
    const inCycle = remaining.filter(l => l.startDate < end)
    remaining = remaining.filter(l => l.startDate >= end)
    cycles.push({ start, end, loans: inCycle, cycleIdx })
    cycleIdx++
  }
  const todayStr = getTodayIST()
  const pastCycles = cycles.filter(c => c.end <= todayStr)
  const currentCycle = cycles.find(c => c.start <= todayStr && c.end > todayStr) ?? null
  return { pastCycles, currentCycle }
}

export const GET = apiHandler(async (req: NextRequest) => {
  const session = await getSession(req)
  const { searchParams } = new URL(req.url)
  const showAll = searchParams.get('all') === '1'

  if (!showAll && session.role !== 'Guarantor') return err('Guarantors only', 403)
  if (showAll && session.role !== 'Admin' && session.role !== 'Staff') return err('Admins/Staff only', 403)

  const [guarantors, payouts] = await Promise.all([
    readTable('Guarantors'), readTable('PayoutRequests'),
  ])

  let mine = payouts
  if (!showAll) {
    const g = guarantors.find((g: any) => g['User ID'] === session.userId)
    if (!g) return err('Guarantor not found', 404)
    mine = payouts.filter((p: any) => p['Guarantor ID'] === g['Guarantor ID'])
  }

  const enriched = mine
    .sort((a: any, b: any) => b['Requested At'].localeCompare(a['Requested At']))
    .map((p: any) => {
      const g = guarantors.find((gu: any) => gu['Guarantor ID'] === p['Guarantor ID'])
      return {
        payoutId: p['Payout ID'],
        guarantorId: p['Guarantor ID'],
        guarantorName: g?.['Name'] || '',
        amount: Number(p['Amount'] || 0),
        status: p['Status'],
        requestedAt: p['Requested At'],
        processedAt: p['Processed At'] || null,
        notes: p['Notes'] || '',
      }
    })

  return ok({ payouts: enriched })
})

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await getSession(req)
  if (session.role !== 'Guarantor') return err('Guarantors only', 403)

  const body = await req.json()
  const amount = Number(body.amount || 0)
  if (amount <= 0) return err('Invalid amount')

  const [guarantors, payouts, loans] = await Promise.all([
    readTable('Guarantors'), readTable('PayoutRequests'), readTable('Loans'),
  ])
  const g = guarantors.find((g: any) => g['User ID'] === session.userId)
  if (!g) return err('Guarantor not found', 404)

  // Check for existing pending or rejected request
  const hasPending = payouts.some(
    (p: any) => p['Guarantor ID'] === g['Guarantor ID'] && p['Status'] === 'Pending'
  )
  if (hasPending) return err('You already have a pending payout request')

  // Enforce cycle rule: only completed cycles (past cycles) are eligible
  const guarantorLoans = loans.filter(l => l['Guarantor ID'] === g['Guarantor ID'] && l['Guarantor Commission'])
  const { pastCycles } = buildCycles(guarantorLoans)
  if (pastCycles.length === 0) return err('No completed payout cycles yet. Payout unlocks after 35 days.')

  // A request cannot be more than the commission earned and not yet paid out
  const earned = guarantorLoans.reduce((sum, l) => sum + Number(l['Guarantor Commission'] || 0), 0)
  const alreadyPaid = payouts.filter((p: any) => p['Guarantor ID'] === g['Guarantor ID'] && p['Status'] === 'Paid').reduce((sum: number, p: any) => sum + Number(p['Amount'] || 0), 0)
  if (!Number.isFinite(amount) || amount > earned - alreadyPaid + 0.5) return err('Amount is more than your available commission')

  const payoutId = `PYOUT${Date.now()}`
  const now = new Date().toISOString()

  await appendRow('PayoutRequests', {
    'Payout ID': payoutId,
    'Guarantor ID': g['Guarantor ID'],
    'Amount': String(amount),
    'Status': 'Pending',
    'Requested At': now,
    'Notes': '',
  })

  return ok({ payoutId, message: 'Payout request submitted' })
})

// Admin marks payout as Paid after scanning QR
export const PATCH = apiHandler(async (req: NextRequest) => {
  const session = await getSession(req)
  if (session.role !== 'Admin' && session.role !== 'Staff') return err('Admins/Staff only', 403)

  const body = await req.json()
  const { payoutId, action } = body // action: 'approve' | 'reject'
  if (!payoutId || !action) return err('payoutId and action required')

  const payouts = await readTable('PayoutRequests')
  const payout = payouts.find((p: any) => p['Payout ID'] === payoutId)
  if (!payout) return err('Payout request not found', 404)

  // Only a request that is still waiting can be decided; a paid or rejected one is final
  if (payout['Status'] !== 'Pending') return err(`This payout is already ${String(payout['Status']).toLowerCase()}`)
  if (action !== 'approve' && action !== 'reject') return err('action must be approve or reject')

  const newStatus = action === 'reject' ? 'Rejected' : 'Paid'
  const notes = action === 'reject'
    ? `Rejected by admin ${session.userId}: ${body.notes || 'No reason provided'}`
    : `Recorded by admin ${session.userId}`

  await updateById('PayoutRequests', payoutId, {
    'Status': newStatus,
    'Processed At': new Date().toISOString(),
    'Notes': notes,
  })
  invalidateCache('PayoutRequests')

  return ok({ message: `Payout marked as ${newStatus}` })
})
