import type { NextRequest } from 'next/server'
import { readTable } from './supabase-db'
import type { Session } from '@/types'

// Who may act on which branch's leads. Admin: every branch. Staff: only the branches where they hold an active branch role.
// Approving a lead / renewal and marking it disbursed: manager, assistant manager, accountant of that branch.
// Overriding a failed OTP: manager or assistant manager of that branch (or Admin).
export const APPROVER_ROLES = ['manager', 'assistant_manager', 'accountant']
export const OVERRIDE_ROLES = ['manager', 'assistant_manager']

export interface BranchAccess { admin: boolean; roleIn: Map<string, string> }

export async function getBranchAccess(session: Pick<Session, 'userId' | 'role'>): Promise<BranchAccess> {
  if (session.role === 'Admin') return { admin: true, roleIn: new Map() }
  const roleIn = new Map<string, string>()
  if (session.role === 'Staff') {
    const rows = await readTable('BranchStaffRoles', { forceFresh: true })
    for (const r of rows) if (r['User ID'] === session.userId && String(r['Is Active']) !== 'false') roleIn.set(r['Branch ID'], r['Role In Branch'])
  }
  return { admin: false, roleIn }
}

export const canApproveIn = (a: BranchAccess, branchId: string) => a.admin || (!!branchId && APPROVER_ROLES.includes(a.roleIn.get(branchId) || ''))
export const canOverrideIn = (a: BranchAccess, branchId: string) => a.admin || (!!branchId && OVERRIDE_ROLES.includes(a.roleIn.get(branchId) || ''))
export const canSeeBranch = (a: BranchAccess, branchId: string) => a.admin || (!!branchId && a.roleIn.has(branchId))

/** The branch a guarantor belongs to (their active link), or '' */
export async function branchOfGuarantor(guarantorId: string): Promise<string> {
  const rows = await readTable('GuarantorBranches', { forceFresh: true })
  return rows.find(x => x['Guarantor ID'] === guarantorId && String(x['Is Active']) !== 'false')?.['Branch ID'] || ''
}

/** User ids of active staff in a branch holding one of the roles (for notifications) */
export async function branchStaffUserIds(branchId: string, roles = APPROVER_ROLES): Promise<string[]> {
  if (!branchId) return []
  const rows = await readTable('BranchStaffRoles', { forceFresh: true })
  return rows.filter(r => r['Branch ID'] === branchId && String(r['Is Active']) !== 'false' && roles.includes(r['Role In Branch'])).map(r => r['User ID'])
}

export function clientIp(req: NextRequest): string {
  return req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}
