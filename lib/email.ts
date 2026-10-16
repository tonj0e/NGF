// Server-side transactional email via Resend (https://resend.com/docs/api-reference/emails/send-email).
// RESEND_API_KEY and EMAIL_FROM are read from the server environment at call time and are never
// exposed to browser code. A message counts as "sent" only when Resend accepts it and returns an id.

export type EmailResult =
  | { status: 'sent'; providerId: string }
  | { status: 'not_configured' }
  | { status: 'failed'; error: string }

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM
}

export function otpEmailContent(name: string, otp: string, minutes: number) {
  const subject = `${otp} is your NGF FINCORP verification code`
  const text =
    `Hello ${name},\n\nYour NGF FINCORP password reset code is ${otp}.\n` +
    `It expires in ${minutes} minutes and can be used once.\n\n` +
    `If you did not request this, you can ignore this email — your password has not changed.\n` +
    `Never share this code with anyone. NGF FINCORP staff will never ask for it.\n\n— NGF FINCORP`
  const html = `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a2e">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden">
<tr><td style="background:#1a1a2e;padding:22px 28px;color:#ffffff;font-size:13px;font-weight:700;letter-spacing:.18em">NGF FINCORP</td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 8px;font-size:22px">Reset your password</h1>
<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#697586">Hello ${esc(name)}, use this code to continue resetting your password.</p>
<div style="text-align:center;margin:0 0 20px"><span style="display:inline-block;background:#f4f5f7;border:1px solid #e5e7eb;border-radius:14px;padding:14px 26px;font-size:32px;font-weight:700;letter-spacing:.35em;font-family:ui-monospace,Menlo,Consolas,monospace">${esc(otp)}</span></div>
<p style="margin:0 0 6px;font-size:13px;color:#697586">This code expires in <strong>${minutes} minutes</strong> and can be used once.</p>
<p style="margin:0;font-size:13px;color:#697586">If you did not request this, ignore this email — your password has not changed. Never share this code; NGF FINCORP staff will never ask for it.</p>
</td></tr>
<tr><td style="padding:16px 28px;background:#f9fafb;font-size:11px;color:#9aa3af">Automated message from NGF FINCORP. Please do not reply.</td></tr>
</table></td></tr></table></body></html>`
  return { subject, text, html }
}

export async function sendEmail(opts: {
  to: string; subject: string; html: string; text: string; idempotencyKey?: string
}): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  if (!apiKey || !from) return { status: 'not_configured' }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(opts.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : {}),
      },
      body: JSON.stringify({ from, to: [opts.to], subject: opts.subject, html: opts.html, text: opts.text }),
      signal: AbortSignal.timeout(10_000),
    })
    const body: { id?: unknown; name?: unknown } = await res.json().catch(() => ({}))
    if (res.ok && typeof body?.id === 'string') return { status: 'sent', providerId: body.id }
    // Provider error text only — never includes the key, recipient body or OTP
    return { status: 'failed', error: `Resend ${res.status}${typeof body?.name === 'string' ? ` ${body.name}` : ''}` }
  } catch (e) {
    return { status: 'failed', error: e instanceof Error ? e.name : 'network error' }
  }
}

export async function sendOtpEmail(to: string, name: string, otp: string, minutes: number, idempotencyKey?: string) {
  return sendEmail({ to, ...otpEmailContent(name, otp, minutes), idempotencyKey })
}
