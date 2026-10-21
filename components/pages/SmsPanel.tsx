'use client'
// Dev > SMS: shows whether customer-OTP SMS is connected and sends a test message. Never shows keys.
import { useEffect, useState } from 'react'
import { Session } from '@/types'
import { apiGet, apiSend } from '@/lib/clientApi'
import IntegrationFields from './IntegrationFields'

type Status = { chosen: string; provider: 'msg91' | 'twilio' | 'none'; missing: string[]; testMailboxActive: boolean; usage: { today: number; cap: number }; limits: { resendGapsSec: number[]; perLeadPerHour: number; perPhonePerHour: number; perPhonePerDay: number; perUserPerHour: number; perUserPerDay: number; perIpPerHour: number } }

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
            {!st.chosen && <p>No provider chosen yet. Choose one in the settings below, then add its keys.</p>}
            {st.chosen && st.missing.length > 0 && <p>Provider <b>{st.chosen}</b> is chosen but these settings are missing: <b>{st.missing.join(', ')}</b>.</p>}
            {st.chosen && !['msg91', 'twilio'].includes(st.chosen) && <p>&quot;{st.chosen}&quot; is not a supported provider. Use <b>msg91</b> or <b>twilio</b>.</p>}
            <p>MSG91 needs an auth key and an OTP template id. Twilio needs the account SID, auth token and a from-number (or messaging service SID).</p>
          </div>
        )}
        {st?.testMailboxActive && <p className="rounded-xl bg-blue-50 px-3 py-2 text-xs text-blue-800">The testing mailbox switch is ON (Dev &gt; Testing): customer codes are emailed to the test mailbox instead of being sent by SMS. Turn it off before real use.</p>}
        <IntegrationFields session={session} group="sms" onChanged={load} />
        <p className="text-xs text-[#697586]">Keys are saved encrypted on the server and never shown again. Every change asks for your admin password.</p>
      </div>

      {st && (
        <div className="rounded-[1.75rem] border border-white/70 bg-white p-6 shadow-panel space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">Sending limits (protect your SMS budget)</p>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${st.usage.today >= st.usage.cap ? 'bg-red-100 text-red-700' : st.usage.today >= st.usage.cap * 0.8 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>{st.usage.today} of {st.usage.cap} codes used today</span>
          </div>
          <div className="h-2 rounded-full bg-[#e5e7eb]"><div className={`h-2 rounded-full ${st.usage.today >= st.usage.cap ? 'bg-red-500' : st.usage.today >= st.usage.cap * 0.8 ? 'bg-amber-500' : 'bg-green-500'}`} style={{ width: `${Math.min(100, Math.round((st.usage.today / Math.max(st.usage.cap, 1)) * 100))}%` }} /></div>
          <ul className="grid gap-x-6 gap-y-1 text-xs text-[#697586] sm:grid-cols-2">
            <li>Same customer: wait {st.limits.resendGapsSec.map(g => (g >= 60 ? `${g / 60} min` : `${g}s`)).join(' → ')} between codes, max {st.limits.perLeadPerHour} per hour</li>
            <li>Same phone number: {st.limits.perPhonePerHour} per hour, {st.limits.perPhonePerDay} per day</li>
            <li>Same staff or agent login: {st.limits.perUserPerHour} per hour, {st.limits.perUserPerDay} per day</li>
            <li>Same network address: {st.limits.perIpPerHour} per hour</li>
            <li>Whole system: {st.usage.cap} per day (resets at midnight IST). You get an alert at 80% and 100%.</li>
            <li>When a limit is hit, staff can still continue with the override and a written reason.</li>
          </ul>
          <p className="text-xs text-[#697586]">To change the daily limit, use the &quot;Daily limit&quot; setting above. Also set a spending limit or low-balance alert inside MSG91 / Twilio as a second safety net.</p>
        </div>
      )}

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
