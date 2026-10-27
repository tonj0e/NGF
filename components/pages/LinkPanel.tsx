'use client'
// One payment link: breakdown, QR (customer scans it), WhatsApp send, copy, and live status until it is paid.
import { useEffect, useRef, useState } from 'react'
import { Session } from '@/types'
import { apiGet, apiSend } from '@/lib/clientApi'

export type LinkView = {
  linkId: string; kind: 'weeks' | 'closure'; status: string; loanId: string; payCode: string; customerName: string
  base: number; feePercent: number; fee: number; total: number; url: string; expiresAt: string; paidAt: string | null; method: string | null
  weeks: { weekNo: number; dueDate: string; amount: number }[]; message: string; whatsappUrl: string; qr: string; closureMode: string | null
  whatsappReady?: boolean; whatsappStatus?: string | null; whatsappSentAt?: string | null; whatsappSends?: number
}
const inr = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n)

export default function LinkPanel({ session, link, onPaid }: { session: Session; link: LinkView; onPaid?: () => void }) {
  const [cur, setCur] = useState<LinkView>(link)
  const [copied, setCopied] = useState('')
  const [sending, setSending] = useState(false)
  const [sendMsg, setSendMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const paidFired = useRef(false)
  useEffect(() => { setCur(link); paidFired.current = false }, [link.linkId]) // eslint-disable-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  useEffect(() => {
    if (cur.status !== 'Created') return
    const t = setInterval(async () => {
      const r = await apiGet<LinkView>(session.token, `/api/payment-links/${cur.linkId}`)
      if (r.ok && r.data) { setCur(r.data); if (r.data.status === 'Paid' && !paidFired.current) { paidFired.current = true; onPaid?.() } }
    }, 4000)
    return () => clearInterval(t)
  }, [cur.linkId, cur.status, session.token]) // eslint-disable-line react-hooks/exhaustive-deps

  async function sendAuto() {
    setSending(true); setSendMsg(null)
    const r = await apiSend<{ to: string }>(session.token, 'POST', `/api/payment-links/${cur.linkId}`)
    setSending(false)
    if (r.ok) { setSendMsg({ ok: true, text: `Sent on WhatsApp to ${r.data!.to}` }); setCur(c => ({ ...c, whatsappSends: (c.whatsappSends || 0) + 1, whatsappStatus: 'sent' })) }
    else setSendMsg({ ok: false, text: r.error || 'Could not send' })
  }
  async function copy(text: string, what: string) { try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(''), 1800) } catch { setCopied('Copy failed') } }
  const tone = cur.status === 'Paid' ? 'bg-green-100 text-green-700' : cur.status === 'Created' ? 'bg-blue-100 text-blue-700' : cur.status === 'Failed' || cur.status === 'Mismatch' || cur.status === 'Error' ? 'bg-red-100 text-red-700' : 'bg-line text-soft'

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <div><p className="text-sm font-semibold">{cur.kind === 'closure' ? 'Close loan by payment' : 'Weekly payment link'} · {cur.customerName}</p><p className="text-[11px] text-soft">Loan {cur.loanId} · code {cur.payCode}</p></div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${tone}`}>{cur.status === 'Created' ? 'Waiting for payment' : cur.status}</span>
      </div>

      {cur.status === 'Paid' ? (
        <p className="rounded-xl bg-green-50 px-3 py-3 text-sm font-semibold text-green-700">Paid {inr(cur.total)}{cur.method ? ` by ${cur.method}` : ''}. The weeks are marked paid{cur.kind === 'closure' ? ' and the loan is closed' : ''}.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <div className="space-y-2">
            <ul className="space-y-0.5 text-xs text-soft">{cur.weeks.map(w => <li key={w.weekNo}>Week {w.weekNo} · {w.dueDate} · {inr(w.amount)}</li>)}</ul>
            <div className="rounded-xl bg-panel p-3 text-sm">
              <div className="flex justify-between"><span>Amount</span><b>{inr(cur.base)}</b></div>
              {cur.fee > 0 && <div className="flex justify-between text-soft"><span>Online payment fee ({cur.feePercent}%)</span><span>{inr(cur.fee)}</span></div>}
              <div className="mt-1 flex justify-between border-t border-line pt-1 text-base"><span className="font-semibold">Customer pays</span><b>{inr(cur.total)}</b></div>
            </div>
            <div className="flex flex-wrap gap-2">
              {cur.whatsappReady && <button onClick={sendAuto} disabled={sending || (cur.whatsappSends || 0) >= 3} className="rounded-xl bg-[#25D366] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{sending ? 'Sending…' : (cur.whatsappSends || 0) > 0 ? 'Send again on WhatsApp' : 'Send on WhatsApp (automatic)'}</button>}
              {cur.whatsappUrl
                ? <a href={cur.whatsappUrl} target="_blank" rel="noreferrer" className={cur.whatsappReady ? 'rounded-xl border border-line px-3 py-2 text-xs font-semibold' : 'rounded-xl bg-[#25D366] px-4 py-2 text-xs font-semibold text-white'}>{cur.whatsappReady ? 'Open in my WhatsApp' : 'Send on WhatsApp'}</a>
                : <span className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">No valid WhatsApp number for this customer</span>}
              <button onClick={() => copy(cur.message, 'Message copied')} className="rounded-xl border border-line px-3 py-2 text-xs font-semibold">Copy message</button>
              <button onClick={() => copy(cur.url, 'Link copied')} className="rounded-xl border border-line px-3 py-2 text-xs font-semibold">Copy link</button>
              {copied && <span className="self-center text-xs text-green-700">{copied}</span>}
              {sendMsg && <span className={`self-center text-xs ${sendMsg.ok ? 'text-green-700' : 'text-red-600'}`}>{sendMsg.text}</span>}
            </div>
            <p className="text-[11px] text-soft">Valid until {new Date(cur.expiresAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })}. This page updates by itself when the customer pays.</p>
          </div>
          {cur.qr && <div className="text-center"><img src={cur.qr} alt="Payment QR" className="mx-auto h-40 w-40 rounded-xl border border-line" /><p className="mt-1 text-[11px] text-soft">Customer scans to pay</p></div>}
        </div>
      )}
    </div>
  )
}
