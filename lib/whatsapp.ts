// Automatic WhatsApp messages to customers (payment links). Provider chosen in Dev > WhatsApp (Twilio WhatsApp or Meta Cloud API).
// WhatsApp only lets a business START a chat with an approved TEMPLATE; plain text is delivered only inside a 24-hour window after the
// customer last wrote to you. So production use needs a template (set its name / Content SID in Dev > WhatsApp).
import { getConfig } from './integrations'
import { getSupabase } from './supabase-db'
import { maskMobile } from './phone'

export type WaResult =
  | { status: 'sent'; provider: 'twilio' | 'meta'; ref?: string }
  | { status: 'not_configured' }
  | { status: 'failed'; provider: string; error: string }

export async function whatsappProvider(): Promise<'twilio' | 'meta' | 'none'> {
  const p = (await getConfig('WHATSAPP_PROVIDER')).toLowerCase()
  if (p === 'twilio' && (await getConfig('TWILIO_ACCOUNT_SID')) && (await getConfig('TWILIO_AUTH_TOKEN')) && (await getConfig('WHATSAPP_TWILIO_FROM'))) return 'twilio'
  if (p === 'meta' && (await getConfig('WHATSAPP_META_TOKEN')) && (await getConfig('WHATSAPP_META_PHONE_ID'))) return 'meta'
  return 'none'
}

const IST_OFFSET = 5.5 * 3600_000, DAY = 24 * 3600_000
const istDayStart = () => new Date(Math.floor((Date.now() + IST_OFFSET) / DAY) * DAY - IST_OFFSET).toISOString()
export async function whatsappCap(): Promise<number> { const n = Number(await getConfig('WHATSAPP_DAILY_CAP')); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 300 }
export async function whatsappUsageToday(): Promise<{ today: number; cap: number }> {
  const { count } = await getSupabase().from('outbound_messages').select('id', { count: 'exact', head: true }).eq('channel', 'whatsapp').eq('status', 'sent').gte('created_at', istDayStart())
  return { today: count ?? 0, cap: await whatsappCap() }
}

export async function whatsappStatus() {
  const wanted = (await getConfig('WHATSAPP_PROVIDER')).toLowerCase()
  const need: Record<string, string[]> = { twilio: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'WHATSAPP_TWILIO_FROM'], meta: ['WHATSAPP_META_TOKEN', 'WHATSAPP_META_PHONE_ID'] }
  const missing: string[] = []
  for (const k of need[wanted] || []) if (!(await getConfig(k))) missing.push(k)
  const templateSet = wanted === 'twilio' ? !!(await getConfig('WHATSAPP_TWILIO_CONTENT_SID')) : wanted === 'meta' ? !!(await getConfig('WHATSAPP_META_TEMPLATE')) : false
  return { chosen: wanted || '', provider: await whatsappProvider(), missing, templateSet, usage: await whatsappUsageToday() }
}

/** Sends one WhatsApp message to a 10-digit Indian mobile. `params` fill the template variables in order. Never throws. */
export async function sendWhatsApp(mobile: string, text: string, params: string[]): Promise<WaResult> {
  const provider = await whatsappProvider()
  if (provider === 'none') return { status: 'not_configured' }
  try {
    if (provider === 'twilio') {
      const sid = await getConfig('TWILIO_ACCOUNT_SID'), token = await getConfig('TWILIO_AUTH_TOKEN')
      const from = (await getConfig('WHATSAPP_TWILIO_FROM')).replace(/^whatsapp:/, '')
      const form = new URLSearchParams({ To: `whatsapp:+91${mobile}`, From: `whatsapp:${from.startsWith('+') ? from : '+' + from}` })
      const content = await getConfig('WHATSAPP_TWILIO_CONTENT_SID')
      if (content) { form.set('ContentSid', content); form.set('ContentVariables', JSON.stringify(Object.fromEntries(params.map((p, i) => [String(i + 1), p])))) }
      else form.set('Body', text)
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST', headers: { authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' }, body: form, signal: AbortSignal.timeout(12_000),
      })
      const j: { sid?: string; code?: number } = await res.json().catch(() => ({}))
      if (res.ok && j.sid) return { status: 'sent', provider: 'twilio', ref: j.sid }
      return { status: 'failed', provider: 'twilio', error: `Twilio ${res.status}${j.code ? ` code ${j.code}` : ''}` }
    }
    const token = await getConfig('WHATSAPP_META_TOKEN'), phoneId = await getConfig('WHATSAPP_META_PHONE_ID'), tpl = await getConfig('WHATSAPP_META_TEMPLATE')
    const body = tpl
      ? { messaging_product: 'whatsapp', to: `91${mobile}`, type: 'template', template: { name: tpl, language: { code: (await getConfig('WHATSAPP_META_LANG')) || 'en' }, components: [{ type: 'body', parameters: params.map(p => ({ type: 'text', text: p })) }] } }
      : { messaging_product: 'whatsapp', to: `91${mobile}`, type: 'text', text: { body: text, preview_url: true } }
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(12_000) })
    const j: { messages?: { id: string }[]; error?: { code?: number; message?: string } } = await res.json().catch(() => ({}))
    if (res.ok && j.messages?.[0]?.id) return { status: 'sent', provider: 'meta', ref: j.messages[0].id }
    return { status: 'failed', provider: 'meta', error: `Meta ${res.status}${j.error?.code ? ` code ${j.error.code}` : ''}` }
  } catch (e) { return { status: 'failed', provider, error: e instanceof Error ? e.name : 'network error' } }
}

/** Log every automatic message (cost control, audit). The number is stored masked. */
export async function logOutbound(row: { purpose: string; subjectId?: string; mobile: string; status: string; provider?: string; ref?: string; error?: string; by?: string }) {
  await getSupabase().from('outbound_messages').insert({ channel: 'whatsapp', purpose: row.purpose, subject_id: row.subjectId || null, to_phone: maskMobile(row.mobile), status: row.status, provider: row.provider || null, provider_ref: row.ref || null, error_text: row.error || null, created_by: row.by || null })
}
