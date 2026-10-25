import { getRowById, countRows, selectAll, selectRows } from './supabase-db'
import { byIds } from './db'
import { getTodayIST } from './dateUtils'

// Server-side renewal eligibility: the same rules the screens show, enforced where it counts.
// (The browser also runs evaluateRenewal in lib/reviews.ts for the star-review rule; this covers holds, blocks, dues.)
export type Eligibility = { ok: true } | { ok: false; reason: string; code: 'not_found' | 'blocked' | 'hold' | 'active_loan' | 'dues' }

export async function checkRenewalEligibility(customerId: string): Promise<Eligibility> {
  const c = await getRowById('Customers', customerId)
  if (!c) return { ok: false, code: 'not_found', reason: 'Customer not found' }
  if (String(c['Permanent Block']) === 'true') return { ok: false, code: 'blocked', reason: 'This customer was closed permanently. An admin must re-admit them after fresh verification.' }
  const today = getTodayIST()
  const holdUntil = String(c['Hold Until'] || '').slice(0, 10)
  if (holdUntil && today < holdUntil) return { ok: false, code: 'hold', reason: `This customer is on hold until ${holdUntil} (loan closed early; the original cycle has not finished).` }
  // two small counts in the database, not the whole loans and repayments tables
  const [activeLoans, lateWeeks] = await Promise.all([
    countRows('Loans', qb => qb.eq('customer_id', customerId).eq('status', 'Active')),
    countRows('Repayments', qb => qb.eq('customer_id', customerId).or(`status.in.(Overdue,Delayed),and(status.eq.Pending,due_date.lt.${today})`)),
  ])
  if (activeLoans > 0) return { ok: false, code: 'active_loan', reason: 'This customer still has an active loan.' }
  if (lateWeeks > 0) return { ok: false, code: 'dues', reason: 'This customer has overdue or delayed payments.' }
  return { ok: true }
}

/** Is this Aadhaar number tied to a permanently closed customer? (new leads for them are refused) */
export async function isPermanentlyBlockedAadhaar(aadhaarNo: string): Promise<boolean> {
  const a = String(aadhaarNo || '').replace(/\D/g, '')
  if (a.length !== 12) return false
  // the digits in order with anything between them (spaces, dashes), then checked exactly
  const found = await selectAll('Leads', qb => qb.ilike('aadhaar_no', `%${a.split('').join('%')}%`))
  const leadIds = found.filter(l => String(l['Aadhaar No'] || '').replace(/\D/g, '') === a).map(l => l['Lead ID'])
  if (!leadIds.length) return false
  return (await byIds('Customers', 'lead_id', leadIds)).some(c => String(c['Permanent Block']) === 'true')
}

/** The customer a renewal request is for: the "Customer ID:" in its notes, else phone + name (same rule approveRenewal used). */
export async function customerForRenewalLead(lead: Record<string, string>): Promise<Record<string, string> | undefined> {
  const m = (lead['Notes'] || '').match(/Customer ID:\s*(\S+)/)
  const byId = m ? await getRowById('Customers', m[1]) : null
  if (byId) return byId
  if (!lead['Phone'] || !lead['Customer Name']) return undefined
  const { rows } = await selectRows('Customers', qb => qb.eq('phone', lead['Phone']).eq('name', lead['Customer Name']).limit(1))
  return rows[0]
}
