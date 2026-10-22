import { NextRequest } from 'next/server'
import { apiHandler, requireRole, ok, err } from '@/lib/api'
import { whatsappStatus, sendWhatsApp, logOutbound } from '@/lib/whatsapp'
import { normalizeIndianMobile, maskMobile } from '@/lib/phone'
import { rateLimitKey } from '@/lib/rate-limiter'
import { csrfProtection } from '@/lib/csrf'
import { createAuditLogger } from '@/lib/audit'

// Admin only: is WhatsApp connected, usage today, and a test message to the admin's own number.
export const GET = apiHandler(async (req: NextRequest) => { await requireRole(req, ['Admin']); return ok(await whatsappStatus()) })

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ['Admin'])
  const csrfError = csrfProtection(req, session.userId)
  if (csrfError) return csrfError
  const mobile = normalizeIndianMobile((await req.json().catch(() => ({}))).phone)
  if (!mobile) return err('Enter a valid 10-digit mobile number')
  const rl = rateLimitKey(`wa-test:${session.userId}`, 3, 10 * 60 * 1000)
  if (!rl.success) return err(`Too many test messages. Try again in ${Math.ceil(rl.retryAfterSec / 60)} minutes.`, 429)
  const r = await sendWhatsApp(mobile, 'NGF FINCORP test message. If you can read this, WhatsApp is connected.', ['Test', 'TEST-0000', '₹1,000', 'https://ngffincorp.com', 'soon'])
  await logOutbound({ purpose: 'test', mobile, status: r.status, provider: 'provider' in r ? r.provider : undefined, ref: 'ref' in r ? r.ref : undefined, error: r.status === 'failed' ? r.error : undefined, by: session.userId })
  await createAuditLogger(req, session).log('WHATSAPP_TEST_SENT', 'Setting', 'whatsapp', { to: maskMobile(mobile), result: r.status }, r.status === 'sent')
  if (r.status === 'sent') return ok({ sent: true, provider: r.provider, to: maskMobile(mobile) })
  if (r.status === 'not_configured') return err('WhatsApp is not connected yet. Fill the settings above first.')
  return err(`WhatsApp refused the message (${r.error}). Check the keys, the sender number and the template.`, 502)
})
