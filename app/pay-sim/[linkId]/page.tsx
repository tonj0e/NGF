'use client'
// PRACTICE payment page: stands in for the bank's hosted page while testing. No real money. Returns 404 data on the live site.
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

type L = { link_id: string; status: string; base_amount: number; fee_percent: number; fee_amount: number; total_amount: number; kind: string; expires_at: string }
const inr = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n)

export default function PracticePay() {
  const { linkId } = useParams<{ linkId: string }>()
  const [l, setL] = useState<L | null>(null)
  const [state, setState] = useState<'loading' | 'missing' | 'ready' | 'done' | 'failed'>('loading')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    fetch(`/api/gateway/simulate?linkId=${encodeURIComponent(linkId)}`).then(r => r.json()).then(j => {
      if (!j.success) { setState('missing'); return }
      setL(j.data); setState(j.data.status === 'Paid' ? 'done' : 'ready')
    }).catch(() => setState('missing'))
  }, [linkId])

  async function pay(outcome: 'paid' | 'failed', method = 'upi') {
    setBusy(true)
    const r = await fetch('/api/gateway/simulate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ linkId, outcome, method }) })
    const j = await r.json().catch(() => ({}))
    setBusy(false); setMsg(j.message || '')
    setState(r.ok ? (outcome === 'paid' ? 'done' : 'failed') : 'ready')
    if (!r.ok) setMsg(j.message || j.error || 'The practice payment failed')
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-mist p-4">
      <div className="w-full max-w-sm rounded-[1.75rem] bg-white p-6 shadow-xl">
        <p className="text-center text-[11px] font-bold uppercase tracking-widest text-amber-600">Practice gateway · no real money</p>
        <p className="mt-1 text-center text-lg font-semibold">NGF FINCORP</p>
        {state === 'loading' && <p className="mt-6 text-center text-sm text-soft">Loading…</p>}
        {state === 'missing' && <p className="mt-6 text-center text-sm text-soft">This payment page is not available.</p>}
        {l && (state === 'ready' || state === 'done' || state === 'failed') && (
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl bg-panel p-4 text-sm">
              <div className="flex justify-between"><span>Loan payment</span><b>{inr(Number(l.base_amount))}</b></div>
              {Number(l.fee_amount) > 0 && <div className="flex justify-between text-soft"><span>Online payment fee ({l.fee_percent}%)</span><span>{inr(Number(l.fee_amount))}</span></div>}
              <div className="mt-1 flex justify-between border-t border-line pt-1 text-base"><span className="font-semibold">Total</span><b>{inr(Number(l.total_amount))}</b></div>
            </div>
            {state === 'ready' && (
              <>
                <button disabled={busy} onClick={() => pay('paid', 'upi')} className="w-full rounded-2xl bg-green-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">Pay with UPI (practice)</button>
                <div className="grid grid-cols-2 gap-2">
                  <button disabled={busy} onClick={() => pay('paid', 'card')} className="rounded-2xl border border-line px-3 py-2 text-xs font-semibold">Card</button>
                  <button disabled={busy} onClick={() => pay('paid', 'netbanking')} className="rounded-2xl border border-line px-3 py-2 text-xs font-semibold">Net banking</button>
                </div>
                <button disabled={busy} onClick={() => pay('failed')} className="w-full rounded-2xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600">Make the payment fail</button>
              </>
            )}
            {state === 'done' && <p className="rounded-2xl bg-green-50 p-4 text-center text-sm font-semibold text-green-700">Payment successful (practice). You can close this page.</p>}
            {state === 'failed' && <p className="rounded-2xl bg-red-50 p-4 text-center text-sm font-semibold text-red-700">Payment failed (practice).</p>}
            {msg && <p className="text-center text-[11px] text-soft">{msg}</p>}
          </div>
        )}
      </div>
    </main>
  )
}
