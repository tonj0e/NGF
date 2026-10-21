'use client'
// Customer wants to close the loan early and pays the remaining weeks up front.
//   Close & Hold:       loan closes; customer can renew only after the ORIGINAL end date.
//   Close permanently:  loan closes; no more loans until an Admin re-admits after fresh verification.
import { useEffect, useState } from 'react'
import { Session } from '@/types'
import { apiGet, apiSend } from '@/lib/clientApi'
import LinkPanel, { LinkView } from './LinkPanel'

const inr = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
const nice = (ymd: string) => { const d = new Date(String(ymd).slice(0, 10) + 'T00:00:00'); return isNaN(d.getTime()) ? ymd : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) }

export default function EarlyCloseSection({ session, loanId, onDone }: { session: Session; loanId: string; onDone: (msg: string) => void }) {
  const [info, setInfo] = useState<{ customerName: string; endDate: string; weeksRemaining: number; amountRemaining: number } | null>(null)
  const [mode, setMode] = useState<'hold' | 'permanent' | ''>('')
  const [paymentMode, setPaymentMode] = useState('Cash')
  const [collected, setCollected] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [link, setLink] = useState<LinkView | null>(null)
  const [linkBusy, setLinkBusy] = useState(false)

  useEffect(() => { apiGet(session.token, `/api/loans/close?loanId=${encodeURIComponent(loanId)}`).then(r => r.ok ? setInfo(r.data) : setError(r.error || 'Could not load')) }, [loanId, session.token])
  if (!info) return error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p> : null

  const needsPayment = info.weeksRemaining > 0
  const ready = !!mode && (!needsPayment || collected) && (mode !== 'permanent' || reason.trim().length >= 10)

  async function submit() {
    if (!mode) return
    if (!confirm(mode === 'hold'
      ? `Close & Hold ${info!.customerName}?\n${needsPayment ? `Collect ${inr(info!.amountRemaining)} now. ` : ''}They can renew only after ${nice(info!.endDate)}.`
      : `Close ${info!.customerName} PERMANENTLY?\nThey will get no more loans until an admin re-admits them.`)) return
    setBusy(true); setError('')
    const r = await apiSend(session.token, 'POST', '/api/loans/close', { loanId, mode, paymentMode: needsPayment ? paymentMode : undefined, confirmCollected: collected, reason })
    setBusy(false)
    if (!r.ok) { setError(r.error || 'Could not close the loan'); return }
    onDone(mode === 'hold' ? `Closed. ${info!.customerName} can renew after ${nice(r.data.holdUntil || info!.endDate)}.` : `Closed permanently. ${info!.customerName} gets no further loans.`)
  }

  const card = (key: 'hold' | 'permanent', title: string, text: string, tone: string) => (
    <button type="button" onClick={() => setMode(key)} className={`w-full rounded-2xl border p-3 text-left transition ${mode === key ? `${tone} ring-2 ring-[#1a1a2e]` : 'border-[#e5e7eb] bg-white hover:bg-[#f9fafb]'}`}>
      <p className="text-sm font-semibold">{title}</p><p className="mt-0.5 text-xs text-[#697586]">{text}</p>
    </button>
  )

  async function payOnline() {
    if (!mode) return
    setLinkBusy(true); setError('')
    const r = await apiSend<LinkView>(session.token, 'POST', '/api/payment-links', { loanId, kind: 'closure', closureMode: mode, reason })
    setLinkBusy(false)
    if (!r.ok) { setError(r.error || 'Could not create the payment link'); return }
    setLink(r.data!)
  }

  return (
    <div className="space-y-3 rounded-2xl border border-[#e5e7eb] bg-[#f9fafb] p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-[#697586]">Customer wants to close early</p>
      {needsPayment
        ? <p className="text-xs text-[#697586]">{info.weeksRemaining} weeks left · the customer pays <b className="text-[#1a1a2e]">{inr(info.amountRemaining)}</b> now. The loan was due to end on {nice(info.endDate)}.</p>
        : <p className="text-xs text-[#697586]">All weeks are already paid.</p>}
      {card('hold', 'Close & Hold', `Renewal opens after ${nice(info.endDate)} (when the original cycle would have finished).`, 'border-green-300 bg-green-50')}
      {card('permanent', 'Close permanently', 'No more loans for this customer until an admin re-admits them after fresh verification.', 'border-red-300 bg-red-50')}
      {mode && needsPayment && (
        <div className="space-y-2">
          <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)} className="w-full rounded-xl border border-[#e5e7eb] bg-white px-3 py-2 text-sm">
            {['Cash', 'UPI', 'Bank', 'Cheque', 'Other'].map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={collected} onChange={e => setCollected(e.target.checked)} className="mt-0.5" /><span>I collected <b>{inr(info.amountRemaining)}</b> from the customer</span></label>
        </div>
      )}
      {mode === 'permanent' && (
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} data-no-upper placeholder="Why is this closed permanently? (required)" className="w-full rounded-xl border border-[#e5e7eb] bg-white px-3 py-2 text-xs outline-none focus:border-[#1a1a2e]" />
      )}
      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
      {needsPayment && mode && (mode !== 'permanent' || reason.trim().length >= 10) && !link && (
        <button type="button" onClick={payOnline} disabled={linkBusy} className="w-full rounded-2xl border border-[#1a1a2e] bg-white px-4 py-3 text-sm font-semibold disabled:opacity-40">{linkBusy ? 'Creating link…' : 'Customer pays online instead (link / QR)'}</button>
      )}
      {link && <LinkPanel session={session} link={link} onPaid={() => onDone(mode === 'hold' ? `Paid online. ${info.customerName}'s loan is closed and on hold.` : `Paid online. ${info.customerName}'s loan is closed permanently.`)} />}
      <button type="button" onClick={submit} disabled={!ready || busy} className="w-full rounded-2xl bg-[#1a1a2e] px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">{busy ? 'Closing…' : mode === 'hold' ? 'Close & Hold' : mode === 'permanent' ? 'Close permanently' : 'Choose an option'}</button>
    </div>
  )
}
