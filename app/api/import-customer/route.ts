import { NextRequest } from 'next/server'
import { apiHandler, requireRole, ok, err } from '@/lib/api'
import { readTable, appendRow, updateById, findRecord, makeId, nowIso, formatDateYmd, invalidateCache } from '@/lib/supabase-db'
import { APP_CONFIG } from '@/lib/config'
import { getLeadDocFolder, uploadLeadPhoto } from '@/lib/drive'
import { ensurePayCodes } from '@/lib/payments'

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

async function makeCustomerId(guarantorCode: string): Promise<string> {
  const customers = await readTable('Customers')
  const prefix = `NGF${guarantorCode}`
  const usedNums = new Set(
    customers.map(c => c['Customer ID']).filter(id => id?.startsWith(prefix))
      .map(id => parseInt(id.slice(prefix.length), 10)).filter(n => !isNaN(n))
  )
  let num: number
  do { num = Math.floor(1000 + Math.random() * 9000) } while (usedNums.has(num))
  return `${prefix}${num.toString().padStart(4, '0')}`
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date); d.setDate(d.getDate() + days); return d
}

function firstSaturday(disburseDate: string): Date {
  const istOffset = 5.5 * 60 * 60 * 1000
  const d = new Date(new Date(disburseDate).getTime() + istOffset)
  const day = d.getUTCDay()
  d.setUTCDate(d.getUTCDate() + (day === 6 ? 0 : 6 - day))
  return new Date(d.toISOString().slice(0, 10))
}

async function b64ToFile(b64: string, filename: string): Promise<File> {
  const res = await fetch(b64)
  const blob = await res.blob()
  return new File([blob], filename, { type: blob.type })
}

export const POST = apiHandler(async (req: NextRequest) => {
  await requireRole(req, ['Admin'])
  const body = await req.json()

  const {
    name, phone, address, houseName, place, landmark, mapsLink, occupation,
    aadhaarNo, nomineeName, nomineePhone, accountNumber, ifscCode, panNo,
    riskLevel, recommendationStatus,
    guarantorId, agentId, loanProduct, disburseDate, joinedDate,
    weekStatusList,
    customerPhoto, aadhaarFront, aadhaarBack, housePhoto, landmarkPhoto, chequePhoto,
  } = body

  if (!name || !phone || !guarantorId || !loanProduct || !disburseDate)
    return err('Name, phone, guarantor, loan product and disburse date are required')

  const product = APP_CONFIG.LOAN_PRODUCTS.find(p => p.key === loanProduct)
  if (!product) return err('Invalid loan product')

  const [guarantors] = await Promise.all([readTable('Guarantors')])
  const guarantor = findRecord(guarantors, 'Guarantor ID', guarantorId)
  if (!guarantor) return err('Guarantor not found')
  const guarantorCode = guarantor['Code'] || 'NGF'

  const customerId = await makeCustomerId(guarantorCode)
  const loanId = await makeLoanId(guarantorCode)
  const startDate = firstSaturday(disburseDate)
  const endDate = addDays(startDate, (product.durationWeeks - 1) * 7)

  // Upload photos to Drive if provided
  let customerPhotoUrl = '', aadhaarFrontUrl = '', aadhaarBackUrl = ''
  let housePhotoUrl = '', landmarkPhotoUrl = '', chequePhotoUrl = ''

  if (customerPhoto || aadhaarFront || aadhaarBack || housePhoto || landmarkPhoto || chequePhoto) {
    const folderId = await getLeadDocFolder(guarantorCode, name)
    const toFilePayload = (b64: string, filename: string) => {
      const [header, data] = b64.split(',')
      const mimeType = header.match(/:(.*?);/)?.[1] || 'image/jpeg'
      return { fileName: filename, mimeType, base64Data: data }
    }
    if (customerPhoto) customerPhotoUrl = await uploadLeadPhoto(folderId, 'customer', toFilePayload(customerPhoto, 'customer_import.jpg'))
    if (aadhaarFront)  aadhaarFrontUrl  = await uploadLeadPhoto(folderId, 'aadhaar_front', toFilePayload(aadhaarFront, 'aadhaar_front_import.jpg'))
    if (aadhaarBack)   aadhaarBackUrl   = await uploadLeadPhoto(folderId, 'aadhaar_back', toFilePayload(aadhaarBack, 'aadhaar_back_import.jpg'))
    if (housePhoto)    housePhotoUrl    = await uploadLeadPhoto(folderId, 'house', toFilePayload(housePhoto, 'house_import.jpg'))
    if (landmarkPhoto) landmarkPhotoUrl = await uploadLeadPhoto(folderId, 'landmark', toFilePayload(landmarkPhoto, 'landmark_import.jpg'))
    if (chequePhoto)   chequePhotoUrl   = await uploadLeadPhoto(folderId, 'cheque', toFilePayload(chequePhoto, 'cheque_import.jpg'))
  }

  // Create Lead row to store nominee + aadhaar + photo URLs
  const leadId = makeId('LEAD')
  await appendRow('Leads', {
    'Lead ID': leadId,
    'Submitted Date': joinedDate || disburseDate,
    'Guarantor ID': guarantorId,
    'Guarantor User ID': guarantor['User ID'] || '',
    'Customer Name': name,
    'Phone': phone,
    'Aadhaar No': aadhaarNo || '',
    'Address': address || '',
    'House Name': houseName || '',
    'Place': place || '',
    'Landmark': landmark || '',
    'Nominee Name': nomineeName || '',
    'Nominee Phone': nomineePhone || '',
    'Occupation': occupation || '',
    'Loan Product': loanProduct,
    'Status': 'Converted',
    'Assigned Agent ID': agentId || null,
    'Pinned Location': mapsLink || '',
    'PAN No': panNo || '',
    'Risk Level': riskLevel || '',
    'Recommendation Status': recommendationStatus || '',
    'Admin Final Decision': 'Imported',
    'Customer Photo URL': customerPhotoUrl,
    'Aadhaar Front URL': aadhaarFrontUrl,
    'Aadhaar Back URL': aadhaarBackUrl,
    'House Photo URL': housePhotoUrl,
    'Landmark Photo URL': landmarkPhotoUrl,
    'Cheque Photo URL': chequePhotoUrl,
    'Updated At': nowIso(),
  })

  await appendRow('Customers', {
    'Customer ID': customerId, 'Lead ID': leadId,
    'Name': name, 'Phone': phone,
    'Address': address || '', 'House Name': houseName || '',
    'Place': place || '', 'Landmark': landmark || '',
    'Occupation': occupation || '',
    'Account Number': accountNumber || '',
    'IFSC Code': ifscCode || '',
    'PAN No': panNo || '',
    'Guarantor ID': guarantorId,
    'Active Loan ID': loanId, 'Status': 'Active',
    'Created At': joinedDate ? new Date(joinedDate).toISOString() : nowIso(),
    'Updated At': nowIso(),
  })

  try { await ensurePayCodes(guarantorId) } catch (e) { console.error('pay code assignment failed', e) }

  await appendRow('Loans', {
    'Loan ID': loanId, 'Customer ID': customerId, 'Lead ID': leadId,
    'Guarantor ID': guarantorId, 'Assigned Agent ID': agentId || null,
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
    'Created At': nowIso(), 'Updated At': nowIso(),
  })

  // Build repayments using per-week status list
  const statusMap: Record<number, string> = {}
  if (Array.isArray(weekStatusList)) {
    weekStatusList.forEach((w: { week: number; status: string }) => { statusMap[w.week] = w.status })
  }

  for (let w = 0; w < product.durationWeeks; w++) {
    const due = addDays(startDate, w * 7)
    const weekNo = w + 1
    const status = statusMap[weekNo] || 'Pending'
    await appendRow('Repayments', {
      'Repayment ID': makeId('RPY'),
      'Loan ID': loanId, 'Customer ID': customerId,
      'Due Date': formatDateYmd(due),
      'Week No': String(weekNo),
      'Amount': String(product.weeklyCollection),
      'Status': status,
      'Paid Date': status === 'Paid' ? formatDateYmd(due) : '',
      'NGF Agent ID': agentId || '',
      'Proof File ID': '', 'Notes': status === 'Delayed' ? 'Delayed (imported)' : '',
      'Created At': nowIso(), 'Updated At': nowIso(),
    })
  }

  // Mark loan as Completed if all weeks are paid
  const allPaid = Array.from({ length: product.durationWeeks }, (_, i) => statusMap[i + 1] || 'Pending').every(s => s === 'Paid')
  if (allPaid) {
    const loans = await readTable('Loans')
    const loan = findRecord(loans, 'Loan ID', loanId)
    if (loan) await updateById('Loans', loanId, { 'Status': 'Completed', 'Updated At': nowIso() })
    invalidateCache('Loans')
  }

  return ok({ customerId, loanId })
})
