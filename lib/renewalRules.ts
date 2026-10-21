import { readTable } from './supabase-db'
import { getTodayIST } from './dateUtils'

// Server-side renewal eligibility: the same rules the screens show, enforced where it counts.
// (The browser also runs evaluateRenewal in lib/reviews.ts for the star-review rule; this covers holds, blocks, dues.)
export type Eligibility = { ok: true } | { ok: false; reason: string; code: 'not_found' | 'blocked' | 'hold' | 'active_loan' | 'dues' }

export async function checkRenewalEligibility(customerId: string): Promise<Eligibility> {
  const [customers, loans, repayments] = await Promise.all([
    readTable('Customers', { forceFresh: true }), readTable('Loans', { forceFresh: true }), readTable('Repayments', { forceFresh: true }),
  ])
  const c = customers.find(x => x['Customer ID'] === customerId)
  if (!c) return { ok: false, code: 'not_found', reason: 'Customer not found' }
  if (String(c['Permanent Block']) === 'true') return { ok: false, code: 'blocked', reason: 'This customer was closed permanently. An admin must re-admit them after fresh verification.' }
  const today = getTodayIST()
  const holdUntil = String(c['Hold Until'] || '').slice(0, 10)
  if (holdUntil && today < holdUntil) return { ok: false, code: 'hold', reason: `This customer is on hold until ${holdUntil} (loan closed early; the original cycle has not finished).` }
  if (loans.some(l => l['Customer ID'] === customerId && l['Status'] === 'Active')) return { ok: false, code: 'active_loan', reason: 'This customer still has an active loan.' }
  const mine = repayments.filter(r => r['Customer ID'] === customerId)
  if (mine.some(r => r['Status'] === 'Overdue' || r['Status'] === 'Delayed' || (r['Status'] === 'Pending' && r['Due Date'] < today))) {
    return { ok: false, code: 'dues', reason: 'This customer has overdue or delayed payments.' }
  }
  return { ok: true }
}

/** Is this Aadhaar number tied to a permanently closed customer? (new leads for them are refused) */
export async function isPermanentlyBlockedAadhaar(aadhaarNo: string): Promise<boolean> {
  const a = String(aadhaarNo || '').replace(/\D/g, '')
  if (a.length !== 12) return false
  const [leads, customers] = await Promise.all([readTable('Leads', { forceFresh: true }), readTable('Customers', { forceFresh: true })])
  const leadIds = new Set(leads.filter(l => String(l['Aadhaar No'] || '').replace(/\D/g, '') === a).map(l => l['Lead ID']))
  return customers.some(c => leadIds.has(c['Lead ID']) && String(c['Permanent Block']) === 'true')
}

/** The customer a renewal request is for: the "Customer ID:" in its notes, else phone + name (same rule approveRenewal used). */
export function customerForRenewalLead(lead: Record<string, string>, customers: Record<string, string>[]) {
  const m = (lead['Notes'] || '').match(/Customer ID:\s*(\S+)/)
  return (m ? customers.find(c => c['Customer ID'] === m[1]) : undefined)
    || customers.find(c => c['Phone'] === lead['Phone'] && c['Name'] === lead['Customer Name'])
}
