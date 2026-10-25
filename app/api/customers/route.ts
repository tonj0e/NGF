import { NextRequest } from 'next/server'
import { apiHandler, getSession, requireRole, ok, err } from '@/lib/api'
import { needFeature } from '@/lib/access'
import { requireFeature } from '@/lib/access'
import { customer as customerKeys } from '@/lib/features'
import { readTable, selectAll, updateById, deleteById, findRecord, nowIso, invalidateCache } from '@/lib/supabase-db'
import { getLeadDocFolder, uploadLeadPhoto } from '@/lib/drive'
import { getTodayIST } from '@/lib/dateUtils'
import { bulkScores } from '@/lib/customerHistory'
import { pageQuery, byIds, chunk, scopeOf, withScope } from '@/lib/db'
import { getBranchAccess, canSeeGuarantor, guarantorBranchMap, customerGuarantorId } from '@/lib/branchAccess'

export const maxDuration = 30

// GET /api/customers
//   ?page=1&pageSize=50&q=text  one page, searched in the database (newest first), with `total` and `totalPages`
//   ?id=CUSTOMER_ID             one customer (any role that may see them)
//   (no page)                   every customer in the caller's scope: for a guarantor or agent that is their own few hundred
// Only the rows on the page are enriched with loan, guarantor, agent and lead details.
export const GET = apiHandler(async (req: NextRequest) => {
  const session = await getSession(req)
  await needFeature(session, [])
  const sp = new URL(req.url).searchParams
  const id = sp.get('id') || ''
  const paged = sp.has('page')

  // who may see which customers
  let agentCustomerIds: string[] | null = null
  let scope = await scopeOf(session)
  if (session.role === 'NGF AGENT') {
    const a = (await readTable('Agents')).find(x => x['User ID'] === session.userId)
    const mine = a ? await selectAll('Loans', qb => qb.eq('assigned_agent_id', a['Agent ID'])) : []
    agentCustomerIds = Array.from(new Set(mine.map(l => l['Customer ID']).filter(Boolean)))
    scope = { kind: 'all' }
  }
  const filters = (qb: any) => {
    let q = withScope(qb, scope)
    if (agentCustomerIds) q = q.in('customer_id', agentCustomerIds.length ? agentCustomerIds : ['__none__'])
    if (id) q = q.eq('customer_id', id)
    return q
  }
  const order = [{ column: 'created_at', ascending: false }, { column: 'customer_id' }]
  const searchCols = ['name', 'phone', 'place', 'active_loan_id']

  let customers: Record<string, string>[] = []
  let total = 0, page = 1, pageSize = 0, totalPages = 1
  if (paged || id) {
    const r = await pageQuery('Customers', { filters, search: { columns: searchCols, text: sp.get('q') }, order, page: sp.get('page') || 1, pageSize: sp.get('pageSize') })
    customers = r.rows; total = r.total; page = r.page; pageSize = r.pageSize; totalPages = r.totalPages
  } else {
    for (let pg = 1; ; pg++) {
      const r = await pageQuery('Customers', { filters, order, page: pg, pageSize: 200 })
      customers.push(...r.rows)
      if (pg >= r.totalPages) { total = r.total; break }
    }
  }

  const rows = await enrichCustomers(customers)
  return ok(paged || id ? { customers: rows, total, page, pageSize, totalPages } : { customers: rows })
})

async function enrichCustomers(customers: Record<string, string>[]) {
  if (!customers.length) return []
  const today = getTodayIST()
  const cids = customers.map(c => c['Customer ID'])
  const [loansByCustomer, loansByActive, leads] = await Promise.all([
    byIds('Loans', 'customer_id', cids),
    byIds('Loans', 'loan_id', customers.map(c => c['Active Loan ID'])),
    byIds('Leads', 'lead_id', customers.map(c => c['Lead ID'])),
  ])
  const loanById = new Map(loansByActive.map(l => [l['Loan ID'], l]))
  const firstLoanOf = new Map<string, Record<string, string>>()
  for (const l of loansByCustomer) if (!firstLoanOf.has(l['Customer ID'])) firstLoanOf.set(l['Customer ID'], l)
  const loanOf = (c: Record<string, string>) => loanById.get(c['Active Loan ID']) || firstLoanOf.get(c['Customer ID'])
  const loans = customers.map(loanOf)

  const [guarantors, agents, overdue, scores] = await Promise.all([
    byIds('Guarantors', 'guarantor_id', customers.map((c, i) => c['Guarantor ID'] || loans[i]?.['Guarantor ID'] || '')),
    byIds('Agents', 'agent_id', loans.map(l => l?.['Assigned Agent ID'] || '')),
    Promise.all(chunk(loans.map(l => l?.['Loan ID']).filter(Boolean) as string[]).map(part =>
      selectAll('Repayments', qb => qb.in('loan_id', part).eq('status', 'Pending').lt('due_date', today)))),
    bulkScores(cids),
  ])
  const overdueSet = new Set(overdue.flat().map(r => r['Loan ID']))
  const gById = new Map(guarantors.map(g => [g['Guarantor ID'], g]))
  const aById = new Map(agents.map(a => [a['Agent ID'], a]))
  const leadById = new Map(leads.map(l => [l['Lead ID'], l]))

  return customers.map((c, i) => {
    const loan = loans[i]
    const guarantorId = c['Guarantor ID'] || loan?.['Guarantor ID'] || ''
    const g = gById.get(guarantorId)
    const a = loan ? aById.get(loan['Assigned Agent ID']) : null
    const lead = leadById.get(c['Lead ID'])
    return {
      customerId: c['Customer ID'], name: c['Name'], phone: c['Phone'],
      address: c['Address'], houseName: c['House Name'], place: c['Place'],
      occupation: c['Occupation'], status: c['Status'],
      guarantorName: g?.['Name'] || '', guarantorCode: g?.['Code'] || '',
      activeLoanId: c['Active Loan ID'] || loan?.['Loan ID'] || '', loanAccountNo: loan?.['Loan Account No'] || '', agentName: a?.['Name'] || '',
      loanStatus: loan?.['Status'] || '',
      ngfScore: scores.get(c['Customer ID'])?.value ?? 0, ngfBand: scores.get(c['Customer ID'])?.band || 'New',
      ngfReviews: scores.get(c['Customer ID'])?.reviews ?? 0, ngfAverage: scores.get(c['Customer ID'])?.average ?? null,
      holdUntil: (String(c['Hold Until'] || '').slice(0, 10) > today) ? String(c['Hold Until']).slice(0, 10) : '',
      permanentBlock: String(c['Permanent Block']) === 'true', blockReason: c['Block Reason'] || '',
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
}

export const PATCH = apiHandler(async (req: NextRequest) => {
  const session = await requireFeature(req, customerKeys('customersEdit'))
  const body = await req.json()
  const { customerId } = body
  if (!customerId) return err('customerId required')
  const customers = await readTable('Customers')
  const customer = findRecord(customers, 'Customer ID', customerId)
  if (!customer) return err('Customer not found')
  if (session.role === 'Staff') {
    const [access, gMap, allLoans] = await Promise.all([getBranchAccess(session), guarantorBranchMap(), readTable('Loans', { forceFresh: true })])
    if (!canSeeGuarantor(access, gMap, customerGuarantorId(customer, allLoans))) return err('This customer belongs to another branch', 403)
  }

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
      const { getLeadDocFolder, uploadLeadPhoto, docLabel } = await import('@/lib/drive')
      const { payCodeFromLoanId } = await import('@/lib/payCode')
      const code = payCodeFromLoanId(loan?.['Loan ID'] || customer['Active Loan ID'])
      const folderId = lead['Document Folder ID'] || await getLeadDocFolder(g?.['Code'] || 'NGF', customer['Name'], code)
      const label = docLabel(customer['Name'], code)
      const leadUpdates: Record<string, string> = {}
      for (const [bodyKey, colName] of imageKeys) {
        if (body[bodyKey]) {
          const b64 = body[bodyKey] as string
          const mimeType = b64.match(/data:(.*?);/)?.[1] || 'image/jpeg'
          const base64Data = b64.includes(',') ? b64.split(',')[1] : b64
          leadUpdates[colName] = await uploadLeadPhoto(folderId, bodyKey, { fileName: `${bodyKey}.jpg`, mimeType, base64Data }, label)
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
  await requireFeature(req, customerKeys('customersDelete'))
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
