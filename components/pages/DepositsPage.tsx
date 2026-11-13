'use client'
import { useEffect, useState } from 'react'
import { Session } from '@/types'
import QRCode from 'qrcode'

function currency(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
function longDate(d?: string | null) { if (!d) return '—'; const t = new Date(`${d.slice(0, 10)}T00:00:00Z`); return `${DAYS[t.getUTCDay()]}, ${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]}` }
function shortDate(d?: string | null) { if (!d) return '—'; const t = new Date(`${d.slice(0, 10)}T00:00:00Z`); return `${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}` }

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
        showToast('Withdrawal requested', true)
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

  if (loading) return <div className="flex h-40 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-ink border-t-transparent" /></div>
  if (!data) return <p className="p-8 text-center text-sm text-soft">No deposit account found.</p>

  const a = data.account
  const pending = data.requests.find((r: any) => r.status === 'Pending')
  const principalAllowed = !!data.settings?.principalWithdrawEnabled
  // The ring fills as the 122-day cycle runs; it is full once interest can be withdrawn
  const cycleDays = a.cycleDays || 122
  const left = a.canWithdrawInterest ? 0 : Math.max(0, a.daysRemaining)
  const fill = a.principal > 0 ? Math.min(1, Math.max(0, (cycleDays - left) / cycleDays)) : 0
  const C = 2 * Math.PI * 35

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {toast && <div className={`fixed left-4 right-4 top-4 z-50 rounded-2xl px-5 py-3 text-center text-sm font-medium text-white shadow-lg sm:left-auto sm:right-5 ${toast.ok ? 'bg-emerald-600' : 'bg-red-600'}`}>{toast.msg}</div>}

      {/* Payout slip: show this QR to the office */}
      {receipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setReceipt(null)}>
          <div className="w-full max-w-sm overflow-hidden rounded-[1.75rem] bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-black/5 px-5 py-4">
              <div><p className="font-semibold">Withdrawal slip</p><p className="mt-0.5 font-mono text-xs text-soft">{receipt.requestId}</p></div>
              <button onClick={() => setReceipt(null)} aria-label="Close" className="rounded-full p-2 hover:bg-mist">✕</button>
            </div>
            <div className="space-y-3 px-5 py-4 text-center">
              <p className="text-xs uppercase tracking-wide text-soft">{receipt.type} withdrawal</p>
              <p className="text-3xl font-extrabold text-brand">{currency(receipt.amount)}</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={receipt.qrDataUrl} width={170} height={170} alt="QR" className="mx-auto rounded-xl border border-line" />
              <p className="text-xs text-soft">Show this QR to the office to receive your payout.</p>
              <p className="text-xs font-semibold text-amber-700">Waiting for the office to approve</p>
            </div>
          </div>
        </div>
      )}

      {/* Your deposit and the countdown to the next interest */}
      <section className="rounded-[1.75rem] border border-white/70 bg-white p-5 shadow-panel">
        <p className="text-sm text-soft">Your deposit</p>
        <p className="text-5xl font-extrabold leading-tight tracking-tight">{currency(a.principal)}</p>
        <p className="mt-1 text-sm text-soft">Earns {a.ratePerCycle}% every {cycleDays} days</p>
        <div className="mt-5 flex items-center gap-4">
          <div className="relative h-24 w-24 shrink-0" role="img" aria-label={a.canWithdrawInterest ? 'Interest is ready' : `${left} days left`}>
            <svg viewBox="0 0 84 84" className="h-24 w-24 -rotate-90" aria-hidden="true">
              <circle cx="42" cy="42" r="35" fill="none" stroke="rgba(20,33,61,0.10)" strokeWidth="9" />
              <circle cx="42" cy="42" r="35" fill="none" stroke="var(--brand)" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${C * fill} ${C}`} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center leading-tight">
              {a.canWithdrawInterest ? <span className="text-sm font-extrabold text-brand">Ready</span> : <><span className="text-2xl font-extrabold">{left}</span><span className="text-[11px] text-soft">days left</span></>}
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-sm text-soft">{a.canWithdrawInterest ? 'Interest you can withdraw' : 'Next interest'}</p>
            <p className="text-3xl font-extrabold">{currency(a.canWithdrawInterest ? a.availableInterest : a.interestPerCycle)}</p>
            <p className="mt-0.5 text-sm text-soft">{a.canWithdrawInterest ? `${a.completedCycles} finished ${a.completedCycles === 1 ? 'cycle' : 'cycles'}` : `Ready on ${longDate(a.nextWithdrawalDate)}`}</p>
          </div>
        </div>
      </section>

      {/* Withdraw */}
      <section className="space-y-3 rounded-[1.75rem] border border-white/70 bg-white p-5 shadow-panel">
        {pending ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1"><p className="font-bold text-amber-800">Withdrawal requested</p><p className="text-sm text-soft">{currency(pending.amount)} is waiting for the office to approve.</p></div>
            <button onClick={showPendingReceipt} className="min-h-11 rounded-2xl border border-amber-300 bg-amber-50 px-4 text-sm font-bold text-amber-800">Show my slip</button>
          </div>
        ) : (
          <button onClick={() => request('Interest')} disabled={busy || !a.canWithdrawInterest}
            className="min-h-12 w-full rounded-2xl bg-brand text-base font-extrabold text-white disabled:opacity-45">
            {busy ? 'Requesting…' : a.canWithdrawInterest ? `Withdraw ${currency(a.availableInterest)} interest` : `Withdraw interest · in ${left} ${left === 1 ? 'day' : 'days'}`}
          </button>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white/85 px-4 py-3"><p className="text-xs text-soft">Interest already taken</p><p className="text-xl font-extrabold">{currency(a.totalInterestPaid)}</p></div>
          <div className="rounded-2xl bg-white/85 px-4 py-3"><p className="text-xs text-soft">Cycles finished</p><p className="text-xl font-extrabold">{a.completedCycles}</p></div>
        </div>
        {principalAllowed && a.principal > 0 && !pending && (
          <div className="flex flex-col gap-3 border-t border-black/5 pt-4 sm:flex-row sm:items-end">
            <label className="w-full flex-1"><span className="mb-1 block text-xs text-soft">Withdraw some of your deposit (up to {currency(a.principal)})</span>
              <input type="number" inputMode="numeric" value={principalAmt} data-no-upper onChange={e => setPrincipalAmt(e.target.value)} className="min-h-12 w-full rounded-2xl border border-line bg-white px-4 text-base outline-none focus:border-brand" />
            </label>
            <button onClick={() => request('Principal')} disabled={busy || !principalAmt} className="min-h-12 shrink-0 rounded-2xl border border-brand/40 bg-white px-5 text-sm font-bold text-brand disabled:opacity-50">Request withdrawal</button>
          </div>
        )}
      </section>

      {/* Passbook */}
      <section className="overflow-hidden rounded-[1.75rem] border border-white/70 bg-white shadow-panel">
        <div className="px-5 pb-2 pt-4"><h2 className="text-base font-extrabold">Passbook</h2></div>
        {data.ledger.length === 0 && <p className="border-t border-black/5 px-5 py-8 text-center text-sm text-soft">No entries yet. Deposits and interest will show here.</p>}
        {data.ledger.map((t: any) => {
          const isIn = t.type === 'Deposit'
          const label = t.type === 'Interest Payout' ? 'Interest paid' : t.type === 'Principal Withdrawal' ? 'Deposit withdrawn' : 'Deposit'
          return (
            <div key={t.txnId} className="flex items-center gap-3 border-t border-black/5 px-5 py-3">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg font-extrabold ${isIn ? 'bg-blue-100 text-blue-900' : 'bg-red-100 text-red-800'}`}>{isIn ? '+' : '−'}</span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{label}</span><span className="block text-xs text-soft">{shortDate(t.date)}{t.notes ? ` · ${t.notes}` : ''}</span></span>
              <span className={`text-base font-extrabold ${isIn ? 'text-blue-900' : 'text-red-800'}`}>{currency(t.amount)}</span>
            </div>
          )
        })}
      </section>
    </div>
  )
}
