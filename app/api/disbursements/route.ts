import { NextRequest } from 'next/server'
import { apiHandler, requireRole, ok } from '@/lib/api'
import { readTable } from '@/lib/supabase-db'
import { findLoanProduct } from '@/lib/loanProducts'
import { firstPaymentSaturdayIST } from '@/lib/dateUtils'
import { getBranchAccess, canApproveIn, canSeeBranch } from '@/lib/branchAccess'
import { customerForRenewalLead } from '@/lib/renewalRules'

// The disbursement list: leads that are approved and waiting for the money to be handed over.
// Two sections (renewals, new customers), grouped by guarantor. Branch staff see their own branch only; Admin sees all.
export const GET = apiHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ['Admin', 'Staff'])
  const access = await getBranchAccess(session)
  const [leads, guarantors, guarantorBranches, branches, customers, loans, users] = await Promise.all([
    readTable('Leads', { forceFresh: true }), readTable('Guarantors'), readTable('GuarantorBranches', { forceFresh: true }),
    readTable('Branches'), readTable('Customers', { forceFresh: true }), readTable('Loans', { forceFresh: true }), readTable('Users'),
  ])
  const branchOf = (gid: string) => guarantorBranches.find(x => x['Guarantor ID'] === gid && String(x['Is Active']) !== 'false')?.['Branch ID'] || ''
  const firstPayment = firstPaymentSaturdayIST()

  const approved = leads.filter(l => l['Status'] === 'Approved' && !l['Disbursed At'] && canSeeBranch(access, branchOf(l['Guarantor ID'])))
  const rows = await Promise.all(approved.map(async l => {
    const gid = l['Guarantor ID']; const g = guarantors.find(x => x['Guarantor ID'] === gid)
    const branchId = branchOf(gid)
    const isRenewal = l['Loan Product'] === 'RENEWAL'
    let terms = { principal: 0, netDisbursed: 0, weekly: 0, weeks: 0, productLabel: '' }
    if (isRenewal) {
      const c = customerForRenewalLead(l, customers)
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
