'use client'
// Send payment links. Guarantors: search the 4-digit pay code of their customer and send the link on WhatsApp.
// Branch staff and admin: same, plus "close loan by payment" (customer pays the whole balance; the loan closes by itself when the money arrives).
import { useState } from 'react'
import { Session } from '@/types'
import { apiGet, apiSend } from '@/lib/clientApi'
import LinkPanel, { LinkView } from './LinkPanel'

type Item = {
  loanId: string; payCode: string; customerName: string; phone: string; guarantorCode: string; guarantorName: string; endDate: string
  due: { repaymentId: string; weekNo: number; dueDate: string; amount: number; overdue: boolean }[]
  dueBase: number; dueFee: number; dueTotal: number; remainingWeeks: number; remainingBase: number; remainingFee: number; remainingTotal: number
  openLinks: { linkId: string; kind: string; total: number; expiresAt: string }[]; canClose: boolean
}
const inr = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n)

export default function PaymentLinksPage({ session }: { session: Session }) {
  const [q, setQ] = useState('')
  const [items, setItems] = useState<Item[] | null>(null)
  const [fee, setFee] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [links, setLinks] = useState<Record<string, LinkView>>({})
  const [closing, setClosing] = useState<string | null>(null)
  const [mode, setMode] = useState<'hold' | 'permanent'>('hold')
  const [reason, setReason] = useState('')

  async function search(e?: React.FormEvent) {
    e?.preventDefault(); setError(''); setBusy('search')
    const r = await apiGet<{ items: Item[]; feePercent: number }>(session.token, `/api/payment-links?q=${encodeURIComponent(q.trim())}`)
    setBusy(null)
    if (!r.ok) { setItems(null); setError(r.error || 'Search failed'); return }
    setItems(r.data!.items); setFee(r.data!.feePercent)
  }
  async function make(it: Item, kind: 'weeks' | 'closure') {
    setBusy(it.loanId + kind); setError('')
    const r = await apiSend<LinkView>(session.token, 'POST', '/api/payment-links', { loanId: it.loanId, kind, closureMode: kind === 'closure' ? mode : undefined, reason: kind === 'closure' ? reason : undefined })
    setBusy(null)
    if (!r.ok) { setError(r.error || 'Could not create the link'); return }
    setLinks(prev => ({ ...prev, [it.loanId + kind]: r.data! }))
  }
  async function showOpen(it: Item, linkId: string, kind: string) {
    const r = await apiGet<LinkView>(session.token, `/api/payment-links/${linkId}`)
    if (r.ok) setLinks(prev => ({ ...prev, [it.loanId + kind]: r.data! }))
  }

  return (
    <div className="space-y-4">
      <form onSubmit={search} className="flex flex-wrap items-center gap-2 rounded-[1.75rem] border border-white/70 bg-white p-4 shadow-panel">
        <input value={q} onChange={e => setQ(e.target.value)} data-no-upper inputMode="text" placeholder="Customer's 4-digit code (e.g. 7425), name or phone" className="min-w-[16rem] flex-1 rounded-2xl border border-[#e5e7eb] bg-[#f4f5f7] px-4 py-3 text-sm outline-none focus:border-[#1a1a2e] focus:bg-white" />
        <button type="submit" disabled={busy === 'search' || q.trim().length < 3} className="rounded-2xl bg-[#1a1a2e] px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">{busy === 'search' ? 'Searching…' : 'Search'}</button>
      </form>
      {fee > 0 && <p className="text-xs text-[#697586]">An online payment fee of {fee}% is added to what the customer pays. It is shown to the customer before they pay.</p>}
      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {items && items.length === 0 && <p className="rounded-2xl bg-white p-6 text-center text-sm text-[#697586] shadow-panel">No running loan found for that code.</p>}

      {items?.map(it => {
        const wk = links[it.loanId + 'weeks'], cl = links[it.loanId + 'closure']
        const openWeeks = it.openLinks.find(l => l.kind === 'weeks'), openClose = it.openLinks.find(l => l.kind === 'closure')
        return (
          <div key={it.loanId} className="space-y-3 rounded-[1.75rem] border border-white/70 bg-white p-5 shadow-panel">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><p className="text-base font-semibold">{it.customerName}</p><p className="text-xs text-[#697586]">Code <b className="font-mono text-[#1a1a2e]">{it.payCode}</b> · {it.loanId} · {it.phone} · guarantor {it.guarantorCode} {it.guarantorName}</p></div>
              <p className="text-xs text-[#697586]">{it.remainingWeeks} weeks left · ends {it.endDate}</p>
            </div>

            <div className="rounded-2xl bg-[#f9fafb] p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#697586]">Due now (up to this Saturday)</p>
              {it.due.length === 0 ? <p className="mt-1 text-sm text-[#697586]">Nothing is due yet.</p> : (
                <>
                  <ul className="mt-1 space-y-0.5 text-sm">{it.due.map(w => <li key={w.repaymentId} className="flex justify-between"><span>Week {w.weekNo} · {w.dueDate}{w.overdue ? <span className="ml-2 rounded bg-red-100 px-1.5 text-[10px] font-bold text-red-700">OVERDUE</span> : null}</span><b>{inr(w.amount)}</b></li>)}</ul>
                  <p className="mt-2 text-sm">Customer pays <b>{inr(it.dueTotal)}</b>{it.dueFee > 0 ? <span className="text-[#697586]"> ({inr(it.dueBase)} + {inr(it.dueFee)} fee)</span> : null}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button onClick={() => make(it, 'weeks')} disabled={busy !== null} className="rounded-xl bg-[#1a1a2e] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy === it.loanId + 'weeks' ? 'Creating…' : openWeeks ? 'Show the open link' : 'Create payment link'}</button>
                  </div>
                </>
              )}
            </div>
            {wk && <LinkPanel session={session} link={wk} />}
            {!wk && openWeeks && it.due.length > 0 && <button onClick={() => showOpen(it, openWeeks.linkId, 'weeks')} className="text-xs font-medium underline">There is an open link for {inr(openWeeks.total)}. Show it.</button>}

            {it.canClose && it.remainingWeeks > 0 && (
              <div className="rounded-2xl border border-[#e5e7eb] p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#697586]">Close the loan by payment</p>
                {closing !== it.loanId ? (
                  <button onClick={() => setClosing(it.loanId)} className="mt-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700">Customer wants to close · pay {inr(it.remainingTotal)}</button>
                ) : (
                  <div className="mt-2 space-y-2">
                    <p className="text-xs text-[#697586]">The customer pays the remaining {it.remainingWeeks} weeks ({inr(it.remainingBase)}{it.remainingFee > 0 ? ` + ${inr(it.remainingFee)} fee` : ''}). The loan closes by itself when the money arrives.</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <button type="button" onClick={() => setMode('hold')} className={`rounded-xl border p-3 text-left text-xs ${mode === 'hold' ? 'border-green-300 bg-green-50 ring-2 ring-[#1a1a2e]' : 'border-[#e5e7eb]'}`}><b>Close &amp; Hold</b><br />Renewal opens after {it.endDate}</button>
                      <button type="button" onClick={() => setMode('permanent')} className={`rounded-xl border p-3 text-left text-xs ${mode === 'permanent' ? 'border-red-300 bg-red-50 ring-2 ring-[#1a1a2e]' : 'border-[#e5e7eb]'}`}><b>Close permanently</b><br />No more loans until an admin re-admits</button>
                    </div>
                    {mode === 'permanent' && <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} data-no-upper placeholder="Why is this closed permanently? (required)" className="w-full rounded-xl border border-[#e5e7eb] px-3 py-2 text-xs outline-none focus:border-[#1a1a2e]" />}
                    <div className="flex gap-2">
                      <button onClick={() => make(it, 'closure')} disabled={busy !== null || (mode === 'permanent' && reason.trim().length < 10)} className="rounded-xl bg-[#1a1a2e] px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">{busy === it.loanId + 'closure' ? 'Creating…' : openClose ? 'Show the open closing link' : 'Create closing link / QR'}</button>
                      <button onClick={() => setClosing(null)} className="rounded-xl border border-[#e5e7eb] px-3 py-2 text-xs font-semibold">Cancel</button>
                    </div>
                  </div>
                )}
                {cl && <div className="mt-3"><LinkPanel session={session} link={cl} onPaid={() => search()} /></div>}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
