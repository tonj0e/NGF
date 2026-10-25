import { NextRequest } from 'next/server'
import { apiHandler, getSession, ok, err } from '@/lib/api'
import { needFeature } from '@/lib/access'
import { coll } from '@/lib/features'
import { readTable, selectRows, countRows, getRowById, updateById, appendRow, makeId, nowIso, invalidateCache, getSupabase } from '@/lib/supabase-db'
import { APP_CONFIG } from '@/lib/config'
import { saveFileSupabase } from '@/lib/drive'
import { getTodayIST, getThisSaturday, getNextSaturday } from '@/lib/dateUtils'
import { getBranchAccess, canSeeGuarantor, guarantorBranchMap } from '@/lib/branchAccess'
import { pageQuery, cleanSearch, scopeOf, withScope } from '@/lib/db'

// GET /api/repayments
//   ?mode=today|nextsaturday|all|history   (default: everything not yet paid)  &search=  &page=  &pageSize=
//   ?customerId=ID or ?loanId=ID           every week of that customer / loan, in week order
//   history: paid weeks, newest first; add &month=YYYY-MM for one month (with paidCount / paidTotal for the whole month)
// Filtering, searching, counting and paging all happen in the database (view repayments_enriched).
export const GET = apiHandler(async (req: NextRequest) => {
  const session = await getSession(req)
  await needFeature(session, [])
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('mode') || ''
  const search = cleanSearch(searchParams.get('search'))
  const customerId = searchParams.get('customerId') || ''
  const loanId = searchParams.get('loanId') || ''
  const month = /^\d{4}-\d{2}$/.test(searchParams.get('month') || '') ? searchParams.get('month')! : ''
  const page = Math.max(1, Math.floor(Number(searchParams.get('page') || 1)) || 1)
  const pageSize = Math.min(5000, Math.max(1, Math.floor(Number(searchParams.get('pageSize') || 50)) || 50))

  // Use IST (UTC+5:30) for all date calculations
  const today = getTodayIST()
  const saturday = getThisSaturday()

  // Role-based scope, worked out in the database (guarantor id / assigned agent id of the loan)
  let scope = await scopeOf(session)
  let agentId = ''
  if (session.role === 'NGF AGENT') {
    const a = (await readTable('Agents')).find(x => x['User ID'] === session.userId)
    agentId = a?.['Agent ID'] || '__none__'
    scope = { kind: 'all' }
  }
  const guaranteed = scope.kind === 'guarantors' ? scope.ids : scope.kind === 'none' ? ['__none__'] : null

  const filters = (qb: any) => {
    let q = withScope(qb, scope)
    if (agentId) q = q.eq('assigned_agent_id', agentId)
    if (customerId) return q.eq('customer_id', customerId)
    if (loanId) return q.eq('loan_id', loanId)
    if (mode === 'today') q = q.eq('due_date', saturday).neq('status', 'Paid')
    else if (mode === 'nextsaturday') q = q.eq('due_date', saturday)
    else if (mode === 'history') {
      q = q.eq('status', 'Paid')
      if (month) { const [y, m] = month.split('-').map(Number); q = q.gte('paid_date', `${month}-01`).lt('paid_date', m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`) }
    }
    else if (mode !== 'all') q = q.neq('status', 'Paid')
    if (search) {
      // a guarantor finds a customer by the last 4 digits of the loan id or by phone; others by loan id or phone
      const loanPart = session.role === 'Guarantor' ? (search.length === 4 ? `loan_id.ilike.%${search}` : '') : `loan_id.ilike.%${search}%`
      q = q.or([loanPart, `customer_phone.ilike.%${search}%`].filter(Boolean).join(','))
    }
    return q
  }
  const order = customerId || loanId
    ? [{ column: 'week_no' }, { column: 'repayment_id' }]
    : mode === 'history' ? [{ column: 'paid_date', ascending: false }, { column: 'repayment_id' }]
    : [{ column: 'due_date' }, { column: 'customer_name' }, { column: 'repayment_id' }]

  // One customer's or loan's weeks: all of them, no paging
  const wantAll = !!(customerId || loanId)
  const rows: Record<string, string>[] = []
  let total = 0
  if (wantAll) {
    const r = await pageQuery('RepaymentsEnriched', { filters, order, page: 1, pageSize: 200 })
    rows.push(...r.rows); total = r.total
    for (let pg = 2; pg <= r.totalPages; pg++) rows.push(...(await pageQuery('RepaymentsEnriched', { filters, order, page: pg, pageSize: 200 })).rows)
  } else {
    // pages bigger than 200 (used by Reports for now) are read in several chunks of 200
    const start = (page - 1) * pageSize
    const firstPg = Math.floor(start / 200) + 1
    for (let pg = firstPg; rows.length < pageSize; pg++) {
      const r = await pageQuery('RepaymentsEnriched', { filters, order, page: pg, pageSize: 200 })
      total = r.total
      const skip = pg === firstPg ? start - (firstPg - 1) * 200 : 0
      rows.push(...r.rows.slice(skip, skip + (pageSize - rows.length)))
      if (pg >= r.totalPages || !r.rows.length) break
    }
  }

  const shaped = rows.map(r => {
    const row: Record<string, any> = { ...r }
    const customerName = row['Customer Name'] || '', customerPhone = row['Customer Phone'] || '', guarantorName = row['Guarantor Name'] || ''
    for (const k of ['Customer Name', 'Customer Phone', 'Guarantor Name', 'Guarantor ID', 'Assigned Agent ID']) delete row[k]
    if (row['Status'] === 'Pending' && row['Due Date'] < today) row['Status'] = 'Overdue'
    return { ...row, customerName, customerPhone, aadhaarNo: '', guarantorName }
  })

  if (wantAll) return ok({ rows: shaped })

  const paginated = { rows: shaped, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } }
  const sb = getSupabase()

  if (mode === 'today' || mode === 'nextsaturday') {
    const { data } = await sb.rpc('repayment_day_summary', { p_date: saturday, p_unpaid_only: mode === 'today', p_guarantors: guaranteed, p_agent: agentId || null })
    const s0 = (data && data[0]) || {}
    return ok({
      ...paginated,
      summary: { saturdayDate: saturday, customerCount: Number(s0.customer_count || 0), totalAmount: Number(s0.total_amount || 0), guarantorCount: Number(s0.guarantor_count || 0) },
    })
  }
  if (mode === 'history' && month) {
    const [y, m] = month.split('-').map(Number)
    const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
    const { data } = await sb.rpc('repayment_paid_summary', { p_from: `${month}-01`, p_to: to, p_guarantors: guaranteed, p_agent: agentId || null })
    const s0 = (data && data[0]) || {}
    return ok({ ...paginated, summary: { paidCount: Number(s0.paid_count || 0), paidTotal: Number(s0.paid_total || 0) } })
  }
  return ok(paginated)
})

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await getSession(req)
  await needFeature(session, [...coll('collectionRecord'), 'settlements', 'payMark'])
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

  const r = await getRowById('Repayments', String(repaymentId || ''))
  if (!r) return err('Repayment not found', 404)
  const loan = await getRowById('Loans', r['Loan ID'])

  // Same scope as the list above: Admin any loan, Staff loans of their branches, Guarantor own loans, agent assigned loans
  if (session.role !== 'Admin') {
    let mine = false
    if (session.role === 'Staff') {
      mine = canSeeGuarantor(await getBranchAccess(session), await guarantorBranchMap(), loan?.['Guarantor ID'] || '')
    } else if (session.role === 'NGF AGENT') {
      const agent = (await selectRows('Agents', qb => qb.eq('user_id', session.userId).limit(1))).rows[0]
      mine = !!agent && loan?.['Assigned Agent ID'] === agent['Agent ID']
    } else if (session.role === 'Guarantor') {
      const g = (await selectRows('Guarantors', qb => qb.eq('user_id', session.userId).limit(1))).rows[0]
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
    // is any other week of this loan still open? (one small count, not the whole repayments table)
    const stillOpen = await countRows('Repayments', qb => qb.eq('loan_id', r['Loan ID']).neq('repayment_id', repaymentId).not('status', 'in', '(Paid,Waived)'))
    if (stillOpen === 0) {
      if (loan) await updateById('Loans', loan['Loan ID'], { 'Status': 'Completed', 'Updated At': nowIso() })
    }
  }

  invalidateCache('Repayments')
  invalidateCache('Collections')
  invalidateCache('Loans')

  return ok({ success: true })
})
