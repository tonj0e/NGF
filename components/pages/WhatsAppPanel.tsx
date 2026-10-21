'use client'
// Dev > WhatsApp: connect the WhatsApp sender (Twilio or Meta Cloud API), see usage, send a test. Keys are saved encrypted and never shown.
import { useEffect, useState } from 'react'
import { Session } from '@/types'
import { apiGet, apiSend } from '@/lib/clientApi'
import IntegrationFields from './IntegrationFields'

type Status = { chosen: string; provider: 'twilio' | 'meta' | 'none'; missing: string[]; templateSet: boolean; usage: { today: number; cap: number } }

export default function WhatsAppPanel({ session }: { session: Session }) {
  const [st, setSt] = useState<Status | null>(null)
  const [error, setError] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function load() { const r = await apiGet<Status>(session.token, '/api/whatsapp'); if (r.ok) { setSt(r.data!); setError('') } else setError(r.error || 'Could not load') }
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function test() {
    setBusy(true); setMsg(null)
    const r = await apiSend(session.token, 'POST', '/api/whatsapp', { phone })
    setBusy(false)
    setMsg(r.ok ? { ok: true, text: `Test message sent to ${r.data.to} through ${r.data.provider}. Check WhatsApp.` } : { ok: false, text: r.error || 'Failed' })
    load()
  }

  const connected = st?.provider && st.provider !== 'none'
  return (
    <div className="space-y-4">
      <div className="rounded-[1.75rem] border border-white/70 bg-white p-6 shadow-panel space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-sm font-semibold">WhatsApp messages</p><p className="text-xs text-[#697586]">Payment links are sent to the customer automatically from the server.</p></div>
          {st && <span className={`rounded-full px-3 py-1 text-xs font-bold ${connected ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{connected ? `Connected: ${st.provider.toUpperCase()}` : 'Not connected'}</span>}
        </div>
        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
        {st && !connected && st.chosen && st.missing.length > 0 && <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">Provider <b>{st.chosen}</b> is chosen but these are missing: <b>{st.missing.join(', ')}</b>.</p>}
        {st && connected && !st.templateSet && <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">Add the approved message template below. WhatsApp only allows business-started messages through an approved template.</p>}
        <IntegrationFields session={session} group="whatsapp" onChanged={load} />
        <div className="rounded-2xl bg-[#f9fafb] p-3 text-xs text-[#697586] space-y-1">
          <p className="font-semibold text-[#1a1a2e]">Template to get approved (utility category)</p>
          <p className="font-mono">Hello {'{{1}}'}, your NGF FINCORP loan {'{{2}}'} payment of {'{{3}}'} is due. Pay securely: {'{{4}}'} (valid till {'{{5}}'})</p>
          <p>Variables in order: customer name, loan number, amount, payment link, valid-until time.</p>
        </div>
      </div>

      {st && (
        <div className="rounded-[1.75rem] border border-white/70 bg-white p-6 shadow-panel space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">Usage today</p>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${st.usage.today >= st.usage.cap ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{st.usage.today} of {st.usage.cap} messages</span>
          </div>
          <ul className="text-xs text-[#697586] space-y-1">
            <li>Each payment link can be sent at most 3 times.</li>
            <li>Each staff login: 60 automatic messages per hour.</li>
            <li>Whole system: {st.usage.cap} per day (change it with the daily limit above). Staff can still use the manual WhatsApp button.</li>
          </ul>
        </div>
      )}

      <div className="rounded-[1.75rem] border border-white/70 bg-white p-6 shadow-panel space-y-3">
        <p className="text-sm font-semibold">Send a test message</p>
        <p className="text-xs text-[#697586]">Sends a sample message to your own number. Limited to 3 tests per 10 minutes.</p>
        <div className="flex flex-wrap gap-2">
          <input value={phone} onChange={e => setPhone(e.target.value.replace(/[^\d+\s]/g, ''))} inputMode="tel" data-no-upper placeholder="Your mobile, 10 digits" className="w-56 rounded-2xl border border-[#e5e7eb] bg-[#f4f5f7] px-4 py-3 text-sm outline-none focus:border-[#1a1a2e] focus:bg-white" />
          <button onClick={test} disabled={busy || !connected || phone.replace(/\D/g, '').length < 10} className="rounded-2xl bg-[#1a1a2e] px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">{busy ? 'Sending…' : 'Send test message'}</button>
          <button onClick={load} className="rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm font-semibold">Re-check</button>
        </div>
        {msg && <p className={`rounded-xl px-3 py-2 text-xs ${msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>{msg.text}</p>}
      </div>
    </div>
  )
}
