'use client'
import { useEffect, useState } from 'react'
import { Session } from '@/types'
import QRCode from 'qrcode'

function currency(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

type Receipt = { requestId: string; type: string; amount: number; qrDataUrl: string }

export default function DepositsPage({ session }: { session: Session }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [principalAmt, setPrincipalAmt] = useState('')

  function showToast(msg: string, ok: boolean) { setToast({ msg, ok }); setTimeout(() => setToast(null), 3500) }

  function load() {
    fetch('/api/deposits', { headers: { Authorization: `Bearer ${session.token}` } })
      .then(r => r.json()).then(j => { if (j.success) setData(j.data) }).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  async function buildReceipt(requestId: string, type: string, amount: number) {
    const payload = JSON.stringify({ t: 'NGF_DEPOSIT_PAYOUT', rid: requestId, gid: data.guarantorId, uid: session.userId, gn: data.name, typ: type, amt: amount, rd: new Date().toISOString().slice(0, 10) })
    const qrDataUrl = await QRCode.toDataURL(payload, { width: 220, margin: 2, color: { dark: '#11144f', light: '#ffffff' } })
    setReceipt({ requestId, type, amount, qrDataUrl })
  }

  async function request(type: 'Interest' | 'Principal') {
    setBusy(true)
    try {
      const body: any = { type }
      if (type === 'Principal') body.amount = Number(principalAmt || 0)
      const res = await fetch('/api/deposits/request', {
        method: 'POST', headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(r => r.json())
      if (res.success) {
        showToast('Withdrawal request submitted!', true)
        setPrincipalAmt('')
        await buildReceipt(res.data.requestId, res.data.type, res.data.amount)
        load()
      } else showToast(res.error || 'Request failed', false)
    } finally { setBusy(false) }
  }

  async function showPendingReceipt() {
    const pending = data.requests.find((r: any) => r.status === 'Pending')
    if (!pending) return
    await buildReceipt(pending.requestId, pending.type, pending.amount)
  }

  if (loading) return <div className="flex h-40 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-[#1a1a2e] border-t-transparent" /></div>
  if (!data) return <p className="p-8 text-center text-sm text-[#697586]">No deposit account found.</p>

  const a = data.account
  const hasPending = data.requests.some((r: any) => r.status === 'Pending')
  const principalAllowed = data.settings.principalWithdraw

  return (
    <div className="space-y-5">
      {toast && <div className={`fixed top-5 right-5 z-50 rounded-2xl px-5 py-3 text-sm font-medium text-white shadow-lg ${toast.ok ? 'bg-green-600' : 'bg-red-600'}`}>{toast.msg}</div>}

      {/* Receipt modal */}
      {receipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setReceipt(null)}>
          <div className="w-full max-w-sm rounded-[1.75rem] bg-white shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-black/5">
              <div>
                <p className="font-semibold">Withdrawal Receipt</p>
                <p className="text-xs font-mono text-[#697586] mt-0.5">{receipt.requestId}</p>
              </div>
              <button onClick={() => setReceipt(null)} className="rounded-full p-1.5 hover:bg-[#f4f5f7]">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-5 py-4 space-y-3 text-center">
              <p className="text-xs text-[#697586] uppercase tracking-wide">{receipt.type} Withdrawal</p>
              <p className="text-3xl font-bold text-green-700">{currency(receipt.amount)}</p>
              <img src={receipt.qrDataUrl} width={160} height={160} alt="QR" className="mx-auto rounded-xl border border-[#e5e7eb]" />
              <p className="text-[11px] text-[#697586]">Show this QR to admin to receive your payout</p>
              <p className="text-[10px] text-amber-700 font-semibold">Status: Pending Admin Approval</p>
            </div>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[1.5rem] border border-white/70 bg-white p-5 shadow-panel">
          <p className="text-xs text-[#697586]">Total Deposit</p>
          <p className="mt-2 text-3xl font-semibold">{currency(a.principal)}</p>
        </div>
        <div className="rounded-[1.5rem] border border-white/70 bg-white p-5 shadow-panel">
          <p className="text-xs text-[#697586]">Interest Available</p>
          <p className={`mt-2 text-3xl font-semibold ${a.availableInterest > 0 ? 'text-green-700' : ''}`}>{currency(a.availableInterest)}</p>
          <p className="mt-1 text-xs text-[#697586]">{a.ratePerCycle}% per {a.cycleDays} days</p>
        </div>
        <div className="rounded-[1.5rem] border border-white/70 bg-white p-5 shadow-panel">
          <p className="text-xs text-[#697586]">Interest Withdrawn</p>
          <p className="mt-2 text-3xl font-semibold">{currency(a.totalInterestPaid)}</p>
        </div>
        <div className="rounded-[1.5rem] border border-white/70 bg-white p-5 shadow-panel">
          <p className="text-xs text-[#697586]">Next Withdrawal</p>
          <p className="mt-2 text-2xl font-semibold text-amber-600">{a.canWithdrawInterest ? 'Available' : `${a.daysRemaining}d`}</p>
          <p className="mt-1 text-xs text-[#697586]">{a.nextWithdrawalDate || '—'}</p>
        </div>
      </div>

      {/* Withdraw hero */}
      <div className="rounded-[1.75rem] border border-white/70 bg-white p-6 shadow-panel">
        {hasPending ? (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex-1">
              <p className="font-semibold text-amber-700">Withdrawal Request Pending</p>
              <p className="text-sm text-[#697586] mt-0.5">Your request of {currency(data.requests.find((r: any) => r.status === 'Pending')?.amount || 0)} is under review.</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={showPendingReceipt} className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100">Show Receipt</button>
              <span className="rounded-full bg-amber-100 px-4 py-1.5 text-xs font-semibold text-amber-700">Under Review</span>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex-1">
                <p className="text-xs text-[#697586] mb-1">Interest available to withdraw</p>
                <p className="text-3xl font-bold text-green-700">{currency(a.availableInterest)}</p>
                <p className="text-sm text-[#697586] mt-1">
                  {a.canWithdrawInterest ? `${a.completedCycles} completed cycle${a.completedCycles !== 1 ? 's' : ''}` : `Available in ${a.daysRemaining} day${a.daysRemaining !== 1 ? 's' : ''}`}
                </p>
              </div>
              <button onClick={() => request('Interest')} disabled={busy || !a.canWithdrawInterest}
                className="rounded-2xl bg-green-700 px-7 py-3 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50 transition shrink-0">
                {busy ? 'Submitting…' : '↓ Withdraw Interest'}
              </button>
            </div>

            {principalAllowed && a.principal > 0 && (
              <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3 border-t border-black/5 pt-4">
                <label className="flex-1 w-full">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[#697586]">Withdraw Principal (max {currency(a.principal)})</span>
                  <input type="number" value={principalAmt} data-no-upper onChange={e => setPrincipalAmt(e.target.value)}
                    className="w-full rounded-2xl border border-[#e5e7eb] bg-[#f4f5f7] px-4 py-2.5 text-sm outline-none focus:border-[#1a1a2e] focus:bg-white" />
                </label>
                <button onClick={() => request('Principal')} disabled={busy || !principalAmt}
                  className="rounded-2xl border border-[#e5e7eb] px-5 py-2.5 text-sm font-semibold hover:bg-[#f4f5f7] disabled:opacity-50 transition shrink-0">
                  Request Principal Withdrawal
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Passbook */}
      <div className="overflow-hidden rounded-[1.75rem] border border-white/70 bg-white shadow-panel">
        <div className="border-b border-black/5 px-5 py-4"><p className="text-sm font-semibold">Passbook</p></div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-black/5 bg-[#fafafa] text-[#697586]">
            <tr>{['Date', 'Type', 'Amount', 'Note'].map(h => <th key={h} className="px-5 py-3 font-medium text-xs">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {data.ledger.length === 0 && <tr><td colSpan={4} className="px-5 py-8 text-center text-sm text-[#697586]">No transactions yet.</td></tr>}
            {data.ledger.map((t: any) => {
              const isIn = t.type === 'Deposit'
              return (
                <tr key={t.txnId} className="hover:bg-[#fafafa]">
                  <td className="px-5 py-3 text-[#697586]">{t.date}</td>
                  <td className="px-5 py-3 font-medium">{t.type}</td>
                  <td className={`px-5 py-3 font-semibold ${isIn ? 'text-green-700' : 'text-red-600'}`}>{isIn ? '+' : '−'} {currency(t.amount)}</td>
                  <td className="px-5 py-3 text-[#697586] text-xs">{t.notes || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
