import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { getSupabase } from '@/lib/supabase-db'
import { authRateLimit, rateLimitKey } from '@/lib/rate-limiter'
import { validateBody, forgotPasswordSchema } from '@/lib/validation'
import { createAuditLogger, extractClientInfo, AUDIT_ACTIONS } from '@/lib/audit'
import { issueOtp, normalizeEmail, recordEmailResult, OTP_TTL_MS, OTP_RESEND_COOLDOWN_MS } from '@/lib/otp'
import { sendOtpEmail } from '@/lib/email'

// Step 1 of recovery: request a one-time code by email.
// The response is identical whether or not an account exists, and nothing here claims an email
// was sent — delivery is recorded server-side only after the provider accepts it.
const GENERIC = {
  success: true,
  data: {
    message: 'If an account is registered with that email address, a verification code will be sent to it shortly. It can take a minute to arrive — check your spam folder too.',
    cooldownSeconds: OTP_RESEND_COOLDOWN_MS / 1000,
    expiresInMinutes: OTP_TTL_MS / 60000,
  },
}

export async function POST(req: NextRequest) {
  const rateLimitResult = authRateLimit(req)
  if (!rateLimitResult.success) return rateLimitResult.response!

  const validation = await validateBody(forgotPasswordSchema)(req)
  if (!validation.success) return validation.response
  const email = normalizeEmail(validation.data.email)

  // Per-email request cap (5/hour), applied identically to registered and unregistered addresses so the
  // UI can tell the user to wait without revealing whether an account exists.
  const perEmail = rateLimitKey(`forgot-email:${email}`, 5, 3600_000)
  if (!perEmail.success) {
    const res = NextResponse.json(
      { success: false, error: 'Too many code requests for this email address. Please try again later.' },
      { status: 429 }
    )
    res.headers.set('Retry-After', String(perEmail.retryAfterSec))
    return res
  }

  try {
    const sb = getSupabase()
    // Exact, case-insensitive match (escape LIKE wildcards); only an unambiguous Active account is used
    const { data: matches } = await sb.from('users')
      .select('user_id, username, name, role, status, email')
      .ilike('email', email.replace(/[\\%_]/g, '\\$&'))
      .eq('status', 'Active')
      .limit(2)

    if (matches && matches.length === 1) {
      const user = matches[0]
      const { ipAddress } = extractClientInfo(req)
      const issued = await issueOtp(user.user_id, ipAddress)
      const audit = createAuditLogger(req, { userId: user.user_id, username: user.username, role: user.role })

      if (issued.issued) {
        await audit.success(AUDIT_ACTIONS.PASSWORD_RESET_OTP_ISSUED, 'User', user.user_id, { otpId: issued.id })
        const { id, otp } = issued
        // Send after the response so timing does not reveal whether the account exists
        after(async () => {
          const result = await sendOtpEmail(user.email, user.name, otp, OTP_TTL_MS / 60000, id)
          if (result.status === 'sent') {
            await recordEmailResult(id, 'sent', result.providerId)
            await audit.success(AUDIT_ACTIONS.PASSWORD_RESET_EMAIL_SENT, 'User', user.user_id, { otpId: id, providerId: result.providerId })
          } else {
            await recordEmailResult(id, result.status === 'not_configured' ? 'not_configured' : 'failed')
            if (result.status === 'not_configured') console.warn('[email] RESEND_API_KEY / EMAIL_FROM not configured — verification email was NOT sent')
            await audit.failure(AUDIT_ACTIONS.PASSWORD_RESET_EMAIL_FAILED, 'User', user.user_id,
              { otpId: id, reason: result.status === 'failed' ? result.error : 'email provider not configured' })
          }
        })
      } else {
        await audit.failure(AUDIT_ACTIONS.PASSWORD_RESET_REQUEST, 'User', user.user_id, { reason: issued.reason })
      }
    }
  } catch (e) {
    // Never reveal internal state to the caller; keep the failure observable on the server
    console.error('[forgot] request failed:', e instanceof Error ? e.message : 'unknown error')
  }

  return NextResponse.json(GENERIC)
}
