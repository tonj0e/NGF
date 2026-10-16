import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase-db'
import { authRateLimit } from '@/lib/rate-limiter'
import { validateBody, verifyOtpSchema } from '@/lib/validation'
import { createAuditLogger, AUDIT_ACTIONS } from '@/lib/audit'
import { verifyOtp, normalizeEmail } from '@/lib/otp'
import { createResetToken } from '@/lib/auth'

// Step 2 of recovery: exchange email + 6-digit code for a short-lived, single-purpose reset token.
// Every failure returns the same message so account existence and OTP state are not disclosed.
const FAIL = () => NextResponse.json(
  { success: false, error: 'That code is incorrect or has expired. Check the code or request a new one.' },
  { status: 400 }
)

export async function POST(req: NextRequest) {
  const rateLimitResult = authRateLimit(req)
  if (!rateLimitResult.success) return rateLimitResult.response!

  const validation = await validateBody(verifyOtpSchema)(req)
  if (!validation.success) return validation.response
  const email = normalizeEmail(validation.data.email)

  try {
    const { data: matches } = await getSupabase().from('users')
      .select('user_id, username, role')
      .ilike('email', email.replace(/[\\%_]/g, '\\$&'))
      .eq('status', 'Active')
      .limit(2)

    if (!matches || matches.length !== 1) return FAIL()
    const user = matches[0]
    const audit = createAuditLogger(req, { userId: user.user_id, username: user.username, role: user.role })

    const result = await verifyOtp(user.user_id, validation.data.otp)
    if (!result.ok) {
      await audit.failure(AUDIT_ACTIONS.PASSWORD_RESET_OTP_FAILED, 'User', user.user_id, { reason: result.reason })
      return FAIL()
    }

    await audit.success(AUDIT_ACTIONS.PASSWORD_RESET_OTP_VERIFIED, 'User', user.user_id, { otpId: result.otpId })
    return NextResponse.json({ success: true, data: { resetToken: await createResetToken(user.user_id, result.otpId) } })
  } catch (e) {
    console.error('[verify-otp] failed:', e instanceof Error ? e.message : 'unknown error')
    return FAIL()
  }
}
