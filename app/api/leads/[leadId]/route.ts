import { NextRequest } from 'next/server'
import { apiHandler, requireRole, ok, err, getSession } from '@/lib/api'
import { readTable, updateById, appendRow, deleteRow, findRecord, makeId, nowIso, formatDateYmd, addDays, getNextSaturday, deleteById, invalidateCache } from '@/lib/supabase-db'
import { uploadLeadPhoto, listFolderFiles, driveUrl, getLeadDocFolder } from '@/lib/drive'
import { notifyUser, notifyRole } from '@/lib/notifications'
import { validateBody, submitVerificationSchema, adminReviewSchema, assignAgentSchema, updateLeadSchema, tripSchema } from '@/lib/validation'
import { FilePayload } from '@/types'
import { csrfProtection } from '@/lib/csrf'

function toPayload(b64: string, filename: string): FilePayload {
  const [header, data] = b64.split(',')
  const mimeType = header.match(/:(.*?);/)?.[1] || 'image/jpeg'
  return { fileName: filename, mimeType, base64Data: data }
}

export const PATCH = apiHandler(async (req: NextRequest, { params }: any) => {
  const { leadId } = await params
  const session = await getSession(req)

  const csrfError = csrfProtection(req, session.userId)
  if (csrfError) return csrfError

  const rawBody = await req.json()
  const { action } = rawBody

  if (action === 'update') {
    const validation = updateLeadSchema.safeParse(rawBody)
    if (!validation.success) {
      const errors = validation.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join('; ')
      return err(errors, 400)
    }
    const body = validation.data

    const session = await requireRole(req, ['Admin', 'Staff'])
    const leads = await readTable('Leads', { forceFresh: true })
    const lead = findRecord(leads, 'Lead ID', leadId)
    if (!lead) return err('Lead not found')
    await updateById('Leads', leadId, {
      'Customer Name': body.customerName || lead['Customer Name'],
      'Phone': body.phone || lead['Phone'],
      'Aadhaar No': body.aadhaarNo || lead['Aadhaar No'],
      'Address': body.address || lead['Address'],
      'House Name': body.houseName || lead['House Name'],
      'Place': body.place || lead['Place'],
      'Landmark': body.landmark || lead['Landmark'],
      'Nominee Name': body.nomineeName || lead['Nominee Name'],
      'Nominee Phone': body.nomineePhone || lead['Nominee Phone'],
      'Occupation': body.occupation || lead['Occupation'],
      'PAN No': body.panNo || lead['PAN No'],
      'Cheque Number': body.chequeNumber || lead['Cheque Number'],
      'Loan Product': body.loanProduct || lead['Loan Product'],
      'Risk Level': body.riskLevel || lead['Risk Level'],
      'Notes': body.notes || lead['Notes'],
      'Updated At': nowIso(),
    })
    invalidateCache('Leads')
    return ok({ success: true })
  }

  if (action === 'assignAgent') {
    const validation = assignAgentSchema.safeParse(rawBody)
    if (!validation.success) {
      const errors = validation.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join('; ')
      return err(errors, 400)
    }
    const body = validation.data

    const session = await requireRole(req, ['Admin', 'Staff'])
    const [leads, agents, users] = await Promise.all([readTable('Leads'), readTable('Agents'), readTable('Users')])
    const lead = findRecord(leads, 'Lead ID', leadId)
    if (!lead) return err('Lead not found')
    const agent = findRecord(agents, 'Agent ID', body.agentId)
    if (!agent) return err('Agent not found')
    await updateById('Leads', leadId, {
      'Assigned Agent ID': body.agentId,
      'Status': 'Agent Assigned',
      'Updated At': nowIso(),
    })
    invalidateCache('Leads')
    await notifyUser(agent['User ID'], agent['Role'] || 'NGF AGENT', 'Lead Assigned', `You have been assigned to verify ${lead['Customer Name']}`, 'Lead', leadId)
    return ok({ success: true })
  }

  if (action === 'submitVerification') {
    const validation = submitVerificationSchema.safeParse(rawBody)
    if (!validation.success) {
      const errors = validation.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join('; ')
      return err(errors, 400)
    }
    const body = validation.data

    const session = await requireRole(req, ['NGF AGENT'])
    const leads = await readTable('Leads')
    const lead = findRecord(leads, 'Lead ID', leadId)
    if (!lead) return err('Lead not found')
    // Only the agent the lead is assigned to may verify it, and only while it is waiting for verification
    const myAgent = (await readTable('Agents')).find(a => a['User ID'] === session.userId)
    if (!myAgent || lead['Assigned Agent ID'] !== myAgent['Agent ID']) return err('No permission', 403)
    if (lead['Status'] !== 'Agent Assigned') return err('This lead is not waiting for verification')
    let folderId = lead['Document Folder ID']
    let customerPhotoUrl = lead['Customer Photo URL']
    let housePhotoUrl = lead['House Photo URL']
    let landmarkPhotoUrl = lead['Landmark Photo URL']
    let chequePhotoUrl = lead['Cheque Photo URL']
    let aadhaarFrontUrl = lead['Aadhaar Front URL']
    let aadhaarBackUrl = lead['Aadhaar Back URL']

    // If folder doesn't exist yet (lead submitted without photos), create it now
    if (!folderId) {
      const guarantors = await readTable('Guarantors')
      const g = guarantors.find(g => g['Guarantor ID'] === lead['Guarantor ID'])
      const guarantorCode = g?.['Code'] || 'NGF'
      folderId = await getLeadDocFolder(guarantorCode, lead['Customer Name'])
      await updateById('Leads', leadId, { 'Document Folder ID': folderId, 'Updated At': nowIso() })
      invalidateCache('Leads')
    }

    // Upload photos with error handling
    try {
      if (body.customerPhoto) customerPhotoUrl = await uploadLeadPhoto(folderId, 'customer', toPayload(body.customerPhoto, 'customer_lead.jpg'))
      if (body.housePhoto) housePhotoUrl = await uploadLeadPhoto(folderId, 'house', toPayload(body.housePhoto, 'house_lead.jpg'))
      if (body.landmarkPhoto) landmarkPhotoUrl = await uploadLeadPhoto(folderId, 'landmark', toPayload(body.landmarkPhoto, 'landmark_lead.jpg'))
      if (body.chequePhoto) chequePhotoUrl = await uploadLeadPhoto(folderId, 'cheque', toPayload(body.chequePhoto, 'cheque_lead.jpg'))
      if (body.aadhaarFront) aadhaarFrontUrl = await uploadLeadPhoto(folderId, 'aadhaar_front', toPayload(body.aadhaarFront, 'aadhaar_front_lead.jpg'))
      if (body.aadhaarBack) aadhaarBackUrl = await uploadLeadPhoto(folderId, 'aadhaar_back', toPayload(body.aadhaarBack, 'aadhaar_back_lead.jpg'))
    } catch (uploadError) {
      console.error('submitVerification: Photo upload failed:', uploadError)
      return err(`Photo upload failed: ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}`)
    }

    const notes = JSON.stringify({ riskNotes: body.riskNotes || '', gpsCoordinates: body.gpsCoordinates || '', mapsLink: body.mapsLink || '' })
    try {
      await updateById('Leads', leadId, {
        'Verification Notes': notes,
        'Verification Submitted Date': nowIso().slice(0, 10),
        'Recommendation Status': body.recommendationStatus || '',
        'Risk Level': body.riskLevel || lead['Risk Level'],
        'Status': 'Verification Submitted',
        'Customer Name': body.customerName || lead['Customer Name'],
        'Phone': body.phone || lead['Phone'],
        'Aadhaar No': body.aadhaarNo || lead['Aadhaar No'],
        'Address': body.address || lead['Address'],
        'Place': body.place || lead['Place'],
        'House Name': body.houseName || lead['House Name'],
        'Landmark': body.landmark || lead['Landmark'],
        'Nominee Name': body.nomineeName || lead['Nominee Name'],
        'Nominee Phone': body.nomineePhone || lead['Nominee Phone'],
        'Occupation': body.occupation || lead['Occupation'],
        'PAN No': body.panNo || lead['PAN No'],
        'Cheque Number': body.chequeNumber || lead['Cheque Number'],
        'Account Number': body.accountNumber || lead['Account Number'],
        'IFSC Code': body.ifscCode || lead['IFSC Code'],
        'Customer Photo URL': customerPhotoUrl,
        'House Photo URL': housePhotoUrl,
        'Landmark Photo URL': landmarkPhotoUrl,
        'Cheque Photo URL': chequePhotoUrl,
        'Aadhaar Front URL': aadhaarFrontUrl,
        'Aadhaar Back URL': aadhaarBackUrl,
        'Updated At': nowIso(),
      })
      invalidateCache('Leads')
      await notifyRole('Admin', 'Verification Submitted', `Verification for ${lead['Customer Name']} submitted by ${session.name}`, 'Lead', leadId)
      return ok({ success: true })
    } catch (dbError) {
      console.error('submitVerification: DB update failed:', dbError)
      return err(`Database update failed: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`)
    }
  }

  if (action === 'adminReview') {
    const validation = adminReviewSchema.safeParse(rawBody)
    if (!validation.success) {
      const errors = validation.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join('; ')
      return err(errors, 400)
    }
    const body = validation.data

    const session = await requireRole(req, ['Admin', 'Staff'])
    const [leads, guarantors, agents] = await Promise.all([readTable('Leads'), readTable('Guarantors'), readTable('Agents')])
    const lead = findRecord(leads, 'Lead ID', leadId)
    if (!lead) return err('Lead not found')
    const { decision, notes } = body

    if (decision === 'Approve Loan') {
      try {
        if (lead['Loan Product'] === 'RENEWAL') {
          await approveRenewal(lead, guarantors)
        } else {
          await updateById('Leads', leadId, { 'Status': 'Approved', 'Admin Final Decision': notes || 'Approved', 'Updated At': nowIso() })
          invalidateCache('Leads')
          await approveLoan(lead, guarantors, agents, body.loanProduct)
        }
        const g = findRecord(guarantors, 'Guarantor ID', lead['Guarantor ID'])
        if (g) await notifyUser(g['User ID'], 'Guarantor', 'Lead Approved', `${lead['Customer Name']} has been approved for a loan.`, 'Lead', leadId)
      } catch (e: any) {
        console.error('approveLoan failed:', e)
        return err(e.message || 'Failed to approve loan')
      }
    } else if (decision === 'Reject Lead') {
      await updateById('Leads', leadId, { 'Status': 'Rejected', 'Admin Final Decision': notes || 'Rejected', 'Updated At': nowIso() })
      invalidateCache('Leads')
      const g = findRecord(guarantors, 'Guarantor ID', lead['Guarantor ID'])
      if (g) await notifyUser(g['User ID'], 'Guarantor', 'Lead Rejected', `${lead['Customer Name']} has been rejected.`, 'Lead', leadId)
    } else if (decision === 'Request Reverification') {
      await updateById('Leads', leadId, { 'Status': 'Agent Assigned', 'Admin Final Decision': notes || '', 'Updated At': nowIso() })
      invalidateCache('Leads')
    }
    return ok({ success: true })
  }

  if (action === 'scanFolder') {
    await requireRole(req, ['Admin', 'Staff'])
    const leads = await readTable('Leads')
    const lead = findRecord(leads, 'Lead ID', leadId)
    if (!lead) return err('Lead not found')
    const folderId = lead['Document Folder ID']
    if (!folderId) return err('No document folder for this lead')
    const files = await listFolderFiles(folderId)
    const imgExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif']
    const imgFiles = files.filter(f => imgExts.some(e => (f.name || '').toLowerCase().endsWith(e)))
    const updates: Record<string, string> = {}
    const matched = new Set<string>()

    // Pass 1: match by filename prefix
    imgFiles.forEach(f => {
      const n = (f.name || '').toLowerCase()
      const url = driveUrl(f.id!)
      if (n.startsWith('customer_') && !lead['Customer Photo URL'] && !updates['Customer Photo URL']) { updates['Customer Photo URL'] = url; matched.add(f.id!) }
      else if (n.startsWith('aadhaar_front_') && !lead['Aadhaar Front URL'] && !updates['Aadhaar Front URL']) { updates['Aadhaar Front URL'] = url; matched.add(f.id!) }
      else if (n.startsWith('aadhaar_back_') && !lead['Aadhaar Back URL'] && !updates['Aadhaar Back URL']) { updates['Aadhaar Back URL'] = url; matched.add(f.id!) }
      else if (n.startsWith('house_') && !lead['House Photo URL'] && !updates['House Photo URL']) { updates['House Photo URL'] = url; matched.add(f.id!) }
      else if (n.startsWith('landmark_') && !lead['Landmark Photo URL'] && !updates['Landmark Photo URL']) { updates['Landmark Photo URL'] = url; matched.add(f.id!) }
      else if (n.startsWith('cheque_') && !lead['Cheque Photo URL'] && !updates['Cheque Photo URL']) { updates['Cheque Photo URL'] = url; matched.add(f.id!) }
    })

    // Pass 2: positional fallback — assign unmatched images to remaining empty slots
    const unmatched = imgFiles.filter(f => !matched.has(f.id!))
    const slots = [
      ['Customer Photo URL', lead['Customer Photo URL']],
      ['Aadhaar Front URL', lead['Aadhaar Front URL']],
      ['Aadhaar Back URL', lead['Aadhaar Back URL']],
      ['House Photo URL', lead['House Photo URL']],
      ['Landmark Photo URL', lead['Landmark Photo URL']],
      ['Cheque Photo URL', lead['Cheque Photo URL']],
    ]
    let fi = 0
    slots.forEach(([col, val]) => {
      if (!val && !updates[col] && fi < unmatched.length) {
        updates[col] = driveUrl(unmatched[fi++].id!)
      }
    })

    const found = Object.keys(updates).length
    if (found) { updates['Updated At'] = nowIso(); await updateById('Leads', leadId, updates); invalidateCache('Leads') }
    return ok({ found })
  }

  return err('Unknown action')
})

export const DELETE = apiHandler(async (req: NextRequest, { params }: any) => {
  const { leadId } = await params
  await requireRole(req, ['Admin', 'Staff'])

  // First, find and delete any customers that reference this lead
  const [leads, customers, loans, repayments] = await Promise.all([
    readTable('Leads'),
    readTable('Customers'),
    readTable('Loans'),
    readTable('Repayments'),
  ])

  const lead = findRecord(leads, 'Lead ID', leadId)
  if (!lead) return err('Lead not found')

  // Delete customers that reference this lead (and their loans/repayments)
  const relatedCustomers = customers.filter(c => c['Lead ID'] === leadId)
  for (const customer of relatedCustomers) {
    const customerId = customer['Customer ID']

    // Delete repayments for this customer
    const customerRepayments = repayments.filter(r => r['Customer ID'] === customerId)
    for (const r of customerRepayments) {
      await deleteById('Repayments', r['Repayment ID'])
    }

    // Delete loans for this customer
    const customerLoans = loans.filter(l => l['Customer ID'] === customerId)
    for (const l of customerLoans) {
      await deleteById('Loans', l['Loan ID'])
    }

    // Delete the customer
    await deleteById('Customers', customerId)
  }

  // Now delete the lead
  await deleteById('Leads', leadId)
  return ok({ success: true })
})

async function makeLoanId(guarantorCode: string): Promise<string> {
  const loans = await readTable('Loans')
  const prefix = `${guarantorCode}-`
  const usedNums = new Set(
    loans.map(l => l['Loan ID']).filter(id => id?.startsWith(prefix))
      .map(id => parseInt(id.slice(prefix.length), 10)).filter(n => !isNaN(n))
  )
  let num: number
  do { num = Math.floor(1000 + Math.random() * 9000) } while (usedNums.has(num))
  return `${prefix}${num}`
}

async function approveLoan(lead: Record<string, string>, guarantors: Record<string, string>[], agents: Record<string, string>[], productKey?: string) {
  const { findLoanProduct, getLoanProducts } = await import('@/lib/loanProducts')
  const product = (await findLoanProduct(productKey || lead['Loan Product'])) || (await getLoanProducts())[0]
  const g = guarantors.find(g => g['Guarantor ID'] === lead['Guarantor ID'])
  const guarantorCode = g?.['Code'] || 'NGF'
  
  // Check if customer already exists for this lead (e.g., from previous approval)
  const customers = await readTable('Customers')
  let customer = customers.find(c => c['Lead ID'] === lead['Lead ID'])
  let customerId: string
  
  if (customer) {
    // Reuse existing customer
    customerId = customer['Customer ID']
  } else {
    // Create new customer
    customerId = makeId('CUST')
  }

  // Generate loanId and dates for both new and existing customers
  const loanId = await makeLoanId(guarantorCode)
  const startDate = getNextSaturday()
  const endDate = addDays(startDate, (product.durationWeeks - 1) * 7)

  if (!customer) {
    // Create new customer only if doesn't exist
    await appendRow('Customers', {
      'Customer ID': customerId, 'Lead ID': lead['Lead ID'],
      'Name': lead['Customer Name'], 'Phone': lead['Phone'],
      'Address': lead['Address'], 'House Name': lead['House Name'],
      'Place': lead['Place'], 'Landmark': lead['Landmark'],
      'Occupation': lead['Occupation'], 'Guarantor ID': lead['Guarantor ID'],
      'Active Loan ID': loanId, 'Status': 'Active',
      'Created At': nowIso(), 'Updated At': nowIso(),
    })
  } else {
    // Update existing customer's active loan and status
    await updateById('Customers', customerId, { 'Active Loan ID': loanId, 'Status': 'Active', 'Updated At': nowIso() })
  }

  // Check if customer already has an active loan (for re-verification re-approval)
  const loans = await readTable('Loans')
  const existingLoan = loans.find(l => l['Customer ID'] === customerId && l['Status'] === 'Active')

  if (existingLoan) {
    // Update existing loan instead of creating new one (due to unique constraint on customer_id)
    await updateById('Loans', existingLoan['Loan ID'], {
      'Loan ID': loanId,
      'Lead ID': lead['Lead ID'],
      'Guarantor ID': lead['Guarantor ID'],
      'Assigned Agent ID': lead['Assigned Agent ID'] ?? null,
      'Principal Amount': String(product.principal),
      'Interest Deduction': String(product.interestDeduction),
      'Guarantor Commission': String(product.guarantorCommission),
      'Net Disbursed': String(product.netDisbursed),
      'Weekly Collection Amount': String(product.weeklyCollection),
      'Duration Weeks': String(product.durationWeeks),
      'Total Collection Amount': String(product.totalCollection),
      'Status': 'Active',
      'Start Date': formatDateYmd(startDate),
      'End Date': formatDateYmd(endDate),
      'Updated At': nowIso(),
    })
    // Delete old repayments and create new ones
    const oldRepayments = await readTable('Repayments')
    const loanRepayments = oldRepayments.filter(r => r['Loan ID'] === existingLoan['Loan ID'])
    for (const r of loanRepayments) {
      await deleteById('Repayments', r['Repayment ID'])
    }
  } else {
    await appendRow('Loans', {
      'Loan ID': loanId, 'Customer ID': customerId, 'Lead ID': lead['Lead ID'],
      'Guarantor ID': lead['Guarantor ID'], 'Assigned Agent ID': lead['Assigned Agent ID'] ?? null,
      'Principal Amount': String(product.principal), 'Interest Deduction': String(product.interestDeduction),
      'Guarantor Commission': String(product.guarantorCommission), 'Net Disbursed': String(product.netDisbursed),
      'Weekly Collection Amount': String(product.weeklyCollection), 'Duration Weeks': String(product.durationWeeks),
      'Total Collection Amount': String(product.totalCollection), 'Status': 'Active',
      'Start Date': formatDateYmd(startDate), 'End Date': formatDateYmd(endDate),
      'Created At': nowIso(), 'Updated At': nowIso(),
    })
  }

  // Create repayments for both new and existing loans
  for (let w = 0; w < product.durationWeeks; w++) {
    const due = addDays(startDate, w * 7)
    const amount = (w === product.durationWeeks - 1) ? product.lastWeekCollection : product.weeklyCollection
    await appendRow('Repayments', {
      'Repayment ID': makeId('RPY'), 'Loan ID': loanId, 'Customer ID': customerId,
      'Due Date': formatDateYmd(due), 'Week No': String(w + 1),
      'Amount': String(amount), 'Status': 'Pending',
      'Paid Date': null as any, 'NGF Agent ID': null as any, 'Proof File ID': null as any, 'Notes': '',
      'Created At': nowIso(), 'Updated At': nowIso(),
    })
  }
  await updateById('Leads', lead['Lead ID'], { 'Status': 'Converted', 'Loan Product': product.key, 'Updated At': nowIso() })
  invalidateCache('Leads')
}

// Renewal: reuse the existing customer and their previous loan's terms, disburse a
// fresh loan + repayment schedule, and reactivate the customer.
async function approveRenewal(lead: Record<string, string>, guarantors: Record<string, string>[]) {
  const [customers, loans] = await Promise.all([readTable('Customers'), readTable('Loans')])

  // The renewal request stores the source customer id in its notes
  const m = (lead['Notes'] || '').match(/Customer ID:\s*(\S+)/)
  const customer = (m ? customers.find(c => c['Customer ID'] === m[1]) : undefined)
    || customers.find(c => c['Phone'] === lead['Phone'] && c['Name'] === lead['Customer Name'])
  if (!customer) throw new Error('Customer not found for renewal')
  // The customer must belong to the guarantor who asked, and must have no loan still running
  if (customer['Guarantor ID'] !== lead['Guarantor ID']) throw new Error('This customer does not belong to the guarantor who requested the renewal')
  if (loans.some(l => l['Customer ID'] === customer['Customer ID'] && l['Status'] === 'Active')) throw new Error('This customer still has an active loan')

  const prev = loans
    .filter(l => l['Customer ID'] === customer['Customer ID'])
    .sort((a, b) => String(b['Created At']).localeCompare(String(a['Created At'])))[0]
  if (!prev) throw new Error('No previous loan found for this customer')

  const g = guarantors.find(gg => gg['Guarantor ID'] === customer['Guarantor ID'])
  const guarantorCode = g?.['Code'] || 'NGF'
  const loanId = await makeLoanId(guarantorCode)
  const startDate = getNextSaturday()
  const durationWeeks = Number(prev['Duration Weeks']) || 10
  const endDate = addDays(startDate, (durationWeeks - 1) * 7)
  const weekly = Number(prev['Weekly Collection Amount']) || 0
  const total = Number(prev['Total Collection Amount']) || weekly * durationWeeks
  const lastWeekAmt = total - weekly * Math.max(0, durationWeeks - 1)

  await appendRow('Loans', {
    'Loan ID': loanId, 'Customer ID': customer['Customer ID'], 'Lead ID': lead['Lead ID'],
    'Guarantor ID': customer['Guarantor ID'], 'Assigned Agent ID': prev['Assigned Agent ID'] ?? null,
    'Principal Amount': prev['Principal Amount'], 'Interest Deduction': prev['Interest Deduction'],
    'Guarantor Commission': prev['Guarantor Commission'], 'Net Disbursed': prev['Net Disbursed'],
    'Weekly Collection Amount': String(weekly), 'Duration Weeks': String(durationWeeks),
    'Total Collection Amount': String(total), 'Status': 'Active',
    'Start Date': formatDateYmd(startDate), 'End Date': formatDateYmd(endDate),
    'Created At': nowIso(), 'Updated At': nowIso(),
  })
  for (let w = 0; w < durationWeeks; w++) {
    const due = addDays(startDate, w * 7)
    const amount = (w === durationWeeks - 1) ? lastWeekAmt : weekly
    await appendRow('Repayments', {
      'Repayment ID': makeId('RPY'), 'Loan ID': loanId, 'Customer ID': customer['Customer ID'],
      'Due Date': formatDateYmd(due), 'Week No': String(w + 1),
      'Amount': String(amount), 'Status': 'Pending',
      'Paid Date': '', 'NGF Agent ID': '', 'Proof File ID': '', 'Notes': '',
      'Created At': nowIso(), 'Updated At': nowIso(),
    })
  }
  await updateById('Customers', customer['Customer ID'], { 'Active Loan ID': loanId, 'Status': 'Active', 'Updated At': nowIso() })
  await updateById('Leads', lead['Lead ID'], { 'Status': 'Converted', 'Updated At': nowIso() })
  invalidateCache('Customers')
  invalidateCache('Leads')
}
