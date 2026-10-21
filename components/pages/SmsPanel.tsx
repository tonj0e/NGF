'use client'
// Dev > SMS: shows whether customer-OTP SMS is connected and sends a test message. Never shows keys.
import { useEffect, useState } from 'react'
import { Session } from '@/types'
import { apiGet, apiSend } from '@/lib/clientApi'

type Status = { chosen: string; provider: 'msg91' | 'twilio' | 'none'; missing: string[]; testMailboxActive: boolean }

export default function SmsPanel({ session }: { session: Session }) {
  const [st, setSt] = useState<Status | null>(null)
  const [error, setError] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function load() { const r = await apiGet<Status>(session.token, '/api/sms'); if (r.ok) { setSt(r.data!); setError('') } else setError(r.error || 'Could not load') }
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function test() {
    setBusy(true); setMsg(null)
    const r = await apiSend(session.token, 'POST', '/api/sms', { phone })
    setBusy(false)
    setMsg(r.ok ? { ok: true, text: `Test message sent to ${r.data.to} through ${r.data.provider}. Check the phone.` } : { ok: false, text: r.error || 'Failed' })
  }

  const connected = st?.provider && st.provider !== 'none'
  return (
    <div className="space-y-4">
      <div className="rounded-[1.75rem] border border-white/70 bg-white p-6 shadow-panel space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-sm font-semibold">Customer OTP by SMS</p><p className="text-xs text-[#697586]">The code goes to the customer&apos;s phone at the visit and at renewal approval.</p></div>
          {st && <span className={`rounded-full px-3 py-1 text-xs font-bold ${connected ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{connected ? `Connected: ${st.provider.toUpperCase()}` : 'Not connected'}</span>}
        </div>
        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
        {st && !connected && (
          <div className="rounded-2xl bg-amber-50 p-4 text-xs text-amber-900 space-y-1.5">
            {!st.chosen && <p>No provider chosen. On Hostinger add <b>SMS_PROVIDER</b> = <b>msg91</b> (or <b>twilio</b>), then the keys below, and redeploy.</p>}
            {st.chosen && st.missing.length > 0 && <p>Provider <b>{st.chosen}</b> is chosen but these settings are missing: <b>{st.missing.join(', ')}</b>.</p>}
            {st.chosen && !['msg91', 'twilio'].includes(st.chosen) && <p>&quot;{st.chosen}&quot; is not a supported provider. Use <b>msg91</b> or <b>twilio</b>.</p>}
            <p>MSG91 needs: <b>MSG91_AUTH_KEY</b>, <b>MSG91_OTP_TEMPLATE_ID</b>. Twilio needs: <b>TWILIO_ACCOUNT_SID</b>, <b>TWILIO_AUTH_TOKEN</b> and <b>TWILIO_FROM</b> (or <b>TWILIO_MESSAGING_SERVICE_SID</b>).</p>
          </div>
        )}
        {st?.testMailboxActive && <p className="rounded-xl bg-blue-50 px-3 py-2 text-xs text-blue-800">The testing mailbox switch is ON (Dev &gt; Testing): customer codes are emailed to the test mailbox instead of being sent by SMS. Turn it off before real use.</p>}
        <p className="text-xs text-[#697586]">Keys are never shown here. They live as environment variables on the server (Hostinger &gt; Node.js &gt; Environment variables). Steps: docs &quot;SMS Setup&quot;.</p>
      </div>

      <div className="rounded-[1.75rem] border border-white/70 bg-white p-6 shadow-panel space-y-3">
        <p className="text-sm font-semibold">Send a test message</p>
        <p className="text-xs text-[#697586]">Sends a real 6-digit code through the connected provider to your own number (it costs one message). Limited to 3 tests per 10 minutes.</p>
        <div className="flex flex-wrap gap-2">
          <input value={phone} onChange={e => setPhone(e.target.value.replace(/[^\d+\s]/g, ''))} inputMode="tel" data-no-upper placeholder="Your mobile, 10 digits" className="w-56 rounded-2xl border border-[#e5e7eb] bg-[#f4f5f7] px-4 py-3 text-sm outline-none focus:border-[#1a1a2e] focus:bg-white" />
          <button onClick={test} disabled={busy || !connected || phone.replace(/\D/g, '').length < 10} className="rounded-2xl bg-[#1a1a2e] px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">{busy ? 'Sending…' : 'Send test SMS'}</button>
          <button onClick={load} className="rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm font-semibold">Re-check</button>
        </div>
        {!connected && st && <p className="text-xs text-[#697586]">The test button unlocks once SMS is connected.</p>}
        {msg && <p className={`rounded-xl px-3 py-2 text-xs ${msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>{msg.text}</p>}
      </div>
    </div>
  )
}
