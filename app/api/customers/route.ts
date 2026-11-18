import { NextRequest } from 'next/server'
import { apiHandler, getSession, requireRole, ok, err } from '@/lib/api'
import { needFeature } from '@/lib/access'
import { requireFeature } from '@/lib/access'
import { customer as customerKeys } from '@/lib/features'
import { readTable, selectAll, selectRows, getRowById, updateById, deleteById, findRecord, nowIso, invalidateCache, getSupabase } from '@/lib/supabase-db'
import { readAllPages } from '@/lib/pageAll'
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
//                               (count once, then the 200-row pages in parallel)
//   (no page) &light=1          the same customers, only customerId, name and phone, no enrichment (Guarantors page)
// Only the rows on the page are enriched with loan, guarantor, agent and lead details.
export const GET = apiHandler(async (req: NextRequest) => {
  const session = await getSession(req)
  const [, scope0] = await Promise.all([needFeature(session, []), scopeOf(session)])   // permission and scope do not depend on each other
  const sp = new URL(req.url).searchParams
  const id = sp.get('id') || ''
  const paged = sp.has('page')
  const light = !paged && !id && sp.get('light') === '1'

  // who may see which customers
  let agentCustomerIds: string[] | null = null
  let scope = scope0
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
  } else if (light) {
    // ?light=1 (no page): only id, name and phone of every customer in scope, same filters and order, no enrichment.
    // Used by the Guarantors page, which shows just these three fields.
    const sb = getSupabase()
    const raw = await readAllPages<{ customer_id: string; name: string; phone: string }>(async (from, to, withCount) => {
      let q = filters(sb.from('customers').select('customer_id, name, phone', withCount ? { count: 'exact' } : undefined))
      for (const o of order) q = q.order(o.column, { ascending: o.ascending !== false })
      const { data, error, count } = await q.range(from, to)
      if (error) throw new Error(`Query failed on Customers: ${error.message}`)
      return { rows: data || [], total: count ?? undefined }
    })
    return ok({ customers: raw.map(c => ({ customerId: c.customer_id, name: c.name, phone: c.phone })) })
  } else {
    // every customer in scope: count once with page 1, then the other 200-row pages in parallel (same rows, same order)
    customers = await readAllPages((from, to, withCount) => selectRows('Customers', qb => {
      let q = filters(qb)
      for (const o of order) q = q.order(o.column, { ascending: o.ascending !== false })
      return q.range(from, to)
    }, { count: withCount }))
  }

  const rows = await enrichCustomers(customers)
  return ok(paged || id ? { customers: rows, total, page, pageSize, totalPages } : { customers: rows })
})

// Leads: only the columns the customer list shows (the lead row also carries long notes and many other fields)
const LEAD_COLUMNS = 'lead_id, nominee_name, nominee_phone, aadhaar_no, customer_photo_url, aadhaar_front_url, aadhaar_back_url, house_photo_url, landmark_photo_url, cheque_photo_url, verification_notes'
async function leadsByIds(ids: string[]): Promise<Record<string, string>[]> {
  const unique = Array.from(new Set(ids.filter(Boolean)))
  if (!unique.length) return []
  const sb = getSupabase()
  // lead_id is the key, so a chunk of 200 ids is at most 200 rows: one request per chunk, all chunks in parallel
  const parts = await Promise.all(chunk(unique).map(async part => {
    const { data, error } = await sb.from('leads').select(LEAD_COLUMNS).in('lead_id', part)
    if (error) throw new Error(`Query failed on Leads: ${error.message}`)
    return ((data || []) as unknown as Record<string, string>[]).map(l => ({
      'Lead ID': l.lead_id, 'Nominee Name': l.nominee_name, 'Nominee Phone': l.nominee_phone, 'Aadhaar No': l.aadhaar_no,
      'Customer Photo URL': l.customer_photo_url, 'Aadhaar Front URL': l.aadhaar_front_url, 'Aadhaar Back URL': l.aadhaar_back_url,
      'House Photo URL': l.house_photo_url, 'Landmark Photo URL': l.landmark_photo_url, 'Cheque Photo URL': l.cheque_photo_url,
      'Verification Notes': l.verification_notes,
    }))
  }))
  return parts.flat()
}

async function enrichCustomers(customers: Record<string, string>[]) {
  if (!customers.length) return []
  const today = getTodayIST()
  const cids = customers.map(c => c['Customer ID'])
  // Round trip 1: the customers' loans, their active loans and their leads, together
  const [loansByCustomer, loansByActive, leads] = await Promise.all([
    byIds('Loans', 'customer_id', cids),
    byIds('Loans', 'loan_id', customers.map(c => c['Active Loan ID'])),
    leadsByIds(customers.map(c => c['Lead ID'])),
  ])
  const loanById = new Map(loansByActive.map(l => [l['Loan ID'], l]))
  const firstLoanOf = new Map<string, Record<string, string>>()
  for (const l of loansByCustomer) if (!firstLoanOf.has(l['Customer ID'])) firstLoanOf.set(l['Customer ID'], l)
  const loanOf = (c: Record<string, string>) => loanById.get(c['Active Loan ID']) || firstLoanOf.get(c['Customer ID'])
  const loans = customers.map(loanOf)

  // Round trip 2: guarantors, agents and every weekly row of the customers' loans (the score needs them all).
  // Overdue = the shown loan has a Pending week due before today. The shown loan is almost always one of the
  // customer's own loans, whose weeks are read here anyway; only a shown loan outside that set (an Active Loan ID
  // pointing at another customer's loan) is still asked for separately, exactly as before.
  const ownLoanIds = new Set(loansByCustomer.map(l => l['Loan ID']))
  const otherShownIds = Array.from(new Set(loans.map(l => l?.['Loan ID']).filter(x => x && !ownLoanIds.has(x)) as string[]))
  const [guarantors, agents, repayments, otherOverdue] = await Promise.all([
    byIds('Guarantors', 'guarantor_id', customers.map((c, i) => c['Guarantor ID'] || loans[i]?.['Guarantor ID'] || '')),
    byIds('Agents', 'agent_id', loans.map(l => l?.['Assigned Agent ID'] || '')),
    byIds('Repayments', 'loan_id', loansByCustomer.map(l => l['Loan ID'])),
    Promise.all(chunk(otherShownIds).map(part =>
      selectAll('Repayments', qb => qb.in('loan_id', part).eq('status', 'Pending').lt('due_date', today)))),
  ])
  // Round trip 3 (inside): the collections of those weeks
  const scores = await bulkScores(cids, { loans: loansByCustomer, repayments })
  const overdueSet = new Set(otherOverdue.flat().map(r => r['Loan ID']))
  for (const r of repayments) if (r['Status'] === 'Pending' && r['Due Date'] && String(r['Due Date']) < today) overdueSet.add(r['Loan ID'])
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
      ifscCode: c['IFSC Code'] || '', accountHolder: c['Account Holder'] || '', payNumber: c['Pay Number'] || '',
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
  const customer = await getRowById('Customers', String(customerId))
  if (!customer) return err('Customer not found')
  if (session.role === 'Staff') {
    const [access, gMap, theirLoans] = await Promise.all([getBranchAccess(session), guarantorBranchMap(), selectAll('Loans', qb => qb.eq('customer_id', customerId))])
    if (!canSeeGuarantor(access, gMap, customerGuarantorId(customer, theirLoans))) return err('This customer belongs to another branch', 403)
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
    'Account Holder': body.accountHolder ?? customer['Account Holder'] ?? '',
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
    const lead = await getRowById('Leads', customer['Lead ID'])
    if (lead) {
      // Try guarantor ID from customer record, then from loan, then from lead
      const loan = (await selectRows('Loans', qb => qb.eq('customer_id', customerId).order('created_at', { ascending: false }).limit(1))).rows[0]
      const guarantorId = customer['Guarantor ID'] || loan?.['Guarantor ID'] || lead?.['Guarantor ID'] || ''
      const g = guarantorId ? await getRowById('Guarantors', guarantorId) : null
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

  const customer = await getRowById('Customers', String(customerId))
  if (!customer) return err('Customer not found')

  // Delete all repayments for this customer
  const customerRepayments = await selectAll('Repayments', qb => qb.eq('customer_id', customerId))
  for (const r of customerRepayments) {
    await deleteById('Repayments', r['Repayment ID'])
  }

  // Delete all loans for this customer
  const customerLoans = await selectAll('Loans', qb => qb.eq('customer_id', customerId))
  for (const l of customerLoans) {
    await deleteById('Loans', l['Loan ID'])
  }

  // Delete the customer
  await deleteById('Customers', customerId)

  return ok({ success: true })
})
