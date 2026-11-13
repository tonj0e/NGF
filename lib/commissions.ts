import { readTable } from './supabase-db'
import type { Session } from '../types'

export * from './commissionCycles'
export const PERM_GP_COMMISSIONS = 'gp:commissions'

function permsOf(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[]
  return String(raw || '').split(',').map(s => s.trim()).filter(Boolean)
}

/** Guarantor with no custom page list keeps every page; with one, needs gp:commissions. Non-guarantors: true. */
export async function guarantorCanSeeCommissions(session: Session): Promise<boolean> {
  if (session.role !== 'Guarantor') return true
  const acc = await readTable('StaffAccess', { forceFresh: true })
  const mine = acc.find(a => a['User ID'] === session.userId)
  const perms = permsOf(mine?.['Permissions'])
  if (!perms.includes('pages:custom')) return true
  return perms.includes(PERM_GP_COMMISSIONS)
}
