'use client'
// Customer OTP widget. Used by the field agent (new customer, at the house) and by branch staff (renewal approval, on the phone).
// The code is sent to the CUSTOMER's phone; the customer reads it out and the agent / staff types it here.
import { useEffect, useRef, useState } from 'react'
import { apiGet, apiSend } from '@/lib/clientApi'

export type OtpState = { verified: boolean; overridden: boolean }
type OtpInfo = { phoneMasked: string; hasValidPhone: boolean; canOverride: boolean; verified: boolean; overrideReason: string; last: { active: boolean; sendStatus: string } | null }

export default function OtpPanel({ token, leadId, purpose, phone, onChange }: {
  token: string; leadId: string; purpose: 'lead_verification' | 'renewal_approval'; phone?: string; onChange?: (s: OtpState) => void
}) {
  const [info, setInfo] = useState<OtpInfo | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState<'send' | 'verify' | 'override' | null>(null)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null)
  const [sendFailed, setSendFailed] = useState(false)
  const [sentOnce, setSentOnce] = useState(false)
  const [devOtp, setDevOtp] = useState('')
  const [wait, setWait] = useState(0)
  const [showOverride, setShowOverride] = useState(false)
  const [reason, setReason] = useState('')
  const cb = useRef(onChange)
  useEffect(() => { cb.current = onChange })

  async function refresh() {
    const r = await apiGet<OtpInfo>(token, `/api/otp?purpose=${purpose}&leadId=${encodeURIComponent(leadId)}`)
    if (r.ok) {
      setInfo(r.data!)
      const verified = !!r.data!.verified, overridden = !verified && !!r.data!.overrideReason
      if (r.data!.last?.active) setSentOnce(true)
      cb.current?.({ verified, overridden })
    } else setMsg({ kind: 'err', text: r.error || 'Could not load OTP status' })
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  useEffect(() => { refresh() }, [leadId, purpose])
  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait(w => w - 1), 1000); return () => clearTimeout(t) }, [wait])

  async function send() {
    setBusy('send'); setMsg(null); setDevOtp('')
    const r = await apiSend(token, 'POST', '/api/otp', { action: 'request', purpose, leadId, phone })
    setBusy(null)
    if (!r.ok) { setMsg({ kind: 'err', text: r.error || 'Could not send' }); if (r.retryAfterSec) setWait(Math.min(r.retryAfterSec, 3600)); return }
    setSentOnce(true); setWait(r.data.cooldownSec || 60); setSendFailed(!r.data.sent)
    if (r.data.devOtp) setDevOtp(r.data.devOtp)
    setMsg({ kind: r.data.sent ? 'ok' : 'err', text: `${r.data.message}${r.data.sent ? ` (${r.data.phoneMasked})` : '. Use the override below if the customer cannot receive it.'}` })
    if (!r.data.sent) setShowOverride(true)
  }
  async function verify() {
    setBusy('verify'); setMsg(null)
    const r = await apiSend(token, 'POST', '/api/otp', { action: 'verify', purpose, leadId, code })
    setBusy(null)
    if (!r.ok) { setMsg({ kind: 'err', text: r.error || 'Wrong code' }); return }
    setCode(''); setMsg({ kind: 'ok', text: 'Customer OTP verified' }); await refresh()
  }
  async function override() {
    setBusy('override'); setMsg(null)
    const r = await apiSend(token, 'POST', '/api/otp', { action: 'override', purpose, leadId, reason })
    setBusy(null)
    if (!r.ok) { setMsg({ kind: 'err', text: r.error || 'Could not record the override' }); return }
    setShowOverride(false); setMsg({ kind: 'info', text: 'Recorded without OTP. This is visible to the branch.' }); await refresh()
  }

  const verified = !!info?.verified, overridden = !verified && !!info?.overrideReason
  return (
    <div className="rounded-2xl border border-line bg-panel p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Customer OTP</p>
        {verified && <span className="rounded-lg bg-green-100 px-2 py-0.5 text-[11px] font-bold uppercase text-green-700">Verified</span>}
        {overridden && <span className="rounded-lg bg-amber-100 px-2 py-0.5 text-[11px] font-bold uppercase text-amber-700">Without OTP</span>}
        {!verified && !overridden && <span className="rounded-lg bg-line px-2 py-0.5 text-[11px] font-bold uppercase text-soft">Needed</span>}
      </div>

      {overridden && <p className="text-xs text-amber-800 bg-amber-50 rounded-xl px-3 py-2">Reason recorded: {info.overrideReason}</p>}

      {!verified && (
        <>
          <p className="text-xs text-soft">
            {purpose === 'renewal_approval'
              ? <>A code goes to the customer&apos;s registered mobile <b>{info?.phoneMasked || '…'}</b>. Call the customer, ask them to read it out, and type it here.</>
              : <>A code goes to the customer&apos;s mobile {info?.phoneMasked ? <b>{info.phoneMasked}</b> : null}. Ask the customer to read it out, then type it here.</>}
          </p>
          {info && !info.hasValidPhone && <p className="text-xs text-red-600">This customer has no valid registered mobile number. Use the override with a reason.</p>}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={send} disabled={busy !== null || wait > 0 || (!!info && !info.hasValidPhone)}
              className="rounded-xl bg-ink px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
              {busy === 'send' ? 'Sending…' : wait > 0 ? `Resend in ${wait > 90 ? `${Math.ceil(wait / 60)} min` : `${wait}s`}` : sentOnce ? 'Resend OTP' : 'Send OTP'}
            </button>
            {sentOnce && (!sendFailed || !!devOtp) && (
              <>
                <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" data-no-upper placeholder="6-digit code"
                  className="w-32 rounded-xl border border-line bg-white px-3 py-2 text-center font-mono text-sm tracking-[0.3em] outline-none focus:border-ink" />
                <button type="button" onClick={verify} disabled={busy !== null || code.length !== 6}
                  className="rounded-xl bg-green-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy === 'verify' ? 'Checking…' : 'Verify'}</button>
              </>
            )}
          </div>
          {devOtp && <p className="rounded-xl border border-dashed border-blue-300 bg-blue-50 px-3 py-2 text-xs text-blue-800">Local testing only (never on the live site): the code is <b className="font-mono tracking-widest">{devOtp}</b></p>}
        </>
      )}

      {msg && <p className={`text-xs ${msg.kind === 'err' ? 'text-red-600' : msg.kind === 'ok' ? 'text-green-700' : 'text-soft'}`}>{msg.text}</p>}

      {!verified && (
        <div className="border-t border-line pt-2">
          {!showOverride ? (
            <button type="button" onClick={() => setShowOverride(true)} className="text-xs font-medium text-soft underline">SMS failed or no signal? Continue without OTP</button>
          ) : info && !info.canOverride ? (
            <p className="text-xs text-soft">Only the branch manager or assistant manager can approve without an OTP. Ask them, or try again later.</p>
          ) : (
            <div className="space-y-2">
              <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} data-no-upper placeholder="Why can the OTP not be used? (e.g. customer has no signal, called twice)"
                className="w-full rounded-xl border border-line bg-white px-3 py-2 text-xs outline-none focus:border-ink" />
              <div className="flex gap-2">
                <button type="button" onClick={override} disabled={busy !== null || reason.trim().length < 10}
                  className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 disabled:opacity-50">{busy === 'override' ? 'Saving…' : 'Continue without OTP'}</button>
                <button type="button" onClick={() => setShowOverride(false)} className="rounded-xl border border-line px-3 py-1.5 text-xs font-semibold">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
