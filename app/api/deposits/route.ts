import { NextRequest } from 'next/server'
import { apiHandler, getSession, requireRole, ok, err } from '@/lib/api'
import { readTable, appendRow, makeId, nowIso } from '@/lib/supabase-db'
import { computeDepositAccount, getDepositSettings, DepositTxn, TXN_DEPOSIT, TXN_INTEREST_PAYOUT, TXN_PRINCIPAL_WITHDRAWAL } from '@/lib/deposits'
import { getTodayIST } from '@/lib/dateUtils'

function txnsFor(rows: Record<string, string>[], guarantorId: string): DepositTxn[] {
  return rows
    .filter(r => r['Guarantor ID'] === guarantorId)
    .map(r => ({ type: r['Type'], amount: Number(r['Amount'] || 0), date: (r['Date'] || '').slice(0, 10) }))
}

function ledgerFor(rows: Record<string, string>[], guarantorId: string) {
  return rows
    .filter(r => r['Guarantor ID'] === guarantorId)
    .map(r => ({ txnId: r['Txn ID'], type: r['Type'], amount: Number(r['Amount'] || 0), date: (r['Date'] || '').slice(0, 10), notes: r['Notes'] || '', recordedBy: r['Recorded By'] || '' }))
    .sort((a, b) => b.date.localeCompare(a.date))
}

// GET                → guarantor's own account; admin/staff with ?guarantorId= that account;
//                      admin/staff with no param → summaries for all guarantors
export const GET = apiHandler(async (req: NextRequest) => {
  const session = await getSession(req)
  const { searchParams } = new URL(req.url)
  const param = searchParams.get('guarantorId') || ''

  const [guarantors, deposits, requests, settings] = await Promise.all([
    readTable('Guarantors'), readTable('Deposits'), readTable('DepositRequests'), getDepositSettings(),
  ])

  if (session.role === 'Guarantor') {
    const g = guarantors.find(g => g['User ID'] === session.userId)
    if (!g) return err('Guarantor not found', 404)
    const gid = g['Guarantor ID']
    const account = computeDepositAccount(txnsFor(deposits, gid), settings)
    const myReqs = requests.filter(r => r['Guarantor ID'] === gid)
      .map(r => ({ requestId: r['Request ID'], type: r['Type'], amount: Number(r['Amount'] || 0), status: r['Status'], requestedAt: r['Requested At'], processedAt: r['Processed At'] || '' }))
      .sort((a, b) => String(b.requestedAt).localeCompare(String(a.requestedAt)))
    return ok({ guarantorId: gid, name: g['Name'], code: g['Code'], account, ledger: ledgerFor(deposits, gid), requests: myReqs, settings })
  }

  // Admin / Staff
  await requireRole(req, ['Admin', 'Staff'])
  if (param) {
    const g = guarantors.find(g => g['Guarantor ID'] === param)
    if (!g) return err('Guarantor not found', 404)
    const account = computeDepositAccount(txnsFor(deposits, param), settings)
    const reqs = requests.filter(r => r['Guarantor ID'] === param)
      .map(r => ({ requestId: r['Request ID'], type: r['Type'], amount: Number(r['Amount'] || 0), status: r['Status'], requestedAt: r['Requested At'], processedAt: r['Processed At'] || '' }))
      .sort((a, b) => String(b.requestedAt).localeCompare(String(a.requestedAt)))
    return ok({ guarantorId: param, name: g['Name'], code: g['Code'], account, ledger: ledgerFor(deposits, param), requests: reqs, settings })
  }

  const summaries = guarantors.map(g => {
    const account = computeDepositAccount(txnsFor(deposits, g['Guarantor ID']), settings)
    return { guarantorId: g['Guarantor ID'], name: g['Name'], code: g['Code'], principal: account.principal, availableInterest: account.availableInterest, daysRemaining: account.daysRemaining }
  })
  return ok({ summaries, settings })
})

// POST → admin/staff records a ledger transaction (deposit / principal withdrawal / interest payout)
export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ['Admin', 'Staff'])
  const body = await req.json()
  const { guarantorId, type } = body
  const amount = Number(body.amount || 0)
  const validTypes = [TXN_DEPOSIT, TXN_INTEREST_PAYOUT, TXN_PRINCIPAL_WITHDRAWAL]
  if (!guarantorId || !validTypes.includes(type)) return err('guarantorId and a valid type are required')
  if (amount <= 0) return err('Amount must be greater than zero')

  const today = getTodayIST()
  await appendRow('Deposits', {
    'Txn ID': makeId('DEP'), 'Guarantor ID': guarantorId, 'Type': type,
    'Amount': String(amount), 'Date': body.date || today,
    'Notes': body.notes || '', 'Recorded By': session.userId, 'Created At': nowIso(),
  })
  return ok({ success: true })
})
