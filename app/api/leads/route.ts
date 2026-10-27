import { NextRequest } from 'next/server'
import { apiHandler, getSession, requireRole, ok, err } from '@/lib/api'
import { needFeature } from '@/lib/access'
import { lead } from '@/lib/features'
import { readTable, appendRow, findRecord, makeId, nowIso, countRows, selectRows, selectAll, getRowById } from '@/lib/supabase-db'
import { pageQuery, byIds, cleanSearch, scopeOf, withScope } from '@/lib/db'
import { getLeadDocFolder, uploadLeadPhoto, docLabel } from '@/lib/drive'
import { notifyRole, notifyUser } from '@/lib/notifications'
import { validateBody, createLeadSchema } from '@/lib/validation'
import { createAuditLogger, AUDIT_ACTIONS } from '@/lib/audit'
import { csrfProtection } from '@/lib/csrf'
import { notifyBranchOfLead } from '@/lib/routes'
import { getBranchAccess, canSeeBranch } from '@/lib/branchAccess'
import { checkRenewalEligibility, customerForRenewalLead, isPermanentlyBlockedAadhaar } from '@/lib/renewalRules'
import { getTodayIST, addDaysIST } from '@/lib/dateUtils'
import { reportError } from '@/lib/monitor'
import { normalizeIndianMobile } from '@/lib/phone'

// GET /api/leads
//   ?tab=new|history|renewal   which list (new = still in progress, history = Converted or Rejected, renewal = renewal requests)
//   &status=  &cheque=1  &branch=BRANCH_ID|none  &q=text  &page=  &pageSize=
// Filtering, searching, counting and paging happen in the database; only the rows on the page are enriched.
// `counts` (new / history / renewal / approved) feeds the tab badges for the caller's whole scope.
export const GET = apiHandler(async (req: NextRequest) => {
  const session = await getSession(req)
  await needFeature(session, [])
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || ''
  const tab = searchParams.get('tab') || ''
  const branch = searchParams.get('branch') || ''
  const cheque = searchParams.get('cheque') === '1'
  const text = cleanSearch(searchParams.get('q'))
  const dayParam = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.get('day') || '') ? searchParams.get('day')! : ''   // one submitted day (History, by week and day)

  // who may see which leads: a guarantor their own, an agent their assigned, Staff their branches' guarantors
  let scope = await scopeOf(session)
  let agentId = ''
  if (session.role === 'NGF AGENT') {
    const agent = (await readTable('Agents')).find(a => a['User ID'] === session.userId)
    agentId = agent?.['Agent ID'] || '__none__'
    scope = { kind: 'all' }
  }
  const [branches, guarantorBranches] = await Promise.all([readTable('Branches'), readTable('GuarantorBranches')])
  const activeLinks = guarantorBranches.filter(x => String(x['Is Active']) !== 'false')
  const branchOf = new Map(activeLinks.map(x => [x['Guarantor ID'], x['Branch ID']]))

  const scoped = (qb: any) => {
    let q = withScope(qb, scope)
    if (agentId) q = q.eq('assigned_agent_id', agentId)
    return q
  }
  const HISTORY = '(Converted,Rejected)'
  const inTab = (qb: any, t: string) =>
    t === 'new' ? qb.not('status', 'in', HISTORY).neq('loan_product', 'RENEWAL')
    : t === 'history' ? qb.in('status', ['Converted', 'Rejected']).neq('loan_product', 'RENEWAL')
    : t === 'renewal' ? qb.eq('loan_product', 'RENEWAL') : qb
  // New Leads is split in three: not yet assigned, with an agent, and verified (waiting for the decision)
  const STAGE_ASSIGNED = ['Agent Assigned', 'Verification In Progress'], STAGE_DONE = ['Verification Submitted', 'Approved']
  const inStage = (qb: any, s: string) =>
    s === 'assigned' ? qb.in('status', STAGE_ASSIGNED)
    : s === 'completed' ? qb.in('status', STAGE_DONE)
    : s === 'new' ? qb.not('status', 'in', `(${['Converted', 'Rejected', ...STAGE_ASSIGNED, ...STAGE_DONE].join(',')})`) : qb
  const stage = tab === 'new' ? (searchParams.get('stage') || '') : ''
  const filters = (qb: any) => {
    let q = inTab(scoped(qb), tab)
    if (stage) q = inStage(q, stage)
    if (status) q = q.eq('status', status)
    if (cheque) q = q.neq('cheque_number', '').not('cheque_number', 'is', null).in('status', ['Approved', 'Converted'])
    if (branch && branch !== 'none') q = q.in('guarantor_id', activeLinks.filter(x => x['Branch ID'] === branch).map(x => x['Guarantor ID']).concat('__none__'))
    else if (branch === 'none') q = q.not('guarantor_id', 'in', `(${Array.from(branchOf.keys()).concat('__none__').join(',')})`)
    if (dayParam) q = q.eq('submitted_date', dayParam)
    if (text) q = q.or(`customer_name.ilike.%${text}%,phone.ilike.%${text}%,aadhaar_no.ilike.%${text}%,lead_id.ilike.%${text}%`)
    return q
  }

  // History by week: how many leads were submitted on each day of the last N weeks (the screen groups them Monday to Friday)
  if (searchParams.get('days') === '1') {
    const weeks = Math.min(Math.max(Number(searchParams.get('weeks')) || 12, 1), 104)
    const since = addDaysIST(getTodayIST(), -7 * weeks)
    const dated = await selectAll('Leads', qb => filters(qb).gte('submitted_date', since))
    const perDay: Record<string, number> = {}
    for (const l of dated) { const d = String(l['Submitted Date'] || '').slice(0, 10); if (d) perDay[d] = (perDay[d] || 0) + 1 }
    return ok({ perDay, since })
  }

  const r = await pageQuery('Leads', {
    filters, order: [{ column: 'submitted_date', ascending: false }, { column: 'lead_id', ascending: false }],
    page: searchParams.get('page') || 1, pageSize: searchParams.get('pageSize') || 20,
  })

  const [guarantors, agents, sameAadhaar, counts] = await Promise.all([
    byIds('Guarantors', 'guarantor_id', r.rows.map(l => l['Guarantor ID'])),
    byIds('Agents', 'agent_id', r.rows.map(l => l['Assigned Agent ID'])),
    byIds('Leads', 'aadhaar_no', r.rows.map(l => l['Aadhaar No'])),
    Promise.all([
      countRows('Leads', qb => inTab(scoped(qb), 'new')), countRows('Leads', qb => inTab(scoped(qb), 'history')),
      countRows('Leads', qb => inTab(scoped(qb), 'renewal')), countRows('Leads', qb => scoped(qb).eq('status', 'Approved')),
      countRows('Leads', qb => inStage(inTab(scoped(qb), 'new'), 'new')), countRows('Leads', qb => inStage(inTab(scoped(qb), 'new'), 'assigned')),
      countRows('Leads', qb => inStage(inTab(scoped(qb), 'new'), 'completed')),
    ]),
  ])
  const gById = new Map(guarantors.map(g => [g['Guarantor ID'], g]))
  const aById = new Map(agents.map(a => [a['Agent ID'], a]))
  const aadhaarCount = new Map<string, number>()
  for (const x of sameAadhaar) aadhaarCount.set(x['Aadhaar No'], (aadhaarCount.get(x['Aadhaar No']) || 0) + 1)

  const enriched = r.rows.map(l => {
    const guarantor = gById.get(l['Guarantor ID'])
    const agent = aById.get(l['Assigned Agent ID'])
    const branchId = branchOf.get(l['Guarantor ID']) || ''
    const existing = l['Aadhaar No'] ? (aadhaarCount.get(l['Aadhaar No']) || 0) - 1 : 0   // other leads with the same Aadhaar
    return {
      leadId: l['Lead ID'], submittedDate: l['Submitted Date'],
      guarantorId: l['Guarantor ID'], guarantorName: guarantor?.['Name'] || '',
      branchId, branchName: branches.find(b => b['Branch ID'] === branchId)?.['Name'] || '',
      customerName: l['Customer Name'], phone: l['Phone'],
      aadhaarNo: l['Aadhaar No'], address: l['Address'],
      houseName: l['House Name'], place: l['Place'], landmark: l['Landmark'],
      nomineeName: l['Nominee Name'], nomineePhone: l['Nominee Phone'], altPhone: l['Alt Phone'] || '', altPhoneLabel: l['Alt Phone Label'] || '',
      occupation: l['Occupation'], panNo: l['PAN No'], chequeNumber: l['Cheque Number'],
      accountNumber: l['Account Number'] || '', ifscCode: l['IFSC Code'] || '',
      pinnedLocation: l['Pinned Location'], loanProduct: l['Loan Product'],
      riskLevel: l['Risk Level'], status: l['Status'],
      assignedAgentId: l['Assigned Agent ID'], assignedAgentName: agent?.['Name'] || '',
      verificationStatus: l['Verification Status'], verificationNotes: l['Verification Notes'],
      verificationSubmittedDate: l['Verification Submitted Date'] || null,
      adminFinalDecision: l['Admin Final Decision'], recommendationStatus: l['Recommendation Status'],
      customerPhotoUrl: l['Customer Photo URL'], aadhaarFrontUrl: l['Aadhaar Front URL'],
      aadhaarBackUrl: l['Aadhaar Back URL'], landmarkPhotoUrl: l['Landmark Photo URL'],
      housePhotoUrl: l['House Photo URL'], chequePhotoUrl: l['Cheque Photo URL'],
      documentFolderId: l['Document Folder ID'], notes: l['Notes'],
      aadhaarStatus: existing > 0 ? 'exists' : (l['Aadhaar No'] ? 'new' : ''),
      otpVerifiedAt: l['Otp Verified At'] || null, otpOverrideReason: l['Otp Override Reason'] || '',
      approvedAt: l['Approved At'] || null, disbursedAt: l['Disbursed At'] || null,
    }
  })

  // branches this viewer can filter by: every branch for Admin, their own for Staff
  const visibleBranches = branches
    .filter(b => scope.kind === 'all' || activeLinks.some(x => x['Branch ID'] === b['Branch ID'] && scope.kind === 'guarantors' && scope.ids.includes(x['Guarantor ID'])))
    .map(b => ({ branchId: b['Branch ID'], name: b['Name'] }))

  return ok({
    rows: enriched,
    pagination: { page: r.page, pageSize: r.pageSize, total: r.total, totalPages: Math.ceil(r.total / r.pageSize) },
    counts: { new: counts[0], history: counts[1], renewal: counts[2], approved: counts[3], stageNew: counts[4], stageAssigned: counts[5], stageCompleted: counts[6] },
    branches: visibleBranches,
  })
})

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await getSession(req)

  const csrfError = csrfProtection(req, session.userId)
  if (csrfError) return csrfError

  const validation = await validateBody(createLeadSchema)(req)
  if (!validation.success) return validation.response
  const body = validation.data
  await needFeature(session, lead(body.loanProduct === 'RENEWAL' ? 'leadsRenew' : 'leadsEdit'))   // Staff: renewals and new leads are separate parts
  if (!['Guarantor', 'Admin', 'Staff'].includes(session.role)) return err('No permission', 403)

  let guarantorId = body.guarantorId || ''
  let guarantorCode = ''
  if (session.role === 'Guarantor') {
    // First try to find by code (from session)
    let g = session.guarantorCode ? (await selectRows('Guarantors', qb => qb.eq('code', session.guarantorCode).limit(1))).rows[0] : undefined

    // If not found by code, try to find by userId (handle data inconsistency)
    if (!g) {
      g = (await selectRows('Guarantors', qb => qb.eq('user_id', session.userId).limit(1))).rows[0]
    }

    if (!g) {
      return err('Guarantor not found')
    }
    guarantorId = g['Guarantor ID']
    guarantorCode = g['Code']
  } else {
    const g = guarantorId ? (await getRowById('Guarantors', guarantorId)) || undefined : undefined
    if (!g) return err('Choose the guarantor for this lead')
    guarantorCode = g['Code'] || ''
  }

  // A renewal must pass the server-side rules (hold, permanent block, running loan, dues) and belong to this guarantor
  if (body.loanProduct === 'RENEWAL') {
    const cust = await customerForRenewalLead({ 'Notes': body.notes || '', 'Phone': body.phone, 'Customer Name': body.customerName })
    if (!cust) return err('Customer not found for this renewal')
    if (session.role === 'Guarantor' && cust['Guarantor ID'] !== guarantorId) return err('This customer does not belong to you')
    const el = await checkRenewalEligibility(cust['Customer ID'])
    if (!el.ok) return err(el.reason)
    const pending = (await countRows('Leads', qb => qb.eq('loan_product', 'RENEWAL').in('status', ['Pending', 'Approved']).ilike('notes', `%Customer ID: ${cust['Customer ID']}%`))) > 0
    if (pending) return err('A renewal request for this customer is already waiting')
  } else if (body.aadhaarNo && await isPermanentlyBlockedAadhaar(body.aadhaarNo)) {
    return err('This customer was closed permanently. An admin must re-admit them after fresh verification before a new lead can be added.')
  }

  // auto-reject if aadhaar already converted
  // leads with the same Aadhaar (digits in order, any spacing), found by the database; then checked exactly
  const digits = (v: string) => String(v || '').replace(/\D/g, '')
  if (body.loanProduct !== 'RENEWAL' && digits(body.aadhaarNo || '').length === 12) {
    const sameAadhaarLeads = await selectAll('Leads', qb => qb.ilike('aadhaar_no', `%${digits(body.aadhaarNo || '').split('').join('%')}%`))
    const open = sameAadhaarLeads.find(l => l['Loan Product'] !== 'RENEWAL' && digits(l['Aadhaar No']) === digits(body.aadhaarNo || '') && ['Pending', 'Agent Assigned', 'Verification Submitted', 'Approved'].includes(l['Status']))
    if (open) return err(`A lead for this Aadhaar is already in progress (${open['Customer Name']}, ${open['Status']}). Do not submit it twice.`)
  }
  const existingConverted = body.aadhaarNo ? (await selectRows('Leads', qb => qb.eq('aadhaar_no', body.aadhaarNo!).eq('status', 'Converted').limit(1))).rows[0] || null : null

  // optional second contact (husband, nominee ...)
  let altPhone = ''
  if (body.altPhone && body.altPhone.trim()) {
    const m = normalizeIndianMobile(body.altPhone)
    if (!m) return err('The second contact number must be a valid 10-digit mobile number')
    altPhone = m
  }
  const leadId = makeId('LEAD')
  // the day the lead is filed under: today by default, or a day of the coming two weeks (a lead taken late in the week goes on next week)
  const today = getTodayIST()
  if (body.submittedDate && (body.submittedDate > addDaysIST(today, 14) || body.submittedDate < addDaysIST(today, -90))) return err('Choose today or a day in the next two weeks.')
  const leadDate = body.submittedDate || today

  let folderId = ''
  let customerPhotoUrl = '', aadhaarFrontUrl = '', aadhaarBackUrl = ''
  let landmarkPhotoUrl = '', housePhotoUrl = '', chequePhotoUrl = ''

  try {
    if (body.customerPhoto || body.aadhaarFront || body.aadhaarBack || body.landmarkPhoto || body.housePhoto || body.chequePhoto) {
      folderId = await getLeadDocFolder(guarantorCode, body.customerName, leadId)
    }
    function toPayload(b64: string, filename: string) {
      const [header, data] = b64.split(',')
      const mimeType = header.match(/:(.*?);/)?.[1] || 'image/jpeg'
      return { fileName: filename, mimeType, base64Data: data }
    }
    if (body.customerPhoto) customerPhotoUrl = await uploadLeadPhoto(folderId, 'customer', toPayload(body.customerPhoto, 'customer_lead.jpg'), docLabel(body.customerName, leadId))
    if (body.aadhaarFront) aadhaarFrontUrl = await uploadLeadPhoto(folderId, 'aadhaar_front', toPayload(body.aadhaarFront, 'aadhaar_front_lead.jpg'), docLabel(body.customerName, leadId))
    if (body.aadhaarBack) aadhaarBackUrl = await uploadLeadPhoto(folderId, 'aadhaar_back', toPayload(body.aadhaarBack, 'aadhaar_back_lead.jpg'), docLabel(body.customerName, leadId))
    if (body.landmarkPhoto) landmarkPhotoUrl = await uploadLeadPhoto(folderId, 'landmark', toPayload(body.landmarkPhoto, 'landmark_lead.jpg'), docLabel(body.customerName, leadId))
    if (body.housePhoto) housePhotoUrl = await uploadLeadPhoto(folderId, 'house', toPayload(body.housePhoto, 'house_lead.jpg'), docLabel(body.customerName, leadId))
    if (body.chequePhoto) chequePhotoUrl = await uploadLeadPhoto(folderId, 'cheque', toPayload(body.chequePhoto, 'cheque_lead.jpg'), docLabel(body.customerName, leadId))
  } catch (e) {
    // Drive upload failed — continue without photos, can be added later
  }

  const autoRejected = !!existingConverted
  const status = autoRejected ? 'Rejected' : 'Pending'
  const adminDecision = autoRejected ? 'Auto-rejected: existing customer found.' : ''

  await appendRow('Leads', {
    'Lead ID': leadId,
    'Submitted Date': leadDate,
    'Guarantor ID': guarantorId,
    'Guarantor User ID': session.userId,
    'Customer Name': body.customerName || '',
    'Phone': body.phone || '',
    'Aadhaar No': body.aadhaarNo || '',
    'Address': body.address || '',
    'House Name': body.houseName || '',
    'Place': body.place || '',
    'Landmark': body.landmark || '',
    'Nominee Name': body.nomineeName || '',
    'Nominee Phone': body.nomineePhone || '',
    'Alt Phone': altPhone || null as any,
    'Alt Phone Label': altPhone ? (body.altPhoneLabel || 'Other') : null as any,
    'Occupation': body.occupation || '',
    'PAN No': body.panNo || '',
    'Cheque Number': body.chequeNumber || '',
    'Pinned Location': body.pinnedLocation || '',
    'Loan Product': body.loanProduct || '',
    'Risk Level': body.riskLevel || '',
    'Status': status,
    'Assigned Agent ID': null as any,
    // Verification fields omitted - will default to NULL in DB (enum/date columns don't accept empty strings)
    'Verification Notes': '',
    'Admin Final Decision': adminDecision,
    'Recommendation Status': '',
    'Customer Photo URL': customerPhotoUrl,
    'Aadhaar Front URL': aadhaarFrontUrl,
    'Aadhaar Back URL': aadhaarBackUrl,
    'Landmark Photo URL': landmarkPhotoUrl,
    'House Photo URL': housePhotoUrl,
    'Cheque Photo URL': chequePhotoUrl,
    'Document Folder ID': folderId,
    'Notes': body.notes || '',
    'Account Number': body.accountNumber || '',
    'IFSC Code': body.ifscCode || '',
    'Updated At': nowIso(),
  })

  await createAuditLogger(req, { userId: session.userId, username: session.username, role: session.role }).success(
    AUDIT_ACTIONS.LEAD_CREATE,
    'Lead',
    leadId,
    { customerName: body.customerName, loanProduct: body.loanProduct, status }
  )

  await notifyRole('Admin', 'New Lead Submitted', `${body.customerName} submitted by ${session.name}`, 'Lead', leadId)
  // The guarantor's branch team (manager, assistant manager, accountant) must phone the customer and plan the visit
  try {
    if (!autoRejected) await notifyBranchOfLead(guarantorId, 'New lead to call', `${body.customerName} from ${session.name}. Call the customer and fix the visit location.`, leadId)
  } catch (e) { reportError('Branch lead alert failed', e) }

  return ok({ leadId, autoRejected })
})
