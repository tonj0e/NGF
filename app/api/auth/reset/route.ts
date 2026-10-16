import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase-db'
import { hashPassword, verifyPassword, verifyResetToken } from '@/lib/auth'
import { authRateLimit } from '@/lib/rate-limiter'
import { validateBody, resetPasswordSchema } from '@/lib/validation'
import { validatePasswordPolicy } from '@/lib/passwordPolicy'
import { consumeVerifiedOtp, invalidateUserOtps } from '@/lib/otp'
import { createAuditLogger, AUDIT_ACTIONS } from '@/lib/audit'

// Step 3 of recovery: set a new password using the token issued after OTP verification.
// Only password_hash, salt and updated_at change. Changing the hash also revokes every session
// previously issued to this user (tokens carry a fingerprint of the hash; see lib/api.ts getSession).
const bad = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status })

export async function POST(req: NextRequest) {
  const rateLimitResult = authRateLimit(req)
  if (!rateLimitResult.success) return rateLimitResult.response!

  const validation = await validateBody(resetPasswordSchema)(req)
  if (!validation.success) return validation.response
  const { resetToken, password } = validation.data

  let userId: string, otpId: string
  try {
    ;({ userId, otpId } = await verifyResetToken(resetToken))
  } catch {
    return bad('This reset session has expired. Please start again.')
  }

  try {
    const sb = getSupabase()
    const { data: user } = await sb.from('users')
      .select('user_id, username, email, role, status, password_hash').eq('user_id', userId).maybeSingle()
    if (!user || user.status !== 'Active') return bad('This reset session has expired. Please start again.')

    // Validate before consuming the code so a weak password does not burn the verified OTP
    const policyError = validatePasswordPolicy(password, { username: user.username, email: user.email })
    if (policyError) return bad(policyError)
    if (user.password_hash && await verifyPassword(password, user.password_hash)) {
      return bad('Choose a password different from your current one')
    }

    const audit = createAuditLogger(req, { userId: user.user_id, username: user.username, role: user.role })

    // Single use: only one request can flip consumed_at
    if (!(await consumeVerifiedOtp(otpId, userId))) {
      await audit.failure(AUDIT_ACTIONS.PASSWORD_RESET_FAILED, 'User', userId, { reason: 'code already used or expired' })
      return bad('This reset session has expired. Please start again.')
    }

    const { error } = await sb.from('users')
      .update({ password_hash: await hashPassword(password), salt: '', updated_at: new Date().toISOString() })
      .eq('user_id', userId)
    if (error) {
      await audit.failure(AUDIT_ACTIONS.PASSWORD_RESET_FAILED, 'User', userId, { reason: 'update failed' })
      return bad('Could not update the password. Please start again.', 500)
    }

    await invalidateUserOtps(userId)
    await audit.success(AUDIT_ACTIONS.PASSWORD_RESET, 'User', userId, { method: 'email_otp', sessionsRevoked: true })
    return NextResponse.json({ success: true, data: { message: 'Your password has been updated. Sign in with your new password.' } })
  } catch (e) {
    console.error('[reset] failed:', e instanceof Error ? e.message : 'unknown error')
    return bad('Could not update the password. Please start again.', 500)
  }
}
