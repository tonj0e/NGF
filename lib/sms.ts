// SMS sending for customer OTPs. Provider is chosen by env, so switching MSG91 <-> Twilio needs no code change.
// Secrets are read from the server environment at call time and are never logged or returned.
//
//   SMS_PROVIDER=msg91   MSG91_AUTH_KEY, MSG91_OTP_TEMPLATE_ID                     (India, DLT-approved template)
//   SMS_PROVIDER=twilio  TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM or TWILIO_MESSAGING_SERVICE_SID
//
// Testing: while an Admin has switched on the "send codes to one mailbox" setting (Dev > Testing, expires on its own),
// the OTP is emailed to that mailbox instead of the customer's phone. See docs/08 Runbook/SMS Setup.md.
import { readTable } from './supabase-db'
import { sendEmail } from './email'
import { getConfig } from './integrations'

export type SmsResult =
  | { status: 'sent'; provider: 'msg91' | 'twilio'; ref?: string }
  | { status: 'test_email'; provider: 'test_email' }
  | { status: 'not_configured' }
  | { status: 'failed'; provider: string; error: string }

export async function configuredProvider(): Promise<'msg91' | 'twilio' | 'none'> {
  const p = (await getConfig('SMS_PROVIDER')).toLowerCase()
  if (p === 'msg91' && (await getConfig('MSG91_AUTH_KEY')) && (await getConfig('MSG91_OTP_TEMPLATE_ID'))) return 'msg91'
  if (p === 'twilio' && (await getConfig('TWILIO_ACCOUNT_SID')) && (await getConfig('TWILIO_AUTH_TOKEN')) && ((await getConfig('TWILIO_FROM')) || (await getConfig('TWILIO_MESSAGING_SERVICE_SID')))) return 'twilio'
  return 'none'
}

async function activeTestMailbox(): Promise<string | null> {
  try {
    const rows = await readTable('Settings', { forceFresh: true })
    const val = (k: string) => String(rows.find(r => r['Key'] === k)?.['Value'] || '')
    const to = val('recovery:testEmail').trim().toLowerCase()
    return Date.parse(val('recovery:testUntil')) > Date.now() && /^\S+@\S+\.\S+$/.test(to) ? to : null
  } catch { return null }
}

async function viaMsg91(mobile: string, otp: string, minutes: number): Promise<SmsResult> {
  try {
    const url = new URL('https://control.msg91.com/api/v5/otp')
    url.searchParams.set('template_id', await getConfig('MSG91_OTP_TEMPLATE_ID'))
    url.searchParams.set('mobile', `91${mobile}`)
    url.searchParams.set('otp', otp)
    url.searchParams.set('otp_expiry', String(minutes))
    const res = await fetch(url, { method: 'POST', headers: { authkey: await getConfig('MSG91_AUTH_KEY'), 'content-type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(10_000) })
    const body: { type?: string; message?: string } = await res.json().catch(() => ({}))
    if (res.ok && body.type === 'success') return { status: 'sent', provider: 'msg91', ref: typeof body.message === 'string' ? body.message : undefined }
    return { status: 'failed', provider: 'msg91', error: `MSG91 ${res.status}${body.type ? ` ${body.type}` : ''}` }
  } catch (e) { return { status: 'failed', provider: 'msg91', error: e instanceof Error ? e.name : 'network error' } }
}

async function viaTwilio(mobile: string, otp: string, minutes: number): Promise<SmsResult> {
  try {
    const sid = await getConfig('TWILIO_ACCOUNT_SID'), token = await getConfig('TWILIO_AUTH_TOKEN')
    const form = new URLSearchParams({
      To: `+91${mobile}`,
      Body: `${otp} is your NGF FINCORP verification code. It is valid for ${minutes} minutes. Tell it only to the NGF staff member you are speaking with.`,
    })
    const svc = await getConfig('TWILIO_MESSAGING_SERVICE_SID')
    if (svc) form.set('MessagingServiceSid', svc)
    else form.set('From', await getConfig('TWILIO_FROM'))
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: form, signal: AbortSignal.timeout(10_000),
    })
    const body: { sid?: string; code?: number } = await res.json().catch(() => ({}))
    if (res.ok && typeof body.sid === 'string') return { status: 'sent', provider: 'twilio', ref: body.sid }
    return { status: 'failed', provider: 'twilio', error: `Twilio ${res.status}${body.code ? ` code ${body.code}` : ''}` }
  } catch (e) { return { status: 'failed', provider: 'twilio', error: e instanceof Error ? e.name : 'network error' } }
}

/** Real provider only (ignores the testing mailbox). */
async function sendViaProvider(mobile: string, otp: string, minutes: number): Promise<SmsResult> {
  const provider = await configuredProvider()
  if (provider === 'msg91') return viaMsg91(mobile, otp, minutes)
  if (provider === 'twilio') return viaTwilio(mobile, otp, minutes)
  return { status: 'not_configured' }
}

/** Sends the OTP to a customer's 10-digit mobile. Never throws. */
export async function sendCustomerOtp(mobile: string, otp: string, minutes: number, label = 'customer'): Promise<SmsResult> {
  const test = await activeTestMailbox()
  if (test) {
    const subject = `${otp} is the TEST code for ${label} (${mobile.slice(0, 2)}••••••${mobile.slice(-2)})`
    const text = `TEST MODE: this code would have been sent by SMS to ${mobile.slice(0, 2)}••••••${mobile.slice(-2)} for ${label}.\n\nCode: ${otp}\nValid for ${minutes} minutes.\n\nThe testing mailbox switch is on (Dev > Testing). Turn it off before real use.`
    const r = await sendEmail({ to: test, subject, text, html: `<pre style="font:14px monospace">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>` })
    return r.status === 'sent' ? { status: 'test_email', provider: 'test_email' } : { status: 'failed', provider: 'test_email', error: r.status === 'failed' ? r.error : 'email not configured' }
  }
  return sendViaProvider(mobile, otp, minutes)
}

/** What the admin screen may show: which provider, whether it is complete, which env NAMES are missing. Never values. */
export async function smsStatus() {
  const wanted = (await getConfig('SMS_PROVIDER')).toLowerCase()
  const need: Record<string, string[]> = { msg91: ['MSG91_AUTH_KEY', 'MSG91_OTP_TEMPLATE_ID'], twilio: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'] }
  const missing: string[] = []
  for (const k of need[wanted] || []) if (!(await getConfig(k))) missing.push(k)
  if (wanted === 'twilio' && !(await getConfig('TWILIO_FROM')) && !(await getConfig('TWILIO_MESSAGING_SERVICE_SID'))) missing.push('TWILIO_FROM or TWILIO_MESSAGING_SERVICE_SID')
  return { chosen: wanted || '', provider: await configuredProvider(), missing, testMailboxActive: !!(await activeTestMailbox()) }
}

/** Sends a real test message through the configured provider only (the testing mailbox is ignored on purpose). Never throws. */
export async function sendTestSms(mobile: string): Promise<SmsResult> {
  const code = String(Math.floor(100000 + Math.random() * 900000))
  return sendViaProvider(mobile, code, 10)
}
