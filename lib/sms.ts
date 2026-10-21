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

export type SmsResult =
  | { status: 'sent'; provider: 'msg91' | 'twilio'; ref?: string }
  | { status: 'test_email'; provider: 'test_email' }
  | { status: 'not_configured' }
  | { status: 'failed'; provider: string; error: string }

export function configuredProvider(): 'msg91' | 'twilio' | 'none' {
  const p = (process.env.SMS_PROVIDER || '').toLowerCase()
  if (p === 'msg91' && process.env.MSG91_AUTH_KEY && process.env.MSG91_OTP_TEMPLATE_ID) return 'msg91'
  if (p === 'twilio' && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && (process.env.TWILIO_FROM || process.env.TWILIO_MESSAGING_SERVICE_SID)) return 'twilio'
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
    url.searchParams.set('template_id', process.env.MSG91_OTP_TEMPLATE_ID!)
    url.searchParams.set('mobile', `91${mobile}`)
    url.searchParams.set('otp', otp)
    url.searchParams.set('otp_expiry', String(minutes))
    const res = await fetch(url, { method: 'POST', headers: { authkey: process.env.MSG91_AUTH_KEY!, 'content-type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(10_000) })
    const body: { type?: string; message?: string } = await res.json().catch(() => ({}))
    if (res.ok && body.type === 'success') return { status: 'sent', provider: 'msg91', ref: typeof body.message === 'string' ? body.message : undefined }
    return { status: 'failed', provider: 'msg91', error: `MSG91 ${res.status}${body.type ? ` ${body.type}` : ''}` }
  } catch (e) { return { status: 'failed', provider: 'msg91', error: e instanceof Error ? e.name : 'network error' } }
}

async function viaTwilio(mobile: string, otp: string, minutes: number): Promise<SmsResult> {
  try {
    const sid = process.env.TWILIO_ACCOUNT_SID!, token = process.env.TWILIO_AUTH_TOKEN!
    const form = new URLSearchParams({
      To: `+91${mobile}`,
      Body: `${otp} is your NGF FINCORP verification code. It is valid for ${minutes} minutes. Tell it only to the NGF staff member you are speaking with.`,
    })
    if (process.env.TWILIO_MESSAGING_SERVICE_SID) form.set('MessagingServiceSid', process.env.TWILIO_MESSAGING_SERVICE_SID)
    else form.set('From', process.env.TWILIO_FROM!)
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

/** Sends the OTP to a customer's 10-digit mobile. Never throws. */
export async function sendCustomerOtp(mobile: string, otp: string, minutes: number, label = 'customer'): Promise<SmsResult> {
  const test = await activeTestMailbox()
  if (test) {
    const subject = `${otp} is the TEST code for ${label} (${mobile.slice(0, 2)}••••••${mobile.slice(-2)})`
    const text = `TEST MODE: this code would have been sent by SMS to ${mobile.slice(0, 2)}••••••${mobile.slice(-2)} for ${label}.\n\nCode: ${otp}\nValid for ${minutes} minutes.\n\nThe testing mailbox switch is on (Dev > Testing). Turn it off before real use.`
    const r = await sendEmail({ to: test, subject, text, html: `<pre style="font:14px monospace">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>` })
    return r.status === 'sent' ? { status: 'test_email', provider: 'test_email' } : { status: 'failed', provider: 'test_email', error: r.status === 'failed' ? r.error : 'email not configured' }
  }
  const provider = configuredProvider()
  if (provider === 'msg91') return viaMsg91(mobile, otp, minutes)
  if (provider === 'twilio') return viaTwilio(mobile, otp, minutes)
  return { status: 'not_configured' }
}
