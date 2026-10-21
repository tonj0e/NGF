import { NextRequest } from 'next/server'
import { apiHandler, requireRole, ok, err } from '@/lib/api'
import { readTable, updateById, appendRow, makeId, nowIso, invalidateCache, getSupabase } from '@/lib/supabase-db'
import { getTodayIST } from '@/lib/dateUtils'
import { csrfProtection } from '@/lib/csrf'
import { createAuditLogger } from '@/lib/audit'
import { getBranchAccess, branchOfGuarantor, canApproveIn } from '@/lib/branchAccess'
import { notifyUser } from '@/lib/notifications'
import { finalizeClosure } from '@/lib/loanClosure'

// Early closure of a loan when the customer pays the remaining weeks up front.
//  hold      -> customer can renew again only after the ORIGINAL end date of the loan (hold_until = end date)
//  permanent -> customer gets no more loans from NGF until an Admin re-admits them after fresh verification
// The remaining weeks are recorded as normal paid weeks + collections, so reports and settlements stay right.

const MODES: Record<string, string> = { Cash: 'Cash', UPI: 'UPI', Bank: 'Bank', Cheque: 'Cheque', Other: 'Other' }

async function load(req: NextRequest, loanId: string) {
  const session = await requireRole(req, ['Admin', 'Staff'])
  const [loans, repayments, customers] = await Promise.all([readTable('Loans', { forceFresh: true }), readTable('Repayments', { forceFresh: true }), readTable('Customers', { forceFresh: true })])
  const loan = loans.find(l => l['Loan ID'] === loanId)
  if (!loan) return { error: err('Loan not found', 404) }
  const access = await getBranchAccess(session)
  if (!canApproveIn(access, await branchOfGuarantor(loan['Guarantor ID']))) return { error: err('This loan belongs to another branch', 403) }
  const customer = customers.find(c => c['Customer ID'] === loan['Customer ID'])
  const remaining = repayments.filter(r => r['Loan ID'] === loanId && r['Status'] !== 'Paid' && r['Status'] !== 'Waived')
  return { error: null, session, loan, customer, remaining }
}

export const GET = apiHandler(async (req: NextRequest) => {
  const loanId = new URL(req.url).searchParams.get('loanId') || ''
  const c = await load(req, loanId)
  if (c.error) return c.error
  return ok({
    loanId, customerName: c.customer?.['Name'] || '', status: c.loan['Status'], endDate: c.loan['End Date'],
    weeksRemaining: c.remaining.length, amountRemaining: c.remaining.reduce((s, r) => s + Number(r['Amount'] || 0), 0),
  })
})

export const POST = apiHandler(async (req: NextRequest) => {
  const body = await req.json().catch(() => ({}))
  const { loanId, mode, paymentMode, confirmCollected } = body as { loanId: string; mode: string; paymentMode?: string; confirmCollected?: boolean }
  const reason = String(body.reason || '').trim()
  if (mode !== 'hold' && mode !== 'permanent') return err('Choose Close & Hold or Close permanently')
  const c = await load(req, loanId)
  if (c.error) return c.error
  const { session, loan, customer, remaining } = c
  const csrfError = csrfProtection(req, session.userId)
  if (csrfError) return csrfError
  if (!customer) return err('Customer not found')
  if (loan['Status'] !== 'Active') return err('Only a running loan can be closed early')
  if (mode === 'permanent' && reason.length < 10) return err('Give the reason for the permanent closure (at least 10 characters)')

  const amount = remaining.reduce((s, r) => s + Number(r['Amount'] || 0), 0)
  const pm = paymentMode ? MODES[paymentMode] : ''
  if (remaining.length > 0) {
    if (!confirmCollected) return err(`Confirm that you collected ₹${amount.toLocaleString('en-IN')} (${remaining.length} weeks) from the customer`)
    if (!pm) return err('Choose how the payment was received')
  }

  // Claim the loan so two clicks cannot close it twice
  const { data: claimed } = await getSupabase().from('loans').update({ status: 'Completed', updated_at: nowIso() }).eq('loan_id', loanId).eq('status', 'Active').select('loan_id')
  if (!claimed || claimed.length === 0) return err('This loan was just closed by someone else')

  const today = getTodayIST()
  const label = mode === 'hold' ? 'Close & Hold' : 'Permanent close'
  try {
    for (const r of remaining) {
      await updateById('Repayments', r['Repayment ID'], { 'Status': 'Paid', 'Paid Date': today, 'NGF Agent ID': session.userId, 'Payment Mode': pm, 'Notes': `Prepaid at early closure (${label})`, 'Updated At': nowIso() })
      await appendRow('Collections', { 'Collection ID': makeId('COL'), 'Repayment ID': r['Repayment ID'], 'Loan ID': loanId, 'Customer ID': loan['Customer ID'], 'Agent ID': session.userId, 'Amount': r['Amount'], 'Payment Date': today, 'Proof File ID': '', 'Payment Mode': pm, 'Notes': `Prepaid at early closure (${label})`, 'Created At': nowIso() })
    }
    await finalizeClosure({ loanId, customerId: customer['Customer ID'], mode, weeksRemaining: remaining.length, amountCollected: amount, paymentMode: pm || null, endDate: String(loan['End Date']), reason, closedBy: session.userId })
  } catch (e) {
    // Put the loan back so nothing is half closed; paid weeks already marked stay paid and are visible in history
    await getSupabase().from('loans').update({ status: 'Active', updated_at: nowIso() }).eq('loan_id', loanId)
    invalidateCache('Loans'); invalidateCache('Repayments'); invalidateCache('Customers'); invalidateCache('Collections')
    console.error('close loan failed:', e)
    return err((e instanceof Error && e.message) || 'Could not close the loan. Check the repayments and try again.', 500)
  }
  invalidateCache('Loans'); invalidateCache('Repayments'); invalidateCache('Customers'); invalidateCache('Collections')
  await createAuditLogger(req, session).log('LOAN_CLOSED_EARLY', 'Loan', loanId, { mode, weeks: remaining.length, amount, paymentMode: pm, reason: reason.slice(0, 200) })
  const g = (await readTable('Guarantors')).find(x => x['Guarantor ID'] === loan['Guarantor ID'])
  if (g) await notifyUser(g['User ID'], 'Guarantor', mode === 'hold' ? 'Loan closed (on hold)' : 'Loan closed permanently', `${customer['Name']}: ${mode === 'hold' ? `renewal opens after ${String(loan['End Date']).slice(0, 10)}` : 'no further loans'}.`, 'Loan', loanId)
  return ok({ closed: true, mode, weeksPrepaid: remaining.length, amount, holdUntil: mode === 'hold' ? String(loan['End Date']).slice(0, 10) : null })
})
