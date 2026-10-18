import { NextRequest } from 'next/server'
import { apiHandler, getSession, requireRole, ok, err } from '@/lib/api'
import { readTable, updateById, deleteById, findRecord, nowIso, invalidateCache } from '@/lib/supabase-db'
import { getLeadDocFolder, uploadLeadPhoto } from '@/lib/drive'
import { getTodayIST } from '@/lib/dateUtils'

export const maxDuration = 30

export const GET = apiHandler(async (req: NextRequest) => {
  const session = await getSession(req)
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 25000))
  const [customers, loans, guarantors, agents, repayments, leads] = await Promise.race([
    Promise.all([
      readTable('Customers', { forceFresh: true }), readTable('Loans', { forceFresh: true }), readTable('Guarantors', { forceFresh: true }),
      readTable('Agents', { forceFresh: true }), readTable('Repayments', { forceFresh: true }), readTable('Leads', { forceFresh: true }),
    ]),
    timeout,
  ])

  const today = getTodayIST()
  const overdueSet = new Set(
    repayments.filter(r => r['Status'] === 'Pending' && r['Due Date'] < today).map(r => r['Loan ID'])
  )

  let filtered = customers
  if (session.role === 'Guarantor') {
    const g = guarantors.find(g => g['User ID'] === session.userId)
    if (!g) {
      filtered = []
    } else {
      const gid = g['Guarantor ID']
      filtered = customers.filter(c => {
        if (c['Guarantor ID'] === gid) return true
        const loan = loans.find(l => l['Loan ID'] === c['Active Loan ID'])
          || loans.find(l => l['Customer ID'] === c['Customer ID'])
        return loan?.['Guarantor ID'] === gid
      })
    }
  } else if (session.role === 'NGF AGENT') {
    const a = agents.find(a => a['User ID'] === session.userId)
    const agentLoanIds = a ? new Set(loans.filter(l => l['Assigned Agent ID'] === a['Agent ID']).map(l => l['Customer ID'])) : new Set()
    filtered = customers.filter(c => agentLoanIds.has(c['Customer ID']))
  }

  const rows = filtered.map(c => {
    const loan = loans.find(l => l['Loan ID'] === c['Active Loan ID'])
      || loans.find(l => l['Customer ID'] === c['Customer ID'])
    const guarantorId = c['Guarantor ID'] || loan?.['Guarantor ID'] || ''
    const g = guarantors.find(g => g['Guarantor ID'] === guarantorId)
    const a = loan ? agents.find(ag => ag['Agent ID'] === loan['Assigned Agent ID']) : null
    const lead = leads.find(l => l['Lead ID'] === c['Lead ID'])
    return {
      customerId: c['Customer ID'], name: c['Name'], phone: c['Phone'],
      address: c['Address'], houseName: c['House Name'], place: c['Place'],
      occupation: c['Occupation'], status: c['Status'],
      guarantorName: g?.['Name'] || '', guarantorCode: g?.['Code'] || '',
      activeLoanId: c['Active Loan ID'] || loan?.['Loan ID'] || '', loanAccountNo: loan?.['Loan Account No'] || '', agentName: a?.['Name'] || '',
      loanStatus: loan?.['Status'] || '',
      isOverdue: loan ? overdueSet.has(loan['Loan ID']) : false,
      principal: loan?.['Principal Amount'] || '0',
      weeklyAmount: loan?.['Weekly Collection Amount'] || '0',
      startDate: loan?.['Start Date'] || '', endDate: loan?.['End Date'] || '',
      joinedDate: (() => { const d = c['Created At']?.slice(0, 10) || ''; return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : (loan?.['Start Date'] || '') })(),
      nomineeName: lead?.['Nominee Name'] || '',
      nomineePhone: lead?.['Nominee Phone'] || '',
      aadhaarNo: lead?.['Aadhaar No'] || '',
      accountNumber: c['Account Number'] || '',
      ifscCode: c['IFSC Code'] || '',
      panNo: c['PAN No'] || '',
      customerPhotoUrl: lead?.['Customer Photo URL'] || '',
      aadhaarFrontUrl: lead?.['Aadhaar Front URL'] || '',
      aadhaarBackUrl: lead?.['Aadhaar Back URL'] || '',
      housePhotoUrl: lead?.['House Photo URL'] || '',
      landmarkPhotoUrl: lead?.['Landmark Photo URL'] || '',
      chequePhotoUrl: lead?.['Cheque Photo URL'] || '',
      mapsLink: (() => { try { return JSON.parse(lead?.['Verification Notes'] || '{}').mapsLink || '' } catch { return '' } })(),
    }
  })

  return ok({ customers: rows })
})

export const PATCH = apiHandler(async (req: NextRequest) => {
  await requireRole(req, ['Admin', 'Staff'])
  const body = await req.json()
  const { customerId } = body
  if (!customerId) return err('customerId required')
  const customers = await readTable('Customers')
  const customer = findRecord(customers, 'Customer ID', customerId)
  if (!customer) return err('Customer not found')

  await updateById('Customers', customerId, {
    'Name': body.name || customer['Name'],
    'Phone': body.phone || customer['Phone'],
    'Address': body.address || customer['Address'],
    'House Name': body.houseName || customer['House Name'],
    'Place': body.place || customer['Place'],
    'Occupation': body.occupation || customer['Occupation'],
    'Account Number': body.accountNumber ?? customer['Account Number'] ?? '',
    'IFSC Code': body.ifscCode ?? customer['IFSC Code'] ?? '',
    'PAN No': body.panNo ?? customer['PAN No'] ?? '',
    'Updated At': nowIso(),
  })

  // Handle image uploads
  const imageKeys: Array<[string, string]> = [
    ['customerPhoto', 'Customer Photo URL'],
    ['aadhaarFront',  'Aadhaar Front URL'],
    ['aadhaarBack',   'Aadhaar Back URL'],
    ['housePhoto',    'House Photo URL'],
    ['landmarkPhoto', 'Landmark Photo URL'],
    ['chequePhoto',   'Cheque Photo URL'],
  ]
  const hasImages = imageKeys.some(([k]) => body[k])
  if (hasImages && customer['Lead ID']) {
    const [leads, loans, guarantors] = await Promise.all([readTable('Leads'), readTable('Loans'), readTable('Guarantors')])
    const lead = leads.find((l: any) => l['Lead ID'] === customer['Lead ID'])
    if (lead) {
      // Try guarantor ID from customer record, then from loan, then from lead
      const loan = loans.find((l: any) => l['Loan ID'] === customer['Active Loan ID'] || l['Customer ID'] === customerId)
      const guarantorId = customer['Guarantor ID'] || loan?.['Guarantor ID'] || lead?.['Guarantor ID'] || ''
      const g = guarantors.find((g: any) => g['Guarantor ID'] === guarantorId)
      const { getLeadDocFolder, uploadLeadPhoto } = await import('@/lib/drive')
      const folderId = await getLeadDocFolder(g?.['Code'] || 'NGF', customer['Name'])
      const leadUpdates: Record<string, string> = {}
      for (const [bodyKey, colName] of imageKeys) {
        if (body[bodyKey]) {
          const b64 = body[bodyKey] as string
          const mimeType = b64.match(/data:(.*?);/)?.[1] || 'image/jpeg'
          const base64Data = b64.includes(',') ? b64.split(',')[1] : b64
          leadUpdates[colName] = await uploadLeadPhoto(folderId, bodyKey, { fileName: `${bodyKey}.jpg`, mimeType, base64Data })
        }
      }
      if (Object.keys(leadUpdates).length > 0) {
        await updateById('Leads', lead['Lead ID'], { ...leadUpdates, 'Updated At': nowIso() })
        invalidateCache('Leads')
      }
    }
  }

  invalidateCache('Customers')
  return ok({ success: true })
})

export const DELETE = apiHandler(async (req: NextRequest) => {
  await requireRole(req, ['Admin', 'Staff'])
  const { customerId } = await req.json()
  if (!customerId) return err('customerId required')

  const [customers, loans, repayments] = await Promise.all([
    readTable('Customers', { forceFresh: true }), readTable('Loans', { forceFresh: true }), readTable('Repayments', { forceFresh: true }),
  ])

  const customer = findRecord(customers, 'Customer ID', customerId)
  if (!customer) return err('Customer not found')

  // Delete all repayments for this customer
  const customerRepayments = repayments.filter(r => r['Customer ID'] === customerId)
  for (const r of customerRepayments) {
    await deleteById('Repayments', r['Repayment ID'])
  }

  // Delete all loans for this customer
  const customerLoans = loans.filter(l => l['Customer ID'] === customerId)
  for (const l of customerLoans) {
    await deleteById('Loans', l['Loan ID'])
  }

  // Delete the customer
  await deleteById('Customers', customerId)

  return ok({ success: true })
})
