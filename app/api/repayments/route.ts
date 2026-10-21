import { NextRequest } from 'next/server'
import { apiHandler, getSession, ok, err } from '@/lib/api'
import { readTable, updateById, appendRow, makeId, nowIso, paginate, invalidateCache, getSupabase } from '@/lib/supabase-db'
import { APP_CONFIG } from '@/lib/config'
import { saveFileSupabase } from '@/lib/drive'
import { getTodayIST, getThisSaturday, getNextSaturday } from '@/lib/dateUtils'

export const GET = apiHandler(async (req: NextRequest) => {
  const session = await getSession(req)
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('mode') || ''
  const search = (searchParams.get('search') || '').toLowerCase().trim()
  const customerId = searchParams.get('customerId') || ''
  const page = Number(searchParams.get('page') || 1)
  const pageSize = Number(searchParams.get('pageSize') || 50)

  const [repayments, loans, customers, agents, guarantors] = await Promise.all([
    readTable('Repayments', { forceFresh: true }), readTable('Loans', { forceFresh: true }), readTable('Customers', { forceFresh: true }),
    readTable('Agents', { forceFresh: true }), readTable('Guarantors', { forceFresh: true }),
  ])

  // Use IST (UTC+5:30) for all date calculations
  const today = getTodayIST()
  const saturday = getThisSaturday()

  // Role-based loan filtering
  let allowedLoanIds: Set<string> | null = null
  if (session.role === 'NGF AGENT') {
    const agent = agents.find(a => a['User ID'] === session.userId)
    allowedLoanIds = new Set(loans.filter(l => l['Assigned Agent ID'] === agent?.['Agent ID']).map(l => l['Loan ID']))
  } else if (session.role === 'Guarantor') {
    const g = guarantors.find(g => g['User ID'] === session.userId)
    allowedLoanIds = new Set(loans.filter(l => l['Guarantor ID'] === g?.['Guarantor ID']).map(l => l['Loan ID']))
  }

  let filtered = repayments.map(r => {
    // Create a copy to avoid mutating cached data
    const row = { ...r }
    if (row['Status'] === 'Pending' && row['Due Date'] < today) row['Status'] = 'Overdue'
    return row
  })

  if (allowedLoanIds) filtered = filtered.filter(r => allowedLoanIds!.has(r['Loan ID']))

  if (mode === 'today') filtered = filtered.filter(r => r['Due Date'] === saturday && r['Status'] !== 'Paid')
  else if (mode === 'nextsaturday') filtered = filtered.filter(r => r['Due Date'] === saturday)
  else if (mode !== 'all' && !customerId) filtered = filtered.filter(r => r['Status'] !== 'Paid')

  const enriched = filtered.map(r => {
    const c = customers.find(c => c['Customer ID'] === r['Customer ID'])
    const loan = loans.find(l => l['Loan ID'] === r['Loan ID'])
    const g = guarantors.find(g => g['Guarantor ID'] === loan?.['Guarantor ID'])
    return {
      ...r,
      customerName: c?.['Name'] || '',
      customerPhone: c?.['Phone'] || '',
      aadhaarNo: '',
      guarantorName: g?.['Name'] || '',
    }
  })

  // Single-customer history (transaction + reviews tabs): return the full set,
  // paid and unpaid, ordered by week.
  if (customerId) {
    const rows = enriched
      .filter(r => (r as any)['Customer ID'] === customerId)
      .sort((a, b) => Number((a as any)['Week No'] || 0) - Number((b as any)['Week No'] || 0))
    return ok({ rows })
  }

  // Search: loan ID (last 4 for guarantor), mobile, aadhaar
  let results = enriched
  if (search) {
    results = enriched.filter(r => {
      const loanId = ((r as any)['Loan ID'] || '').toLowerCase()
      const phone = (r.customerPhone || '').toLowerCase()
      if (session.role === 'Guarantor') {
        return loanId.slice(-4) === search || phone.includes(search)
      }
      return loanId.includes(search) || phone.includes(search)
    })
  }

  const paginated = paginate(results, page, pageSize)

  if (mode === 'today' || mode === 'nextsaturday') {
    const totalAmount = results.reduce((s, r) => s + Number((r as any)['Amount'] || 0), 0)
    const uniqueGuarantors = new Set(results.map(r => r.guarantorName).filter(Boolean))
    return ok({
      ...paginated,
      summary: {
        saturdayDate: saturday,
        customerCount: results.length,
        totalAmount,
        guarantorCount: uniqueGuarantors.size,
      },
    })
  }

  return ok(paginated)
})

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await getSession(req)
  const body = await req.json()
  const { repaymentId, paymentMode, notes, paymentProof, status, reviewLabel } = body

  // The form's labels differ from the database enums, so normalise them here
  const MODE_MAP: Record<string, string> = {
    'Cash': 'Cash', 'UPI': 'UPI', 'UPI / QR': 'UPI', 'Bank': 'Bank', 'Bank Transfer': 'Bank', 'Cheque': 'Cheque', 'Other': 'Other',
  }
  // "Not Paid" is a visit with no payment: the week stays Pending, the note records why
  const STATUS_MAP: Record<string, string> = { 'Paid': 'Paid', 'Delayed': 'Delayed', 'Not Paid': 'Pending', 'Pending': 'Pending' }
  const payStatus = STATUS_MAP[status || 'Paid']
  if (!payStatus) return err('Invalid status')
  const mode = paymentMode ? MODE_MAP[paymentMode] : null
  if (paymentMode && !mode) return err('Invalid payment mode')
  if (payStatus === 'Paid' && !mode) return err('Please choose a payment mode')

  const [repayments, loans] = await Promise.all([readTable('Repayments', { forceFresh: true }), readTable('Loans', { forceFresh: true })])
  const r = repayments.find(r => r['Repayment ID'] === repaymentId)
  if (!r) return ok({ success: false, error: 'Repayment not found' })

  // Same scope as the list above: Admin and Staff any loan, Guarantor own loans, agent assigned loans
  if (session.role !== 'Admin' && session.role !== 'Staff') {
    const loan = loans.find(l => l['Loan ID'] === r['Loan ID'])
    let mine = false
    if (session.role === 'NGF AGENT') {
      const agents = await readTable('Agents')
      const agent = agents.find(a => a['User ID'] === session.userId)
      mine = !!agent && loan?.['Assigned Agent ID'] === agent['Agent ID']
    } else if (session.role === 'Guarantor') {
      const guarantors = await readTable('Guarantors')
      const g = guarantors.find(g => g['User ID'] === session.userId)
      mine = !!g && loan?.['Guarantor ID'] === g['Guarantor ID']
    }
    if (!mine) return err('No permission', 403)
  }
  // A settled week is final: no second payment record, no overwriting a waiver
  if (r['Status'] === 'Paid' || r['Status'] === 'Waived') return err(`This week is already ${String(r['Status']).toLowerCase()}`)

  let proofFileId = ''
  if (paymentProof) {
    const ts = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)
    proofFileId = await saveFileSupabase(
      'payment-proofs',
      `${r['Loan ID']}/${ts}_${String(paymentProof.fileName || 'proof').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60)}`,
      paymentProof.mimeType,
      paymentProof.base64Data
    )
  }

  const today = getTodayIST()
  const notesFull = [notes, reviewLabel ? `Review: ${reviewLabel}` : ''].filter(Boolean).join(' | ')

  if (payStatus === 'Paid') {
    // A UTR payment already marked for this week (waiting for verification) must be resolved there, not paid again by hand
    const { data: marked } = await getSupabase().from('payment_lines').select('line_id').eq('repayment_id', repaymentId).limit(1)
    if (marked && marked.length) return err('A payment is already recorded for this week in Payment Matching. Resolve it there.')
    // Claim the week in one database step so a double click or two devices cannot record the money twice
    const { data: claimed, error: claimErr } = await getSupabase().from('repayments')
      .update({ status: 'Paid', paid_date: today, collection_agent_id: session.userId, payment_mode: mode, proof_file_id: proofFileId, notes: notesFull, updated_at: nowIso() })
      .eq('repayment_id', repaymentId).not('status', 'in', '("Paid","Waived")').select('repayment_id')
    if (claimErr) return err(claimErr.message, 500)
    if (!claimed || claimed.length === 0) return err('This week is already paid')
    invalidateCache('Repayments')
  } else await updateById('Repayments', repaymentId, {
    'Status': payStatus,
    'Paid Date': payStatus === 'Paid' ? today : null,
    'NGF Agent ID': session.userId,
    'Payment Mode': payStatus === 'Paid' ? mode : null,
    'Proof File ID': proofFileId,
    'Notes': notesFull,
    'Updated At': nowIso(),
  })

  // Only append to Collections if actually paid
  if (payStatus === 'Paid') {
    await appendRow('Collections', {
      'Collection ID': makeId('COL'),
      'Repayment ID': repaymentId,
      'Loan ID': r['Loan ID'],
      'Customer ID': r['Customer ID'],
      'Agent ID': session.userId,
      'Amount': r['Amount'],
      'Payment Date': today,
      'Proof File ID': proofFileId,
      'Payment Mode': mode,
      'Notes': notesFull,
      'Created At': nowIso(),
    })

    // Check loan completion
    const allRepayments = await readTable('Repayments', { forceFresh: true })
    const loanReps = allRepayments.filter(x => x['Loan ID'] === r['Loan ID'])
    const allDone = loanReps.every(x => x['Status'] === 'Paid' || x['Status'] === 'Waived' || x['Repayment ID'] === repaymentId)
    if (allDone) {
      const loan = loans.find(l => l['Loan ID'] === r['Loan ID'])
      if (loan) await updateById('Loans', loan['Loan ID'], { 'Status': 'Completed', 'Updated At': nowIso() })
    }
  }

  invalidateCache('Repayments')
  invalidateCache('Collections')
  invalidateCache('Loans')

  return ok({ success: true })
})
