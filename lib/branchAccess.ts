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

/** guarantor id -> branch id (active links), read once for list filtering */
export async function guarantorBranchMap(): Promise<Map<string, string>> {
  const rows = await readTable('GuarantorBranches', { forceFresh: true })
  const m = new Map<string, string>()
  for (const x of rows) if (String(x['Is Active']) !== 'false' && x['Guarantor ID']) m.set(x['Guarantor ID'], x['Branch ID'])
  return m
}

/** Staff scope: may this access see data of this guarantor? (use only for Admin/Staff sessions) */
export const canSeeGuarantor = (a: BranchAccess, gMap: Map<string, string>, guarantorId: string) => canSeeBranch(a, gMap.get(guarantorId) || '')

/** The guarantor of a customer: own field, else the guarantor of their loan */
export function customerGuarantorId(c: Record<string, string>, loans: Record<string, string>[]): string {
  const loan = loans.find(l => l['Loan ID'] === c['Active Loan ID']) || loans.find(l => l['Customer ID'] === c['Customer ID'])
  return c['Guarantor ID'] || loan?.['Guarantor ID'] || ''
}

/** Branch ids a user belongs to: agent branch, guarantor branch, or branch staff roles. Used to scope Staff to people of their branches. */
export async function branchesOfUser(userId: string): Promise<Set<string>> {
  const out = new Set<string>()
  const [agents, guarantors, gMap, roles] = await Promise.all([
    readTable('Agents', { forceFresh: true }), readTable('Guarantors', { forceFresh: true }), guarantorBranchMap(), readTable('BranchStaffRoles', { forceFresh: true }),
  ])
  for (const a of agents) if (a['User ID'] === userId && a['Branch ID']) out.add(a['Branch ID'])
  for (const g of guarantors) if (g['User ID'] === userId) { const b = gMap.get(g['Guarantor ID']); if (b) out.add(b) }
  for (const r of roles) if (r['User ID'] === userId && String(r['Is Active']) !== 'false' && r['Branch ID']) out.add(r['Branch ID'])
  return out
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
