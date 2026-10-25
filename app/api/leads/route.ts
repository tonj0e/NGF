import { NextRequest } from 'next/server'
import { apiHandler, getSession, requireRole, ok, err } from '@/lib/api'
import { needFeature } from '@/lib/access'
import { readTable, appendRow, findRecord, makeId, nowIso, paginate } from '@/lib/supabase-db'
import { getLeadDocFolder, uploadLeadPhoto, docLabel } from '@/lib/drive'
import { notifyRole, notifyUser } from '@/lib/notifications'
import { validateBody, createLeadSchema } from '@/lib/validation'
import { createAuditLogger, AUDIT_ACTIONS } from '@/lib/audit'
import { csrfProtection } from '@/lib/csrf'
import { notifyBranchOfLead } from '@/lib/routes'
import { getBranchAccess, canSeeBranch } from '@/lib/branchAccess'
import { checkRenewalEligibility, customerForRenewalLead, isPermanentlyBlockedAadhaar } from '@/lib/renewalRules'

export const GET = apiHandler(async (req: NextRequest) => {
  const session = await getSession(req)
  await needFeature(session, [])
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || ''
  const page = Number(searchParams.get('page') || 1)
  const pageSize = Number(searchParams.get('pageSize') || 20)

  const [leads, users, agents, guarantors, branches, guarantorBranches] = await Promise.all([
    readTable('Leads', { forceFresh: true }),
    readTable('Users', { forceFresh: true }),
    readTable('Agents', { forceFresh: true }),
    readTable('Guarantors', { forceFresh: true }),
    readTable('Branches'),
    readTable('GuarantorBranches'),
  ])
  const branchOf = (guarantorId: string) => guarantorBranches.find(x => x['Guarantor ID'] === guarantorId && String(x['Is Active']) !== 'false')?.['Branch ID'] || ''

  let filtered = leads
  if (session.role === 'Guarantor') {
    // First try to find by code (from session)
    let g = guarantors.find(g => g['Code'] === session.guarantorCode)

    // If not found by code, try to find by userId (handle data inconsistency)
    if (!g) {
      g = guarantors.find(g => g['User ID'] === session.userId)
    }

    if (g) {
      filtered = filtered.filter(l => l['Guarantor ID'] === g['Guarantor ID'])
    } else {
      // If guarantor not found, show no leads
      filtered = []
    }
  } else if (session.role === 'NGF AGENT') {
    const agent = agents.find(a => a['User ID'] === session.userId)
    filtered = filtered.filter(l => l['Assigned Agent ID'] === agent?.['Agent ID'])
  }
  else if (session.role === 'Staff') {
    // Branch staff see only the leads of guarantors in their own branch(es)
    const access = await getBranchAccess(session)
    filtered = filtered.filter(l => canSeeBranch(access, branchOf(l['Guarantor ID'])))
  }
  if (status) filtered = filtered.filter(l => l['Status'] === status)

  const enriched = filtered.map(l => {
    const guarantor = guarantors.find(g => g['Guarantor ID'] === l['Guarantor ID'])
    const agent = agents.find(a => a['Agent ID'] === l['Assigned Agent ID'])
    const branchId = branchOf(l['Guarantor ID'])
    const existing = leads.filter(x => x['Aadhaar No'] && x['Aadhaar No'] === l['Aadhaar No'] && x['Lead ID'] !== l['Lead ID'])
    return {
      leadId: l['Lead ID'], submittedDate: l['Submitted Date'],
      guarantorId: l['Guarantor ID'], guarantorName: guarantor?.['Name'] || '',
      branchId, branchName: branches.find(b => b['Branch ID'] === branchId)?.['Name'] || '',
      customerName: l['Customer Name'], phone: l['Phone'],
      aadhaarNo: l['Aadhaar No'], address: l['Address'],
      houseName: l['House Name'], place: l['Place'], landmark: l['Landmark'],
      nomineeName: l['Nominee Name'], nomineePhone: l['Nominee Phone'],
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
      aadhaarStatus: existing.length > 0 ? 'exists' : (l['Aadhaar No'] ? 'new' : ''),
      otpVerifiedAt: l['Otp Verified At'] || null, otpOverrideReason: l['Otp Override Reason'] || '',
      approvedAt: l['Approved At'] || null, disbursedAt: l['Disbursed At'] || null,
    }
  })

  return ok(paginate(enriched, page, pageSize))
})

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await getSession(req)
  await needFeature(session, ['leads', 'verificationPlanning'])

  const csrfError = csrfProtection(req, session.userId)
  if (csrfError) return csrfError

  const validation = await validateBody(createLeadSchema)(req)
  if (!validation.success) return validation.response
  const body = validation.data
  if (!['Guarantor', 'Admin', 'Staff'].includes(session.role)) return err('No permission', 403)

  const guarantors = await readTable('Guarantors')

  let guarantorId = body.guarantorId || ''
  let guarantorCode = ''
  if (session.role === 'Guarantor') {
    // First try to find by code (from session)
    let g = guarantors.find(g => g['Code'] === session.guarantorCode)

    // If not found by code, try to find by userId (handle data inconsistency)
    if (!g) {
      g = guarantors.find(g => g['User ID'] === session.userId)
    }

    if (!g) {
      return err('Guarantor not found')
    }
    guarantorId = g['Guarantor ID']
    guarantorCode = g['Code']
  } else {
    const g = guarantors.find(g => g['Guarantor ID'] === guarantorId)
    if (!g) return err('Choose the guarantor for this lead')
    guarantorCode = g['Code'] || ''
  }

  // A renewal must pass the server-side rules (hold, permanent block, running loan, dues) and belong to this guarantor
  if (body.loanProduct === 'RENEWAL') {
    const customers = await readTable('Customers', { forceFresh: true })
    const cust = customerForRenewalLead({ 'Notes': body.notes || '', 'Phone': body.phone, 'Customer Name': body.customerName }, customers)
    if (!cust) return err('Customer not found for this renewal')
    if (session.role === 'Guarantor' && cust['Guarantor ID'] !== guarantorId) return err('This customer does not belong to you')
    const el = await checkRenewalEligibility(cust['Customer ID'])
    if (!el.ok) return err(el.reason)
    const pending = (await readTable('Leads', { forceFresh: true })).some(l => l['Loan Product'] === 'RENEWAL' && ['Pending', 'Approved'].includes(l['Status']) && (l['Notes'] || '').includes(`Customer ID: ${cust['Customer ID']}`))
    if (pending) return err('A renewal request for this customer is already waiting')
  } else if (body.aadhaarNo && await isPermanentlyBlockedAadhaar(body.aadhaarNo)) {
    return err('This customer was closed permanently. An admin must re-admit them after fresh verification before a new lead can be added.')
  }

  // auto-reject if aadhaar already converted
  const leads = await readTable('Leads', { forceFresh: true })
  const digits = (v: string) => String(v || '').replace(/\D/g, '')
  if (body.loanProduct !== 'RENEWAL' && digits(body.aadhaarNo || '').length === 12) {
    const open = leads.find(l => l['Loan Product'] !== 'RENEWAL' && digits(l['Aadhaar No']) === digits(body.aadhaarNo || '') && ['Pending', 'Agent Assigned', 'Verification Submitted', 'Approved'].includes(l['Status']))
    if (open) return err(`A lead for this Aadhaar is already in progress (${open['Customer Name']}, ${open['Status']}). Do not submit it twice.`)
  }
  const existingConverted = body.aadhaarNo ? leads.find(l => l['Aadhaar No'] === body.aadhaarNo && l['Status'] === 'Converted') : null

  const leadId = makeId('LEAD')

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
    'Submitted Date': nowIso().slice(0, 10),
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
  } catch (e) { console.error('Branch lead alert failed:', e instanceof Error ? e.message : e) }

  return ok({ leadId, autoRejected })
})
