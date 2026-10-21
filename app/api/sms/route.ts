import { NextRequest } from 'next/server'
import { apiHandler, requireRole, ok, err } from '@/lib/api'
import { smsStatus, sendTestSms } from '@/lib/sms'
import { otpUsageToday, OTP_LIMITS } from '@/lib/customerOtp'
import { normalizeIndianMobile, maskMobile } from '@/lib/phone'
import { rateLimitKey } from '@/lib/rate-limiter'
import { csrfProtection } from '@/lib/csrf'
import { createAuditLogger } from '@/lib/audit'

// Admin only: is SMS connected (names of missing settings, never values) and send a test message to the admin's own number.
export const GET = apiHandler(async (req: NextRequest) => {
  await requireRole(req, ['Admin'])
  const [st, usage] = await Promise.all([smsStatus(), otpUsageToday()])
  const { resendGapsSec, perLeadPerHour, perPhonePerHour, perPhonePerDay, perUserPerHour, perUserPerDay, perIpPerHour } = OTP_LIMITS
  return ok({ ...st, usage, limits: { resendGapsSec, perLeadPerHour, perPhonePerHour, perPhonePerDay, perUserPerHour, perUserPerDay, perIpPerHour, dailyCap: usage.cap } })
})

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ['Admin'])
  const csrfError = csrfProtection(req, session.userId)
  if (csrfError) return csrfError
  const body = await req.json().catch(() => ({}))
  const mobile = normalizeIndianMobile(body.phone)
  if (!mobile) return err('Enter a valid 10-digit mobile number')
  const rl = rateLimitKey(`sms-test:${session.userId}`, 3, 10 * 60 * 1000)
  if (!rl.success) return err(`Too many test messages. Try again in ${Math.ceil(rl.retryAfterSec / 60)} minutes.`, 429)
  const r = await sendTestSms(mobile)
  await createAuditLogger(req, session).log('SMS_TEST_SENT', 'Setting', 'sms', { to: maskMobile(mobile), result: r.status }, r.status === 'sent')
  if (r.status === 'sent') return ok({ sent: true, provider: r.provider, to: maskMobile(mobile) })
  if (r.status === 'not_configured') return err('SMS is not connected yet. Add the settings on Hostinger and redeploy, then try again.', 400)
  return err(r.status === 'failed' ? `The provider refused the message (${r.error}). Check the key, the template and your balance.` : 'Could not send', 502)
})
