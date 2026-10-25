import { NextRequest } from 'next/server'
import { apiHandler, requireRole, ok } from '@/lib/api'
import { requireFeature } from '@/lib/access'
import { lead as leadKeys } from '@/lib/features'
import { readTable, selectAll } from '@/lib/supabase-db'
import { byIds } from '@/lib/db'
import { findLoanProduct } from '@/lib/loanProducts'
import { firstPaymentSaturdayIST } from '@/lib/dateUtils'
import { getBranchAccess, canApproveIn, canSeeBranch } from '@/lib/branchAccess'
import { customerForRenewalLead } from '@/lib/renewalRules'

// The disbursement list: leads that are approved and waiting for the money to be handed over.
// Two sections (renewals, new customers), grouped by guarantor. Branch staff see their own branch only; Admin sees all.
export const GET = apiHandler(async (req: NextRequest) => {
  const session = await requireFeature(req, [...leadKeys('leadsDisburse'), 'leadsView'])
  const access = await getBranchAccess(session)
  const [guarantorBranches, branches] = await Promise.all([readTable('GuarantorBranches', { forceFresh: true }), readTable('Branches')])
  const branchOf = (gid: string) => guarantorBranches.find(x => x['Guarantor ID'] === gid && String(x['Is Active']) !== 'false')?.['Branch ID'] || ''
  const firstPayment = firstPaymentSaturdayIST()

  // approved and waiting for the money: only these leads are read, then the people and loans they refer to
  const waiting = await selectAll('Leads', qb => qb.eq('status', 'Approved').is('disbursed_at', null))
  const approved = waiting.filter(l => canSeeBranch(access, branchOf(l['Guarantor ID'])))
  const renewalCustomers = await Promise.all(approved.map(l => l['Loan Product'] === 'RENEWAL' ? customerForRenewalLead(l) : Promise.resolve(undefined)))
  const [guarantors, users, loans] = await Promise.all([
    byIds('Guarantors', 'guarantor_id', approved.map(l => l['Guarantor ID'])),
    byIds('Users', 'user_id', approved.map(l => l['Approved By'])),
    byIds('Loans', 'customer_id', renewalCustomers.filter(Boolean).map(c => c!['Customer ID'])),
  ])
  const rows = await Promise.all(approved.map(async (l, i) => {
    const gid = l['Guarantor ID']; const g = guarantors.find(x => x['Guarantor ID'] === gid)
    const branchId = branchOf(gid)
    const isRenewal = l['Loan Product'] === 'RENEWAL'
    let terms = { principal: 0, netDisbursed: 0, weekly: 0, weeks: 0, productLabel: '' }
    if (isRenewal) {
      const c = renewalCustomers[i]
      const prev = c ? loans.filter(x => x['Customer ID'] === c['Customer ID']).sort((a, b) => String(b['Created At']).localeCompare(String(a['Created At'])))[0] : undefined
      if (prev) terms = { principal: Number(prev['Principal Amount']), netDisbursed: Number(prev['Net Disbursed']), weekly: Number(prev['Weekly Collection Amount']), weeks: Number(prev['Duration Weeks']), productLabel: 'Renewal (same terms as last loan)' }
    } else {
      const p = await findLoanProduct(l['Loan Product'])
      if (p) terms = { principal: p.principal, netDisbursed: p.netDisbursed, weekly: p.weeklyCollection, weeks: p.durationWeeks, productLabel: p.label }
    }
    return {
      leadId: l['Lead ID'], isRenewal, customerName: l['Customer Name'], phone: l['Phone'], place: l['Place'] || '',
      guarantorId: gid, guarantorCode: g?.['Code'] || '', guarantorName: g?.['Name'] || '',
      branchId, branchName: branches.find(b => b['Branch ID'] === branchId)?.['Name'] || '',
      product: l['Loan Product'], ...terms,
      approvedAt: l['Approved At'] || null, approvedBy: users.find(u => u['User ID'] === l['Approved By'])?.['Name'] || '',
      otpVerified: !!l['Otp Verified At'], otpOverrideReason: l['Otp Override Reason'] || '',
      firstPaymentDate: firstPayment, canDisburse: canApproveIn(access, branchId),
    }
  }))
  rows.sort((a, b) => String(a.approvedAt || '').localeCompare(String(b.approvedAt || '')))

  const gMap = new Map<string, { guarantorId: string; code: string; name: string; renewals: number; newLeads: number }>()
  for (const r of rows) {
    const e = gMap.get(r.guarantorId) || { guarantorId: r.guarantorId, code: r.guarantorCode, name: r.guarantorName, renewals: 0, newLeads: 0 }
    if (r.isRenewal) e.renewals++; else e.newLeads++
    gMap.set(r.guarantorId, e)
  }
  return ok({
    firstPaymentDate: firstPayment,
    guarantors: [...gMap.values()].sort((a, b) => a.code.localeCompare(b.code)),
    renewals: rows.filter(r => r.isRenewal), newLeads: rows.filter(r => !r.isRenewal),
  })
})
