import { NextRequest } from 'next/server'
import { apiHandler, requireRole, ok, err } from '@/lib/api'
import { allStatuses, setConfig, clearConfig, fieldOf } from '@/lib/integrations'
import { readTable } from '@/lib/supabase-db'
import { verifyPassword } from '@/lib/auth'
import { rateLimitKey } from '@/lib/rate-limiter'
import { csrfProtection } from '@/lib/csrf'
import { createAuditLogger } from '@/lib/audit'
import { notifyRole } from '@/lib/notifications'

// Admin only. Lists integration settings WITHOUT their secret values, and changes them after the admin types their password again.
export const GET = apiHandler(async (req: NextRequest) => {
  await requireRole(req, ['Admin'])
  return ok({ fields: await allStatuses() })
})

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ['Admin'])
  const csrfError = csrfProtection(req, session.userId)
  if (csrfError) return csrfError
  const b = await req.json().catch(() => ({})) as { action?: string; name?: string; value?: string; password?: string }
  const f = fieldOf(String(b.name || ''))
  if (!f) return err('Unknown setting')
  if (b.action !== 'set' && b.action !== 'clear') return err('action must be set or clear')
  if (!b.password) return err('Type your admin password to confirm')

  const rl = rateLimitKey(`int-pw:${session.userId}`, 8, 10 * 60 * 1000)
  if (!rl.success) return err(`Too many password attempts. Try again in ${Math.ceil(rl.retryAfterSec / 60)} minutes.`, 429)
  const me = (await readTable('Users', { forceFresh: true })).find(u => u['User ID'] === session.userId)
  if (!me || !(await verifyPassword(String(b.password), me['Password Hash']))) {
    await createAuditLogger(req, session).log('INTEGRATION_PASSWORD_WRONG', 'Setting', f.name, {}, false)
    return err('That password is not correct', 403)
  }

  try {
    if (b.action === 'set') await setConfig(f.name, String(b.value ?? ''), session.userId)
    else await clearConfig(f.name)
  } catch (e) { return err(e instanceof Error ? e.message : 'Could not save') }
  // The value is never logged or sent anywhere; only which setting changed and by whom
  await createAuditLogger(req, session).log(b.action === 'set' ? 'INTEGRATION_SET' : 'INTEGRATION_CLEARED', 'Setting', f.name, { group: f.group, secret: f.secret })
  try { await notifyRole('Admin', 'Integration setting changed', `${session.name} ${b.action === 'set' ? 'changed' : 'removed'} "${f.label}" (${f.group}).`, 'Setting', f.name) } catch { /* alert is best effort */ }
  return ok({ fields: await allStatuses() })
})
