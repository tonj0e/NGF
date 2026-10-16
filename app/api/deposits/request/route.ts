import { NextRequest } from 'next/server'
import { apiHandler, getSession, requireRole, ok, err } from '@/lib/api'
import { readTable, appendRow, updateById, findRecord, makeId, nowIso, invalidateCache } from '@/lib/supabase-db'
import { computeDepositAccount, getDepositSettings, DepositTxn, TXN_INTEREST_PAYOUT, TXN_PRINCIPAL_WITHDRAWAL } from '@/lib/deposits'
import { getTodayIST } from '@/lib/dateUtils'

function txnsFor(rows: Record<string, string>[], gid: string): DepositTxn[] {
  return rows.filter(r => r['Guarantor ID'] === gid).map(r => ({ type: r['Type'], amount: Number(r['Amount'] || 0), date: (r['Date'] || '').slice(0, 10) }))
}

export const GET = apiHandler(async (req: NextRequest) => {
  const session = await getSession(req)
  const [guarantors, requests] = await Promise.all([readTable('Guarantors'), readTable('DepositRequests')])
  if (session.role === 'Guarantor') {
    const g = guarantors.find(g => g['User ID'] === session.userId)
    if (!g) return err('Guarantor not found', 404)
    const mine = requests.filter(r => r['Guarantor ID'] === g['Guarantor ID'])
      .map(r => ({ requestId: r['Request ID'], type: r['Type'], amount: Number(r['Amount'] || 0), status: r['Status'], requestedAt: r['Requested At'], processedAt: r['Processed At'] || '' }))
      .sort((a, b) => String(b.requestedAt).localeCompare(String(a.requestedAt)))
    return ok({ requests: mine })
  }
  await requireRole(req, ['Admin', 'Staff'])
  const pending = requests.filter(r => r['Status'] === 'Pending')
    .map(r => {
      const g = guarantors.find(x => x['Guarantor ID'] === r['Guarantor ID'])
      return { requestId: r['Request ID'], guarantorId: r['Guarantor ID'], guarantorName: g?.['Name'] || '', type: r['Type'], amount: Number(r['Amount'] || 0), requestedAt: r['Requested At'] }
    })
  return ok({ requests: pending })
})

// POST → guarantor submits an interest or principal withdrawal request
export const POST = apiHandler(async (req: NextRequest) => {
  const session = await getSession(req)
  if (session.role !== 'Guarantor') return err('Guarantors only', 403)
  const body = await req.json()
  const type = body.type === 'Principal' ? 'Principal' : 'Interest'

  const [guarantors, deposits, requests, settings] = await Promise.all([
    readTable('Guarantors'), readTable('Deposits'), readTable('DepositRequests'), getDepositSettings(),
  ])
  const g = guarantors.find(g => g['User ID'] === session.userId)
  if (!g) return err('Guarantor not found', 404)
  const gid = g['Guarantor ID']

  if (requests.some(r => r['Guarantor ID'] === gid && r['Status'] === 'Pending')) {
    return err('You already have a pending withdrawal request')
  }

  const account = computeDepositAccount(txnsFor(deposits, gid), settings)
  let amount = 0
  if (type === 'Interest') {
    if (!account.canWithdrawInterest) return err(`Interest can be withdrawn after the ${settings.cycleDays}-day cycle. ${account.daysRemaining} day(s) left.`)
    amount = account.availableInterest
  } else {
    if (!settings.principalWithdrawEnabled) return err('Principal withdrawal is currently disabled')
    amount = Number(body.amount || 0)
    if (amount <= 0 || amount > account.principal) return err('Invalid principal withdrawal amount')
  }
  if (amount <= 0) return err('Nothing available to withdraw')

  const requestId = `DREQ${Date.now()}`
  await appendRow('DepositRequests', {
    'Request ID': requestId, 'Guarantor ID': gid, 'Type': type,
    'Amount': String(amount), 'Status': 'Pending',
    'Requested At': nowIso(), 'Processed At': '', 'Notes': '',
  })
  return ok({ requestId, amount, type, message: 'Withdrawal request submitted' })
})

// PATCH → admin/staff approves a request: records the ledger entry, marks it Paid
export const PATCH = apiHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ['Admin', 'Staff'])
  const { requestId } = await req.json()
  if (!requestId) return err('requestId required')

  const requests = await readTable('DepositRequests')
  const reqRow = requests.find(r => r['Request ID'] === requestId)
  if (!reqRow) return err('Request not found', 404)
  if (reqRow['Status'] !== 'Pending') return err('Request already processed')

  const type = reqRow['Type'] === 'Principal' ? 'Principal' : 'Interest'
  const ledgerType = type === 'Principal' ? TXN_PRINCIPAL_WITHDRAWAL : TXN_INTEREST_PAYOUT
  const amount = Number(reqRow['Amount'] || 0)
  const today = getTodayIST()

  // Record the ledger transaction (interest payout resets the 122-day cycle)
  await appendRow('Deposits', {
    'Txn ID': makeId('DEP'), 'Guarantor ID': reqRow['Guarantor ID'], 'Type': ledgerType,
    'Amount': String(amount), 'Date': today,
    'Notes': `Withdrawal request ${requestId}`, 'Recorded By': session.userId, 'Created At': nowIso(),
  })

  await updateById('DepositRequests', requestId, {
    ...reqRow, 'Status': 'Paid', 'Processed At': nowIso(), 'Notes': `Approved by ${session.userId}`,
  })
  invalidateCache('DepositRequests')

  return ok({ success: true, type, amount })
})
