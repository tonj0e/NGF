import { NextRequest } from 'next/server'
import { apiHandler, requireRole, ok, err } from '@/lib/api'
import { readTable, appendRow, deleteRow, findRecord, makeId, nowIso, deleteById } from '@/lib/supabase-db'
import { companyTotals } from '@/lib/db'

// Capital pool: own capital + other persons' investments.
// Available = Total Capital − all net disbursed + all collected repayments.

export const GET = apiHandler(async (req: NextRequest) => {
  await requireRole(req, ['Admin'])

  const [capital, totals] = await Promise.all([readTable('Capital', { forceFresh: true }), companyTotals()])

  const totalCapital = capital.reduce((s, c) => s + Number(c['Amount'] || 0), 0)
  const investorMoney = capital.filter(c => c['Type'] === 'Investor').reduce((s, c) => s + Number(c['Amount'] || 0), 0)
  const ownCapital = capital.filter(c => c['Type'] === 'Own').reduce((s, c) => s + Number(c['Amount'] || 0), 0)

  // Interest & commission are deducted UPFRONT at disbursement (all loans/products).
  // Interest (profit) booked upfront = Interest Deduction per loan.
  const totalInterest = totals.totalInterest
  const totalPrincipal = totals.totalPrincipal
  const totalCollected = totals.paidTotal

  // Available (lendable) = capital − principal lent out + collected back.
  // Profit sits in the Interest bucket, not in Available.
  const availableCapital = totalCapital - totalPrincipal + totalCollected

  const entries = capital
    .map(c => ({
      capitalId: c['Capital ID'],
      type: c['Type'],
      contributor: c['Contributor'],
      amount: Number(c['Amount'] || 0),
      date: c['Date'],
      notes: c['Notes'] || '',
      createdAt: c['Created At'],
    }))
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))

  return ok({
    totals: { totalCapital, ownCapital, investorMoney, totalInterest, totalPrincipal, totalCollected, availableCapital },
    entries,
  })
})

export const POST = apiHandler(async (req: NextRequest) => {
  await requireRole(req, ['Admin'])
  const body = await req.json()
  const amount = Number(body.amount)
  if (!amount || amount <= 0) return err('Valid amount required')
  const type = body.type === 'Investor' ? 'Investor' : 'Own'

  const capitalId = makeId('CAP')
  await appendRow('Capital', {
    'Capital ID': capitalId,
    'Type': type,
    'Contributor': (body.contributor || (type === 'Own' ? 'Owner' : '')).trim(),
    'Amount': String(amount),
    'Date': body.date || nowIso().slice(0, 10),
    'Notes': body.notes || '',
    'Created At': nowIso(),
  })

  return ok({ success: true, capitalId })
})

export const DELETE = apiHandler(async (req: NextRequest) => {
  await requireRole(req, ['Admin'])
  const { capitalId } = await req.json()
  if (!capitalId) return err('capitalId required')

  const capital = await readTable('Capital')
  const row = findRecord(capital, 'Capital ID', capitalId)
  if (!row) return err('Entry not found')

  await deleteById('Capital', capitalId)
  return ok({ success: true })
})
