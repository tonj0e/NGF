#!/usr/bin/env node
// Sends ONE test email through Resend using RESEND_API_KEY / EMAIL_FROM from .env.local.
// Usage: node scripts/test-email-delivery.mjs recipient@example.com
// Prints only the outcome and Resend's message id — never the API key. "SENT" means Resend accepted
// the message; confirm inbox arrival yourself (and check Resend's dashboard for delivered/bounced).
import fs from 'fs'
import path from 'path'

const to = process.argv[2]
if (!to || !/^\S+@\S+\.\S+$/.test(to)) { console.error('Usage: node scripts/test-email-delivery.mjs recipient@example.com'); process.exit(2) }

const file = path.join(process.cwd(), '.env.local')
const env = fs.existsSync(file)
  ? Object.fromEntries(fs.readFileSync(file, 'utf8').split('\n').filter(l => /^[A-Z_]+=/.test(l))
      .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]))
  : {}
const apiKey = process.env.RESEND_API_KEY || env.RESEND_API_KEY
const from = process.env.EMAIL_FROM || env.EMAIL_FROM
if (!apiKey || !from) { console.log('NOT CONFIGURED: set RESEND_API_KEY and EMAIL_FROM in .env.local'); process.exit(3) }

const res = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    from, to: [to],
    subject: 'NGF FINCORP email delivery test',
    text: 'This is a delivery test from the NGF FINCORP CRM. No action is needed.',
    html: '<p>This is a delivery test from the <strong>NGF FINCORP</strong> CRM. No action is needed.</p>',
  }),
  signal: AbortSignal.timeout(15000),
}).catch(e => ({ ok: false, status: 0, json: async () => ({ name: e.name }) }))
const body = await res.json().catch(() => ({}))
if (res.ok && body.id) { console.log(`SENT: accepted by Resend (id ${body.id}). Check the inbox and the Resend dashboard.`); process.exit(0) }
console.log(`FAILED: Resend ${res.status}${body?.name ? ' ' + body.name : ''}${body?.message ? ' — ' + body.message : ''}`)
process.exit(1)
