'use client'
import { useCallback, useEffect, useState } from 'react'
import { Session } from '@/types'
import QRCode from 'qrcode'
import { formatINR, formatDateIN } from '@/lib/format'
import type { CommissionOverview, CommissionCycle } from '@/lib/commissionCycles'

// The guarantor's commission page. A cycle is 5 whole weeks, Monday to Sunday; each loan earns its commission in the week it was paid out.
// When a cycle ends the guarantor requests it once, and it is paid on the next working day (always a Monday). A paid cycle has a receipt.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const parts = (d: string) => ({ y: +d.slice(0, 4), m: +d.slice(5, 7) - 1, day: +d.slice(8, 10), w: new Date(`${d}T00:00:00Z`).getUTCDay() })
const range = (a: string, b: string) => { const x = parts(a), y = parts(b); return x.m === y.m ? `${x.day} – ${y.day} ${MONTHS[y.m]}` : `${x.day} ${MONTHS[x.m]} – ${y.day} ${MONTHS[y.m]}` }
const longDate = (d: string) => { const p = parts(d); return `${DAYS[p.w]}, ${p.day} ${FULL_MONTHS[p.m]}` }
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
const payInfo = (note: string) => { const m = /\((Cash|UPI|Bank Transfer)(?:, ref ([^)]+))?\)/.exec(note || ''); return { mode: m?.[1] || '', ref: m?.[2] || '' } }

type Data = { overview: CommissionOverview; guarantor: { name: string; code: string } }
type Payout = { payoutId: string; amount: number; status: string; notes?: string; rejectionReason?: string; requestedAt?: string }
type Qr = { payoutId: string; amount: number; dataUrl: string; from: string; to: string }

const CHIP: Record<string, string> = { running: 'bg-blue-100 text-blue-900', ready: 'bg-emerald-100 text-emerald-800', requested: 'bg-amber-100 text-amber-900', paid: 'bg-emerald-100 text-emerald-800' }
const CHIP_TEXT: Record<string, string> = { running: 'Running', ready: 'Finished', requested: 'Requested', paid: 'Paid' }

function Segments({ cycle, today }: { cycle: CommissionCycle; today: string }) {
  return (
    <div className="flex gap-1.5" role="img" aria-label={`${cycle.weeks.filter(w => w.end < today).length} of 5 weeks done`}>
      {cycle.weeks.map(w => <div key={w.start} className={`h-2.5 flex-1 rounded-full ${w.end < today ? 'bg-brand' : w.start <= today ? 'bg-brand/50' : 'bg-black/10'}`} />)}
    </div>
  )
}

function Weeks({ cycle, today }: { cycle: CommissionCycle; today: string }) {
  const max = Math.max(1, ...cycle.weeks.map(w => w.loans))
  return (
    <div>
      {cycle.weeks.map((w, i) => {
        const done = w.end < today, now = !done && w.start <= today
        return (
          <div key={w.start} className={`border-t border-black/5 px-4 py-3 ${now ? 'bg-brand/5' : ''}`}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm"><span className="font-bold">Week {i + 1}</span><span className="ml-2 text-xs text-soft">{range(w.start, w.end)}</span>{now && <span className="ml-2 rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold text-white">This week</span>}</p>
              {(done || now) ? <p className="text-base font-extrabold">{formatINR(w.amount)}</p> : <p className="text-xs text-soft">Not started</p>}
            </div>
            <div className="mt-2 flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/10"><div className="h-full rounded-full bg-brand transition-all" style={{ width: `${(done || now) && w.loans ? Math.max(6, (w.loans / max) * 100) : 0}%` }} /></div>
              <span className="w-24 text-right text-xs text-soft">{done || now ? `${w.loans} ${w.loans === 1 ? 'loan' : 'loans'}${now ? ' so far' : ''}` : ''}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function CommissionsPage({ session }: { session: Session }) {
  const [data, setData] = useState<Data | null>(null)
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [qr, setQr] = useState<Qr | null>(null)
  const [receipt, setReceipt] = useState<CommissionCycle | null>(null)

  const showToast = (msg: string, ok: boolean) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3500) }
  const load = useCallback(async () => {
    try {
      const headers = { Authorization: `Bearer ${session.token}` }
      const [s, p] = await Promise.all([fetch('/api/commissions/payout?summary=1', { headers }).then(r => r.json()), fetch('/api/commissions/payout', { headers }).then(r => r.json())])
      const failed = [s, p].find(r => !r || r.success === false)
      if (failed) throw new Error(failed?.error || 'Could not load commission')
      setData({ overview: s.data.overview, guarantor: s.data.guarantor }); setPayouts(p.data?.payouts || []); setLoadError(null)
    } catch (e) { setLoadError(e instanceof Error && e.message ? e.message : 'Could not load commission') }
    setLoading(false)
  }, [session.token])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  // The slip the office scans to record the payment
  async function openQr(c: CommissionCycle, payoutId: string) {
    const payload = JSON.stringify({ t: 'NGF_PAYOUT', pid: payoutId, gn: session.name, uid: session.userId, amt: c.amount, pf: c.start, pt: c.end, rd: data?.overview.today })
    const dataUrl = await QRCode.toDataURL(payload, { width: 220, margin: 2, color: { dark: '#1a1a2e', light: '#ffffff' } })
    setQr({ payoutId, amount: c.amount, dataUrl, from: c.start, to: c.end })
  }
  async function request(c: CommissionCycle) {
    setBusy(true)
    try {
      const res = await fetch('/api/commissions/payout', { method: 'POST', headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ cycleStart: c.start }) }).then(r => r.json())
      if (res?.success && res.data?.payoutId) { showToast('Payout requested', true); try { await openQr(c, res.data.payoutId) } catch { /* the slip can be opened again later */ } }
      else showToast(res?.error || 'Request failed', false)
      load()
    } catch (e) { showToast(e instanceof Error && e.message ? e.message : 'Request failed', false) }
    setBusy(false)
  }

  function printReceipt(c: CommissionCycle) {
    const info = payInfo(c.paidNote)
    const rows = c.weeks.map((w, i) => `<tr><td>Week ${i + 1} · ${esc(range(w.start, w.end))}</td><td class="r">${w.loans} loans · ${esc(formatINR(w.amount))}</td></tr>`).join('')
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Commission receipt ${esc(c.receiptNo)}</title><style>
*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',sans-serif;background:#f5f7fb;display:flex;justify-content:center;padding:24px;color:#14213d}
.card{background:#fff;border-radius:18px;padding:28px;width:420px;box-shadow:0 2px 14px rgba(0,0,0,.1)}
h1{font-size:20px;font-weight:800;letter-spacing:1px}.sub{font-size:12px;color:#5b6b82;margin-top:2px}
.amt{font-size:34px;font-weight:800;margin:16px 0 4px}.paid{display:inline-block;background:#d9f2e6;color:#0b5c3b;border-radius:99px;padding:3px 12px;font-size:12px;font-weight:700}
dl{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:16px 0;padding-top:14px;border-top:1px dashed #cbd5e1}dt{font-size:11px;color:#5b6b82}dd{font-size:13px;font-weight:700;margin-top:2px}
table{width:100%;border-collapse:collapse;font-size:12px}td{padding:8px 0;border-top:1px solid #eef1f6}td.r{text-align:right;font-weight:700}
.foot{margin-top:18px;text-align:center;font-size:11px;color:#8a97ad}@media print{body{background:#fff;padding:0}.card{box-shadow:none;width:100%}}
</style></head><body><div class="card"><h1>NGF FINCORP</h1><p class="sub">Commission payout receipt</p><p class="amt">${esc(formatINR(c.amount))}</p><span class="paid">Paid</span>
<dl><div><dt>Receipt number</dt><dd>${esc(c.receiptNo || '—')}</dd></div><div><dt>Paid on</dt><dd>${esc(c.paidAt ? formatDateIN(c.paidAt.slice(0, 10)) : '—')}</dd></div>
<div><dt>Guarantor</dt><dd>${esc(data?.guarantor.name)}${data?.guarantor.code ? ` (${esc(data.guarantor.code)})` : ''}</dd></div><div><dt>Paid by</dt><dd>${esc(info.mode || '—')}</dd></div>
<div><dt>Cycle</dt><dd>${esc(range(c.start, c.end))}</dd></div><div><dt>Reference</dt><dd>${esc(info.ref || '—')}</dd></div></dl>
<table>${rows}</table><p class="foot">${c.loans} loans in 5 weeks · NGF FINCORP</p></div></body></html>`
    const w = window.open('', '_blank', 'width=520,height=780')
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 600) }
  }
  async function share(c: CommissionCycle) {
    const text = `NGF FINCORP commission receipt ${c.receiptNo}: ${formatINR(c.amount)} for ${range(c.start, c.end)}`
    try { if (navigator.share) await navigator.share({ title: 'Commission receipt', text }); else { await navigator.clipboard.writeText(text); showToast('Receipt details copied', true) } } catch { /* cancelled */ }
  }

  if (loading && !data && !loadError) return <div className="flex h-40 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-ink border-t-transparent" /></div>
  if (!data) return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
      <span>{loadError || 'Could not load commission'}</span>
      <button onClick={load} className="rounded-2xl bg-red-600 px-4 py-1.5 text-xs font-semibold text-white">Retry</button>
    </div>
  )

  const o = data.overview, today = o.today
  const ready = o.ready
  const current = o.current
  const latest = payouts[0]
  const past = o.cycles.filter(c => c !== current)
  const pendingCycle = o.cycles.find(c => c.status === 'requested')
  const payoutOf = (c: CommissionCycle) => payouts.find(p => p.payoutId === c.payoutId)

  const payoutCard = (c: CommissionCycle) => (
    <section className="rounded-[1.75rem] bg-brand p-5 text-white shadow-[0_16px_36px_rgba(36,86,200,0.35)]">
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-white/20 leading-tight"><span className="text-[11px] font-semibold uppercase">{MONTHS[parts(c.payoutDate).m]}</span><span className="text-2xl font-extrabold">{parts(c.payoutDate).day}</span></div>
        <div className="min-w-0">
          <p className="text-sm text-white/85">{c.status === 'paid' ? 'Paid on' : c.status === 'running' ? 'Your payout date' : 'You will be paid'}</p>
          <p className="text-lg font-extrabold leading-snug">{c.status === 'paid' && c.paidAt ? longDate(c.paidAt.slice(0, 10)) : longDate(c.payoutDate)}</p>
          {c.status === 'running' && <p className="text-xs text-white/85">The day after your cycle ends</p>}
        </div>
      </div>
      {c.status === 'ready' && c.amount > 0 && <button onClick={() => request(c)} disabled={busy} className="mt-4 min-h-12 w-full rounded-2xl bg-white text-base font-extrabold text-brand disabled:opacity-60">{busy ? 'Requesting…' : `Request ${formatINR(c.amount)}`}</button>}
      {c.status === 'requested' && <button onClick={() => openQr(c, c.payoutId)} className="mt-4 min-h-12 w-full rounded-2xl bg-white/95 text-sm font-extrabold text-brand">Show my payout slip</button>}
      {c.status === 'paid' && <button onClick={() => setReceipt(c)} className="mt-4 min-h-12 w-full rounded-2xl bg-white text-sm font-extrabold text-brand">Open receipt</button>}
    </section>
  )

  const cycleHead = (c: CommissionCycle, label: string) => (
    <section className="rounded-[1.75rem] border border-white/70 bg-white p-5 shadow-panel">
      <div className="flex items-center justify-between">
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${CHIP[c.status]}`}>{label} · {CHIP_TEXT[c.status].toLowerCase()}</span>
        <span className="text-sm text-soft">{c.status === 'running' ? `Day ${c.dayOfCycle} of 35` : range(c.start, c.end)}</span>
      </div>
      <p className="mt-3 text-sm text-soft">{c.status === 'running' ? 'Earned so far' : 'You earned'}</p>
      <p className="text-5xl font-extrabold leading-tight tracking-tight">{formatINR(c.amount)}</p>
      <div className="mt-4"><Segments cycle={c} today={today} /></div>
      <p className="mt-2 text-sm text-soft">{c.status === 'running' ? `${range(c.start, c.end)} · ${c.daysLeft} ${c.daysLeft === 1 ? 'day' : 'days'} to go` : `${c.loans} loans in 5 weeks`}</p>
    </section>
  )

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {toast && <div className={`fixed left-4 right-4 top-4 z-50 rounded-2xl px-5 py-3 text-center text-sm font-medium text-white shadow-lg sm:left-auto sm:right-5 ${toast.ok ? 'bg-emerald-600' : 'bg-red-600'}`}>{toast.msg}</div>}
      {loadError && <div className="flex items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><span>{loadError}</span><button onClick={load} className="rounded-2xl bg-red-600 px-4 py-1.5 text-xs font-semibold text-white">Retry</button></div>}
      {latest?.status === 'Rejected' && !pendingCycle && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><b>Your last request was not accepted.</b> {latest.rejectionReason?.replace(/^Rejected by admin \S+:\s*/, '') || ''}</div>}

      {o.cycles.length === 0 ? (
        <section className="rounded-[1.75rem] border border-white/70 bg-white p-6 shadow-panel">
          <p className="text-lg font-extrabold">{o.startMonday ? `Your first cycle starts on ${longDate(o.startMonday)}` : 'Your first cycle starts with your first loan'}</p>
          <p className="mt-2 text-sm text-soft">A cycle is 5 weeks, Monday to Sunday. Every loan paid out in a week earns its commission in that week. When the cycle ends you request it, and you are paid the next working day.</p>
        </section>
      ) : (
        <>
          {ready && (<>{cycleHead(ready, `Cycle ${ready.index}`)}{payoutCard(ready)}<section className="overflow-hidden rounded-[1.75rem] border border-white/70 bg-white shadow-panel"><div className="px-4 pb-2 pt-4"><h2 className="text-base font-extrabold">Loans each week</h2></div><Weeks cycle={ready} today={today} /></section></>)}
          {current && (<>
            {ready && <h2 className="px-1 pt-2 text-sm font-semibold text-soft">Your next cycle</h2>}
            {cycleHead(current, `Cycle ${current.index}`)}
            {payoutCard(current)}
            <section className="overflow-hidden rounded-[1.75rem] border border-white/70 bg-white shadow-panel">
              <div className="px-4 pb-2 pt-4"><h2 className="text-base font-extrabold">Loans each week</h2><p className="text-xs text-soft">₹500 for every loan, counted in the week it was paid out</p></div>
              <Weeks cycle={current} today={today} />
            </section>
          </>)}
          {past.filter(c => c !== ready).length > 0 && (
            <section className="overflow-hidden rounded-[1.75rem] border border-white/70 bg-white shadow-panel">
              <div className="px-4 pb-2 pt-4"><h2 className="text-base font-extrabold">Past cycles</h2></div>
              {past.filter(c => c !== ready).map(c => (
                <div key={c.start} className="flex items-center gap-3 border-t border-black/5 px-4 py-3">
                  <div className="min-w-0 flex-1"><p className="text-sm font-bold">Cycle {c.index} · {range(c.start, c.end)}</p><p className="text-xs text-soft">{c.loans} loans · <span className={`rounded-full px-2 py-0.5 font-semibold ${CHIP[c.status]}`}>{CHIP_TEXT[c.status]}</span>{payoutOf(c)?.status === 'Pending' ? '' : ''}</p></div>
                  <p className="text-base font-extrabold">{formatINR(c.amount)}</p>
                  {c.status === 'paid' && <button onClick={() => setReceipt(c)} className="min-h-10 rounded-xl border border-brand/40 px-3 text-sm font-bold text-brand">Receipt</button>}
                  {c.status === 'requested' && <button onClick={() => openQr(c, c.payoutId)} className="min-h-10 rounded-xl border border-line px-3 text-sm font-bold">Slip</button>}
                </div>
              ))}
            </section>
          )}
        </>
      )}

      {/* Payout slip: the office scans this QR to record the payment */}
      {qr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setQr(null)}>
          <div className="w-full max-w-sm overflow-hidden rounded-[1.75rem] bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-black/5 px-5 py-4"><div><p className="font-semibold">Payout slip</p><p className="mt-0.5 font-mono text-xs text-soft">{qr.payoutId}</p></div><button onClick={() => setQr(null)} aria-label="Close" className="rounded-full p-2 hover:bg-mist">✕</button></div>
            <div className="space-y-3 px-5 py-4 text-center">
              <p className="text-xs uppercase tracking-wide text-soft">Cycle {range(qr.from, qr.to)}</p>
              <p className="text-3xl font-extrabold text-brand">{formatINR(qr.amount)}</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr.dataUrl} width={170} height={170} alt="Payout QR" className="mx-auto rounded-xl border border-line" />
              <p className="text-xs text-soft">Show this QR to the office to receive your payout.</p>
            </div>
          </div>
        </div>
      )}

      {/* Paid receipt */}
      {receipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setReceipt(null)}>
          <div className="max-h-[92vh] w-full max-w-sm overflow-y-auto rounded-[1.75rem] bg-white p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between"><p className="text-base font-extrabold">NGF FINCORP</p><span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">Paid</span></div>
            <p className="mt-4 text-sm text-soft">Commission paid</p>
            <p className="text-4xl font-extrabold tracking-tight">{formatINR(receipt.amount)}</p>
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-dashed border-black/15 pt-4 text-sm">
              <div><dt className="text-xs text-soft">Receipt number</dt><dd className="font-bold">{receipt.receiptNo || '—'}</dd></div>
              <div><dt className="text-xs text-soft">Paid on</dt><dd className="font-bold">{receipt.paidAt ? formatDateIN(receipt.paidAt.slice(0, 10)) : '—'}</dd></div>
              <div><dt className="text-xs text-soft">Guarantor</dt><dd className="font-bold">{data.guarantor.name}{data.guarantor.code ? ` (${data.guarantor.code})` : ''}</dd></div>
              <div><dt className="text-xs text-soft">Paid by</dt><dd className="font-bold">{payInfo(receipt.paidNote).mode || '—'}</dd></div>
              <div><dt className="text-xs text-soft">Cycle</dt><dd className="font-bold">{range(receipt.start, receipt.end)}</dd></div>
              <div><dt className="text-xs text-soft">Reference</dt><dd className="break-all font-bold">{payInfo(receipt.paidNote).ref || '—'}</dd></div>
            </dl>
            <div className="mt-4 rounded-2xl bg-mist px-3 py-1">
              {receipt.weeks.map((w, i) => <div key={w.start} className={`flex justify-between py-2 text-xs ${i ? 'border-t border-black/5' : ''}`}><span>Week {i + 1} · {range(w.start, w.end)}</span><span className="font-bold">{w.loans} loans · {formatINR(w.amount)}</span></div>)}
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={() => printReceipt(receipt)} className="min-h-12 flex-1 rounded-2xl bg-brand text-sm font-bold text-white">Download PDF</button>
              <button onClick={() => share(receipt)} className="min-h-12 flex-1 rounded-2xl border border-brand/40 bg-white text-sm font-bold text-brand">Share</button>
            </div>
            <button onClick={() => setReceipt(null)} className="mt-2 min-h-11 w-full rounded-2xl text-sm font-semibold text-soft">Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
