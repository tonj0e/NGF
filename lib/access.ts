import type { NextRequest } from 'next/server'
import type { Session } from '@/types'
import { getSession } from './api'
import { readTable } from './supabase-db'
import { FEATURES, canUse, effectivePermissions, permsOf } from './features'

export const ROLE_DEFAULTS_KEY = 'role_defaults'

/** Role defaults the Admin saved (settings key `role_defaults`). Until saved, nobody gets defaults: only the
 *  permissions already ticked per person count, so turning this on changes nothing by surprise. */
export async function savedRoleDefaults(): Promise<Record<string, string[]> | null> {
  const rows = await readTable('Settings', { forceFresh: true })
  const raw = rows.find(r => r['Key'] === ROLE_DEFAULTS_KEY)?.['Value']
  if (!raw) return null
  try {
    const j = JSON.parse(raw)
    return j && typeof j === 'object' ? j : null
  } catch { return null }
}

/** Everything this person may use: Admin all, others = branch-role defaults + personal extras - removals. */
export async function loadPermissions(session: Pick<Session, 'userId' | 'role'>): Promise<string[]> {
  if (session.role === 'Admin') return FEATURES.map(f => f.key)
  const [access, branchRoles, defaults] = await Promise.all([
    readTable('StaffAccess', { forceFresh: true }),
    session.role === 'Staff' ? readTable('BranchStaffRoles', { forceFresh: true }) : Promise.resolve([]),
    savedRoleDefaults(),
  ])
  const extras = permsOf(access.find(a => a['User ID'] === session.userId)?.['Permissions'])
  const roles = session.role === 'Staff'
    ? branchRoles.filter(r => r['User ID'] === session.userId && String(r['Is Active']) !== 'false').map(r => r['Role In Branch'])
    : [session.role === 'NGF AGENT' ? 'agent' : session.role.toLowerCase()]
  return effectivePermissions(roles, extras, defaults || {})
}

/** Like requireRole, but a Staff user must also hold one of `keys` (empty = any feature). Admin always passes. */
export async function requireFeature(req: NextRequest, keys: string[], roles: string[] = ['Admin', 'Staff']): Promise<Session> {
  const session = await getSession(req)
  if (!roles.includes(session.role)) throw new Error('No permission')
  if (session.role === 'Admin' || session.role !== 'Staff') return session
  if (!canUse(await loadPermissions(session), keys, false)) throw new Error('No permission')
  return session
}

/** For routes shared by several roles: a Staff session must hold one of `keys` (empty = any feature); other roles pass. */
export async function needFeature(session: Session, keys: string[]): Promise<void> {
  if (session.role !== 'Staff') return
  if (!canUse(await loadPermissions(session), keys, false)) throw new Error('No permission')
}
