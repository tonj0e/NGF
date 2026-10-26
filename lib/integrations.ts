// Integration settings managed from the admin panel (Dev > SMS / WhatsApp / Payments / AI Reader).
//  - Keys and tokens ("secrets") are stored ENCRYPTED (AES-256-GCM) in integration_secrets. The encryption key lives on the server
//    (SETTINGS_ENCRYPTION_KEY, or JWT_SECRET if that is not set), never in the database. The screen can never read a secret back:
//    it only learns "set" and the last 4 characters.
//  - Plain choices (provider name, template names, limits) live in the settings table as `integration:<NAME>`.
//  - If nothing is saved in the panel, the same name is read from the server environment, so the older env-variable setup still works.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'
import { getSupabase, readTable, updateById, appendRow, invalidateCache, nowIso } from './supabase-db'

export type Group = 'sms' | 'whatsapp' | 'gateway' | 'ai' | 'monitor'
export interface Field { name: string; group: Group; label: string; secret: boolean; hint?: string; options?: string[]; placeholder?: string }

export const FIELDS: Field[] = [
  // SMS (customer OTP)
  { name: 'SMS_PROVIDER', group: 'sms', label: 'SMS provider', secret: false, options: ['msg91', 'twilio'], hint: 'Which company sends the customer OTP' },
  { name: 'MSG91_AUTH_KEY', group: 'sms', label: 'MSG91 Auth key', secret: true, hint: 'MSG91 > your profile > Authkey' },
  { name: 'MSG91_OTP_TEMPLATE_ID', group: 'sms', label: 'MSG91 OTP template ID', secret: false, hint: 'MSG91 > SendOTP > Templates (needs DLT approval)' },
  { name: 'TWILIO_ACCOUNT_SID', group: 'sms', label: 'Twilio Account SID', secret: true, hint: 'Twilio console, starts with AC. Also used for WhatsApp through Twilio' },
  { name: 'TWILIO_AUTH_TOKEN', group: 'sms', label: 'Twilio Auth token', secret: true, hint: 'Twilio console. Also used for WhatsApp through Twilio' },
  { name: 'TWILIO_FROM', group: 'sms', label: 'Twilio sender number', secret: false, placeholder: '+1...', hint: 'Or use a Messaging Service SID below' },
  { name: 'TWILIO_MESSAGING_SERVICE_SID', group: 'sms', label: 'Twilio Messaging Service SID', secret: false, placeholder: 'MG...' },
  { name: 'OTP_DAILY_CAP', group: 'sms', label: 'Daily limit of customer OTP codes', secret: false, placeholder: '200', hint: 'Whole system, per day. Admins get an alert at 80% and 100%' },
  // WhatsApp (payment links to customers)
  { name: 'WHATSAPP_PROVIDER', group: 'whatsapp', label: 'WhatsApp provider', secret: false, options: ['twilio', 'meta'], hint: 'Twilio WhatsApp uses the Twilio keys from the SMS tab. Meta = WhatsApp Business Cloud API' },
  { name: 'WHATSAPP_TWILIO_FROM', group: 'whatsapp', label: 'Twilio WhatsApp sender', secret: false, placeholder: '+14155238886', hint: 'Your approved WhatsApp number (or the Twilio sandbox number for testing)' },
  { name: 'WHATSAPP_TWILIO_CONTENT_SID', group: 'whatsapp', label: 'Twilio template (Content SID)', secret: false, placeholder: 'HX...', hint: 'Approved message template. Empty = plain text, which WhatsApp only delivers inside a 24-hour chat window' },
  { name: 'WHATSAPP_META_TOKEN', group: 'whatsapp', label: 'Meta access token', secret: true, hint: 'Meta Business > WhatsApp > API setup (use a permanent token)' },
  { name: 'WHATSAPP_META_PHONE_ID', group: 'whatsapp', label: 'Meta phone number ID', secret: false },
  { name: 'WHATSAPP_META_TEMPLATE', group: 'whatsapp', label: 'Meta template name', secret: false, placeholder: 'payment_link', hint: 'Must be approved by Meta. Body: see the WhatsApp note in the docs' },
  { name: 'WHATSAPP_META_LANG', group: 'whatsapp', label: 'Meta template language', secret: false, placeholder: 'en' },
  { name: 'WHATSAPP_DAILY_CAP', group: 'whatsapp', label: 'Daily limit of automatic WhatsApp messages', secret: false, placeholder: '300', hint: 'Protects your WhatsApp bill' },
  // AI reader for payment screenshots (Payments > Chat)
  { name: 'SENTRY_DSN', group: 'monitor', label: 'Sentry key (DSN)', secret: true, hint: 'sentry.io > Settings > Projects > your project > Client Keys (DSN). A long address starting with https://. Used straight away, no rebuild' },
  { name: 'ANTHROPIC_API_KEY', group: 'ai', label: 'Claude API key', secret: true, hint: 'console.anthropic.com > API keys. Paid, most accurate. Set a monthly spending limit there' },
  { name: 'NVIDIA_API_KEY', group: 'ai', label: 'NVIDIA API key', secret: true, hint: 'build.nvidia.com > your API key. Free, for testing' },
  { name: 'NVIDIA_MODEL', group: 'ai', label: 'NVIDIA model', secret: false, placeholder: 'nvidia/nemotron-nano-12b-v2-vl', hint: 'Must be a vision model (one that can read images). Empty = the default shown here' },
  // Payment gateway
  { name: 'GATEWAY_PROVIDER', group: 'gateway', label: 'Gateway', secret: false, options: ['bank', 'simulator'], hint: 'bank = the bank\'s real gateway. simulator = practice only, never works on the live site' },
  { name: 'GATEWAY_MERCHANT_ID', group: 'gateway', label: 'Merchant ID', secret: false },
  { name: 'GATEWAY_BASE_URL', group: 'gateway', label: 'Gateway API address', secret: false, placeholder: 'https://...', hint: 'From the bank (sandbox first, then live)' },
  { name: 'GATEWAY_API_KEY', group: 'gateway', label: 'API key', secret: true },
  { name: 'GATEWAY_API_SECRET', group: 'gateway', label: 'API secret', secret: true },
  { name: 'GATEWAY_WEBHOOK_SECRET', group: 'gateway', label: 'Webhook signing secret', secret: true, hint: 'The secret the bank uses to sign the payment callback' },
]
const BY_NAME = new Map(FIELDS.map(f => [f.name, f]))
export const fieldOf = (name: string) => BY_NAME.get(name)

// ---------- encryption ----------
const encKey = () => createHash('sha256').update(`ngf-integration-secrets:${process.env.SETTINGS_ENCRYPTION_KEY || process.env.JWT_SECRET || ''}`).digest()
function encrypt(plain: string) {
  const iv = randomBytes(12); const c = createCipheriv('aes-256-gcm', encKey(), iv)
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return { ciphertext: ct.toString('base64'), iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64') }
}
function decrypt(row: { ciphertext: string; iv: string; tag: string }): string | undefined {
  try {
    const d = createDecipheriv('aes-256-gcm', encKey(), Buffer.from(row.iv, 'base64')); d.setAuthTag(Buffer.from(row.tag, 'base64'))
    return Buffer.concat([d.update(Buffer.from(row.ciphertext, 'base64')), d.final()]).toString('utf8')
  } catch { return undefined }   // wrong key or tampered: treated as not set
}

// ---------- read ----------
type Snapshot = { at: number; secrets: Map<string, { value?: string; last4: string }>; settings: Map<string, string> }
let snap: Snapshot | null = null
export function clearConfigCache() { snap = null }

async function load(): Promise<Snapshot> {
  if (snap && Date.now() - snap.at < 15_000) return snap
  const sb = getSupabase()
  const [sec, set] = await Promise.all([
    sb.from('integration_secrets').select('name, ciphertext, iv, tag, last4'),
    sb.from('settings').select('key, value').like('key', 'integration:%'),
  ])
  const secrets = new Map<string, { value?: string; last4: string }>()
  for (const r of sec.data || []) secrets.set(r.name, { value: decrypt(r), last4: r.last4 })
  const settings = new Map<string, string>()
  for (const r of set.data || []) settings.set(String(r.key).slice('integration:'.length), String(r.value ?? ''))
  snap = { at: Date.now(), secrets, settings }
  return snap
}

/** The effective value: saved in the admin panel first, then the server environment, else ''. */
export async function getConfig(name: string): Promise<string> {
  const f = BY_NAME.get(name)
  try {
    const s = await load()
    if (f?.secret) { const v = s.secrets.get(name)?.value; if (v) return v }
    else { const v = s.settings.get(name); if (v) return v }
  } catch { /* store unavailable: fall back to the environment */ }
  return process.env[name] || ''
}

export interface FieldStatus { name: string; group: Group; label: string; secret: boolean; hint?: string; options?: string[]; placeholder?: string; source: 'panel' | 'server' | 'none'; last4: string; value: string }
/** For the admin screen. Secrets are NEVER returned, only whether they are set and their last 4 characters. */
export async function allStatuses(): Promise<FieldStatus[]> {
  const s = await load()
  return FIELDS.map(f => {
    if (f.secret) {
      const row = s.secrets.get(f.name)
      if (row?.value) return { ...f, source: 'panel', last4: row.last4, value: '' }
      const env = process.env[f.name]
      return { ...f, source: env ? 'server' : 'none', last4: env ? env.slice(-4) : '', value: '' }
    }
    const v = s.settings.get(f.name)
    if (v) return { ...f, source: 'panel', last4: '', value: v }
    const env = process.env[f.name]
    return { ...f, source: env ? 'server' : 'none', last4: '', value: env || '' }
  })
}

// ---------- write (callers must have checked Admin + password) ----------
export async function setConfig(name: string, value: string, userId: string) {
  const f = BY_NAME.get(name); if (!f) throw new Error('Unknown setting')
  const v = String(value).trim()
  if (!v) throw new Error('Enter a value, or use Remove')
  if (v.length > 2000) throw new Error('Value is too long')
  if (f.options && !f.options.includes(v)) throw new Error(`Choose one of: ${f.options.join(', ')}`)
  if (f.secret) {
    const e = encrypt(v)
    const { error } = await getSupabase().from('integration_secrets').upsert({ name, ...e, last4: v.slice(-4), updated_by: userId, updated_at: nowIso() })
    if (error) throw new Error(error.message)
  } else {
    const key = `integration:${name}`
    const rows = await readTable('Settings', { forceFresh: true })
    if (rows.some(r => r['Key'] === key)) await updateById('Settings', key, { 'Value': v, 'Updated At': nowIso() })
    else await appendRow('Settings', { 'Key': key, 'Value': v, 'Updated At': nowIso() })
    invalidateCache('Settings')
  }
  clearConfigCache()
}

export async function clearConfig(name: string) {
  const f = BY_NAME.get(name); if (!f) throw new Error('Unknown setting')
  if (f.secret) await getSupabase().from('integration_secrets').delete().eq('name', name)
  else { await getSupabase().from('settings').delete().eq('key', `integration:${name}`); invalidateCache('Settings') }
  clearConfigCache()
}
