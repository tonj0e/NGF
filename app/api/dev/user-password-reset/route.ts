import { NextRequest } from 'next/server'
import { apiHandler, requireRole, ok, err } from '@/lib/api'
import { devOnlyGuard } from '@/lib/devOnly'
import { getSupabase } from '@/lib/supabase-db'
import { hashPassword } from '@/lib/auth'
import { validateBody, devUserPasswordResetSchema } from '@/lib/validation'
import { validatePasswordPolicy } from '@/lib/passwordPolicy'
import { invalidateUserOtps } from '@/lib/otp'
import { createAuditLogger, AUDIT_ACTIONS } from '@/lib/audit'
import { authRateLimit } from '@/lib/rate-limiter'

// DEVELOPMENT ONLY — Admin password reset utility.
// Disabled in production by server-side environment enforcement (devOnlyGuard), not by hiding UI.
// The new password is supplied by the signed-in Admin, validated, hashed, and never returned or logged.
// Changing the hash revokes the target user's existing sessions (token fingerprint, lib/api.ts).

export const GET = apiHandler(async (req: NextRequest) => {
  const blocked = devOnlyGuard()
  if (blocked) return blocked
  await requireRole(req, ['Admin'])
  return ok({ available: true })
})

export const POST = apiHandler(async (req: NextRequest) => {
  const blocked = devOnlyGuard()
  if (blocked) return blocked
  const rl = authRateLimit(req)
  if (!rl.success) return rl.response!
  const session = await requireRole(req, ['Admin'])

  const validation = await validateBody(devUserPasswordResetSchema)(req)
  if (!validation.success) return validation.response
  const { username, newPassword, confirm } = validation.data

  const sb = getSupabase()
  const { data: target } = await sb.from('users')
    .select('user_id, username, role, status, email').ilike('username', username.replace(/[\\%_]/g, '\\$&')).limit(2)
  if (!target || target.length !== 1) return err('User not found')
  const user = target[0]

  // Explicit confirmation: the Admin must type the exact phrase naming the target account
  if (confirm !== `RESET ${user.username}`) return err(`Confirmation must be exactly: RESET ${user.username}`)

  const policyError = validatePasswordPolicy(newPassword, { username: user.username, email: user.email })
  if (policyError) return err(policyError)

  const audit = createAuditLogger(req, session)
  const { error } = await sb.from('users')
    .update({ password_hash: await hashPassword(newPassword), salt: '', updated_at: new Date().toISOString() })
    .eq('user_id', user.user_id)
  if (error) {
    await audit.failure(AUDIT_ACTIONS.DEV_USER_PASSWORD_RESET, 'User', user.user_id, { reason: 'update failed' })
    return err('Could not update the password', 500)
  }

  await invalidateUserOtps(user.user_id)
  await audit.success(AUDIT_ACTIONS.DEV_USER_PASSWORD_RESET, 'User', user.user_id,
    { targetUsername: user.username, targetRole: user.role, actor: session.userId, sessionsRevoked: true })
  return ok({ message: `Password reset for ${user.username}. Their existing sessions are no longer valid.` })
})
