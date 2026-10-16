'use client'
import { useEffect, useState } from 'react'
import { Session } from '@/types'
import QRCode from 'qrcode'

function currency(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

function daysBetween(a: string, b: Date) {
  return Math.floor((b.getTime() - new Date(a + 'T00:00:00Z').getTime()) / (1000 * 60 * 60 * 24))
}

function addDays(dateStr: string, d: number) {
  const dt = new Date(dateStr + 'T00:00:00Z')
  dt.setUTCDate(dt.getUTCDate() + d)
  return dt.toISOString().slice(0, 10)
}

const CYCLE_DAYS = 35

type Cycle = { start: string; end: string; loans: any[]; cycleIdx: number }

function buildCycles(loans: any[]): Cycle[] {
  const sorted = [...loans].filter(l => l.startDate).sort((a, b) => a.startDate.localeCompare(b.startDate))
  const cycles: Cycle[] = []
  let remaining = [...sorted]
  while (remaining.length > 0) {
    const start = remaining[0].startDate
    const end = addDays(start, CYCLE_DAYS)
    const inCycle = remaining.filter(l => l.startDate < end)
    remaining = remaining.filter(l => l.startDate >= end)
    cycles.push({ start, end, loans: inCycle, cycleIdx: cycles.length })
  }
  return cycles
}

export default function CommissionsPage({ session }: { session: Session }) {
  const [loans, setLoans] = useState<any[]>([])
  const [payouts, setPayouts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [requesting, setRequesting] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [receipt, setReceipt] = useState<{ payoutId: string; qrDataUrl: string; amount: number; periodFrom: string; periodTo: string; loans: any[] } | null>(null)
  const [dismissedRejected, setDismissedRejected] = useState(false)

  // Persist dismissal across reloads using localStorage keyed by latest rejected payout ID
  const dismissedKey = `payout_dismissed_${payouts[0]?.payoutId || 'none'}`

  const load = () => {
    setLoading(true)
    Promise.all([
      fetch('/api/loans?filter=all', { headers: { Authorization: `Bearer ${session.token}` } }).then(r => r.json()),
      fetch('/api/commissions/payout', { headers: { Authorization: `Bearer ${session.token}` } }).then(r => r.json()),
    ]).then(([loansRes, payoutsRes]) => {
      setLoans(loansRes.data?.loans || [])
      setPayouts(payoutsRes.data?.payouts || [])
      // Restore dismissal state from localStorage
      const latestId = payoutsRes.data?.payouts?.[0]?.payoutId
      if (latestId) {
        const saved = localStorage.getItem(`payout_dismissed_${latestId}`)
        setDismissedRejected(saved === 'true')
      }
    }).finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  // ── Computations (safe on empty arrays during loading) ──
  const todayStr = new Date().toISOString().slice(0, 10)
  const totalEarned = loans.reduce((s, l) => s + Number(l.guarantorCommission || 0), 0)
  const totalPaidOut = payouts.filter(p => p.status === 'Paid').reduce((s, p) => s + p.amount, 0)
  const hasPending = payouts.some(p => p.status === 'Pending')
  // Only block if the LATEST request is rejected (allow re-request after rejection)
  const latestPayout = payouts.length > 0 ? payouts[0] : null
  const latestRejected = latestPayout?.status === 'Rejected'
  const hasRejected = latestRejected // for display in rejected UI

  const cycles = buildCycles(loans)
  const pastCycles = cycles.filter(c => c.end <= todayStr)
  const currentCycle = cycles.find(c => c.start <= todayStr && c.end > todayStr) ?? null
  const daysUntilPayout = currentCycle ? daysBetween(todayStr, new Date(currentCycle.end + 'T00:00:00Z')) : 0

  const loanCycleMap = new Map<string, { past: boolean; cycleIdx: number }>()
  cycles.forEach(c => {
    const isPast = c.end <= todayStr
    c.loans.forEach(l => loanCycleMap.set(l.loanId, { past: isPast, cycleIdx: c.cycleIdx }))
  })
  const enriched = loans.map(l => {
    const info = loanCycleMap.get(l.loanId)
    return { ...l, inCurrentCycle: !info?.past, cycleIdx: info?.cycleIdx ?? 0 }
  })

  const eligibleCommission = pastCycles.reduce((s, c) => s + c.loans.reduce((cs, l) => cs + Number(l.guarantorCommission || 0), 0), 0)
  const lockedCommission = currentCycle ? currentCycle.loans.reduce((s, l) => s + Number(l.guarantorCommission || 0), 0) : 0
  const availableAmount = Math.max(0, eligibleCommission - totalPaidOut)
  // Can request payout if: has completed cycles, available amount > 0, no pending request
  // (Allow re-request after rejection since latestRejected check handles it)
  const canRequestPayout = pastCycles.length > 0 && availableAmount > 0 && !hasPending

  // ── Receipt generator ──
  const buildReceiptHtml = (payoutId: string, qrDataUrl: string, amount: number, periodFrom: string, periodTo: string, eligibleLoans: any[]) => {
    const loanRows = eligibleLoans.map(l =>
      `<tr><td>${l.customerName}</td><td class="mono">${l.loanId.slice(-9)}</td><td class="amt">+₹${Number(l.guarantorCommission || 0).toLocaleString('en-IN')}</td></tr>`
    ).join('')
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Payout Receipt – ${payoutId}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',sans-serif;background:#f5f5f5;display:flex;justify-content:center;padding:24px}
.card{background:#fff;border-radius:16px;padding:28px;width:400px;box-shadow:0 2px 12px rgba(0,0,0,.1)}
.header{text-align:center;border-bottom:2px solid #1a1a2e;padding-bottom:14px;margin-bottom:16px}
.header h1{font-size:22px;font-weight:800;color:#1a1a2e;letter-spacing:1px}
.header .sub{font-size:11px;color:#697586;margin-top:2px}
.header .pid{display:inline-block;background:#f4f5f7;border-radius:20px;padding:3px 12px;font-size:10px;font-weight:700;color:#1a1a2e;margin-top:8px;font-family:monospace}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px}
.mi label{font-size:9.5px;color:#697586;font-weight:700;text-transform:uppercase;letter-spacing:.5px;display:block}
.mi span{font-size:12px;font-weight:700;display:block;margin-top:2px}
table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:8px}
thead tr{background:#f4f5f7}
th{padding:6px 8px;text-align:left;font-size:9.5px;color:#697586;font-weight:700;text-transform:uppercase;letter-spacing:.4px}
td{padding:7px 8px;border-bottom:1px solid #f0f0f0}
td.amt{text-align:right;font-weight:700;color:#15803d}
td.mono{font-family:monospace;font-size:10px;color:#697586}
.total{display:flex;justify-content:space-between;align-items:center;background:#f0fdf4;border-radius:10px;padding:12px 14px;font-weight:800;font-size:15px;color:#15803d;margin:10px 0 18px}
.qr{text-align:center;padding:10px 0}
.qr img{border-radius:10px;border:1px solid #e5e7eb}
.qr-label{font-size:10px;color:#697586;margin-top:6px}
.footer{text-align:center;font-size:10px;color:#9ca3af;border-top:1px solid #f0f0f0;padding-top:12px;margin-top:12px;line-height:1.6}
@media print{body{background:#fff;padding:0}.card{box-shadow:none;border-radius:0;width:100%}}
</style></head><body>
<div class="card">
  <div class="header">
    <h1>NGF FINCORP</h1>
    <p class="sub">Commission Payout Receipt</p>
    <div class="pid">${payoutId}</div>
  </div>
  <div class="meta">
    <div class="mi"><label>Guarantor</label><span>${session.name}</span></div>
    <div class="mi"><label>Requested On</label><span>${todayStr}</span></div>
    <div class="mi"><label>Period From</label><span>${periodFrom}</span></div>
    <div class="mi"><label>Pay Day</label><span>${periodTo}</span></div>
  </div>
  <table>
    <thead><tr><th>Customer</th><th>Loan</th><th style="text-align:right">Commission</th></tr></thead>
    <tbody>${loanRows || '<tr><td colspan="3" style="text-align:center;color:#697586;padding:12px">No eligible loans</td></tr>'}</tbody>
  </table>
  <div class="total"><span>Total Payout Amount</span><span>₹${amount.toLocaleString('en-IN')}</span></div>
  <div class="qr">
    <img src="${qrDataUrl}" width="190" height="190" alt="Payout QR" />
    <p class="qr-label">Admin scans this QR to record payment</p>
  </div>
  <div class="footer">NGF FINCORP · Status: Pending Admin Approval<br/>Generated on ${todayStr}</div>
</div>
</body></html>`
  }

  const generateReceipt = async (payoutId: string) => {
    const eligibleLoans = enriched.filter(l => !l.inCurrentCycle)
    const periodFrom = pastCycles[0]?.start ?? todayStr
    const periodTo = pastCycles[pastCycles.length - 1]?.end ?? todayStr
    const qrPayload = JSON.stringify({ t: 'NGF_PAYOUT', pid: payoutId, gn: session.name, uid: session.userId, amt: availableAmount, pf: periodFrom, pt: periodTo, rd: todayStr })
    const qrDataUrl = await QRCode.toDataURL(qrPayload, { width: 220, margin: 2, color: { dark: '#1a1a2e', light: '#ffffff' } })
    setReceipt({ payoutId, qrDataUrl, amount: availableAmount, periodFrom, periodTo, loans: eligibleLoans })
  }

  const showPendingReceipt = async () => {
    const pending = payouts.find(p => p.status === 'Pending')
    if (!pending) return
    const eligibleLoans = enriched.filter(l => !l.inCurrentCycle)
    const periodFrom = pastCycles[0]?.start ?? todayStr
    const periodTo = pastCycles[pastCycles.length - 1]?.end ?? todayStr
    const qrPayload = JSON.stringify({ t: 'NGF_PAYOUT', pid: pending.payoutId, gn: session.name, uid: session.userId, amt: pending.amount, pf: periodFrom, pt: periodTo, rd: pending.requestedAt?.slice(0, 10) ?? todayStr })
    const qrDataUrl = await QRCode.toDataURL(qrPayload, { width: 220, margin: 2, color: { dark: '#1a1a2e', light: '#ffffff' } })
    setReceipt({ payoutId: pending.payoutId, qrDataUrl, amount: pending.amount, periodFrom, periodTo, loans: eligibleLoans })
  }

  const downloadReceipt = () => {
    if (!receipt) return
    const html = buildReceiptHtml(receipt.payoutId, receipt.qrDataUrl, receipt.amount, receipt.periodFrom, receipt.periodTo, receipt.loans)
    const w = window.open('', '_blank', 'width=500,height=760')
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 600) }
  }

  // ── Handlers ──
  const handleRequest = async () => {
    setRequesting(true)
    try {
      const res = await fetch('/api/commissions/payout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: availableAmount }),
      }).then(r => r.json())
      if (res.success) {
        showToast('Payout request submitted!', true)
        await generateReceipt(res.data.payoutId)
        load()
      } else {
        showToast(res.error || 'Request failed', false)
      }
    } finally {
      setRequesting(false)
    }
  }

  if (loading) return (
    <div className="flex h-40 items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#1a1a2e] border-t-transparent" />
    </div>
  )

  return (
    <div className="space-y-5">
      {toast && (
        <div className={`fixed top-5 right-5 z-50 rounded-2xl px-5 py-3 text-sm font-medium text-white shadow-lg ${toast.ok ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      {/* Receipt modal */}
      {receipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setReceipt(null)}>
          <div className="w-full max-w-sm rounded-[1.75rem] bg-white shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-black/5">
              <div>
                <p className="font-semibold">Payout Receipt</p>
                <p className="text-xs font-mono text-[#697586] mt-0.5">{receipt.payoutId}</p>
              </div>
              <button onClick={() => setReceipt(null)} className="rounded-full p-1.5 hover:bg-[#f4f5f7] transition">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Receipt body */}
            <div className="px-5 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div><p className="text-[#697586] font-medium uppercase tracking-wide text-[9px]">Guarantor</p><p className="font-semibold mt-0.5">{session.name}</p></div>
                <div><p className="text-[#697586] font-medium uppercase tracking-wide text-[9px]">Amount</p><p className="font-bold text-green-700 mt-0.5 text-base">{currency(receipt.amount)}</p></div>
                <div><p className="text-[#697586] font-medium uppercase tracking-wide text-[9px]">Period From</p><p className="font-semibold mt-0.5">{receipt.periodFrom}</p></div>
                <div><p className="text-[#697586] font-medium uppercase tracking-wide text-[9px]">Pay Day</p><p className="font-semibold mt-0.5">{receipt.periodTo}</p></div>
              </div>

              {/* Loan breakdown */}
              <div className="rounded-2xl bg-[#f4f5f7] divide-y divide-black/5 overflow-hidden">
                {receipt.loans.map(l => (
                  <div key={l.loanId} className="flex justify-between items-center px-3 py-2 text-xs">
                    <span className="font-medium">{l.customerName}</span>
                    <span className="font-semibold text-green-700">+{currency(Number(l.guarantorCommission || 0))}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center px-3 py-2 text-xs font-bold bg-green-50">
                  <span>Total</span>
                  <span className="text-green-700">{currency(receipt.amount)}</span>
                </div>
              </div>

              {/* QR code */}
              <div className="flex flex-col items-center py-2">
                <img src={receipt.qrDataUrl} width={160} height={160} alt="Payout QR" className="rounded-xl border border-[#e5e7eb]" />
                <p className="text-[10px] text-[#697586] mt-2 text-center">Admin scans this QR to record payment</p>
              </div>

              <p className="text-center text-[10px] text-[#697586]">Status: Pending Admin Approval</p>
            </div>

            {/* Modal footer */}
            <div className="flex gap-3 px-5 py-4 border-t border-black/5">
              <button onClick={downloadReceipt}
                className="flex-1 rounded-2xl bg-[#1a1a2e] py-2.5 text-sm font-semibold text-white hover:bg-[#2d2d4e] transition">
                Download / Print
              </button>
              <button onClick={() => setReceipt(null)}
                className="rounded-2xl border border-[#e5e7eb] px-5 py-2.5 text-sm font-semibold hover:bg-[#f4f5f7] transition">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-[#697586]">Commission Overview</p>
        <button onClick={load} className="flex items-center gap-1.5 rounded-2xl border border-[#e5e7eb] bg-white px-4 py-1.5 text-xs font-semibold text-[#697586] hover:bg-[#f4f5f7] transition">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-[1.5rem] border border-white/70 bg-white p-5 shadow-panel">
          <p className="text-xs text-[#697586]">Total Earned</p>
          <p className="mt-2 text-3xl font-semibold">{currency(totalEarned)}</p>
          <p className="mt-1 text-xs text-[#697586]">Across {loans.length} loan{loans.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="rounded-[1.5rem] border border-white/70 bg-white p-5 shadow-panel">
          <p className="text-xs text-[#697586]">Available for Payout</p>
          <p className={`mt-2 text-3xl font-semibold ${availableAmount > 0 ? 'text-green-700' : ''}`}>{currency(availableAmount)}</p>
          <p className="mt-1 text-xs text-[#697586]">{pastCycles.length} completed cycle{pastCycles.length !== 1 ? 's' : ''} · {CYCLE_DAYS}-day windows</p>
        </div>
        <div className="rounded-[1.5rem] border border-white/70 bg-white p-5 shadow-panel">
          <p className="text-xs text-[#697586]">This Cycle (Locked)</p>
          <p className="mt-2 text-3xl font-semibold text-amber-600">{currency(lockedCommission)}</p>
          <p className="mt-1 text-xs text-[#697586]">
            {currentCycle ? `Pays out in ${daysUntilPayout} day${daysUntilPayout !== 1 ? 's' : ''}` : 'No active cycle'}
          </p>
        </div>
      </div>

      {/* Payout Hero */}
      <div className="rounded-[1.75rem] border border-white/70 bg-white p-6 shadow-panel">
        {hasPending ? (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-100">
              <svg className="h-6 w-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-semibold text-amber-700">Payout Request Pending</p>
              <p className="text-sm text-[#697586] mt-0.5">
                Your request of {currency(payouts.find(p => p.status === 'Pending')?.amount || 0)} is under review. You will be notified once processed.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={showPendingReceipt}
                className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 transition">
                Show Receipt
              </button>
              <span className="rounded-full bg-amber-100 px-4 py-1.5 text-xs font-semibold text-amber-700">Under Review</span>
            </div>
          </div>
        ) : (hasRejected && !dismissedRejected) ? (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-red-100">
              <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-semibold text-red-700">Payout Request Rejected</p>
              <p className="text-sm text-[#697586] mt-0.5">
                {latestPayout?.notes ? latestPayout.notes : 'Your payout request was rejected.'}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  setDismissedRejected(true)
                  if (latestPayout?.payoutId) {
                    localStorage.setItem(`payout_dismissed_${latestPayout.payoutId}`, 'true')
                  }
                }}
                className="rounded-2xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
              >
                Go Back
              </button>
            </div>
          </div>
        ) : canRequestPayout ? (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex-1">
              <p className="text-xs text-[#697586] mb-1">Withdraw Amount</p>
              <p className="text-3xl font-bold text-green-700">{currency(availableAmount)}</p>
              <p className="text-sm text-[#697586] mt-1">
                From {enriched.filter(l => !l.inCurrentCycle).length} loan{enriched.filter(l => !l.inCurrentCycle).length !== 1 ? 's' : ''} · {pastCycles.length} completed cycle{pastCycles.length !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              onClick={handleRequest}
              disabled={requesting}
              className="rounded-2xl bg-green-700 px-7 py-3 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-60 transition-colors shrink-0"
            >
              {requesting ? 'Submitting…' : '↓ Request Payout'}
            </button>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div>
              <p className="font-semibold">No payout available yet</p>
              <p className="text-sm text-[#697586] mt-0.5">
                {currentCycle
                  ? `Current cycle pays out in ${daysUntilPayout} day${daysUntilPayout !== 1 ? 's' : ''} — ${CYCLE_DAYS}-day window`
                  : loans.length === 0
                    ? 'No commissions recorded yet'
                    : 'All eligible commissions already paid out'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Commission Ledger */}
      <div className="overflow-hidden rounded-[1.75rem] border border-white/70 bg-white shadow-panel">
        <div className="border-b border-black/5 px-5 py-4">
          <p className="text-sm font-semibold">Commission Ledger</p>
          <p className="text-xs text-[#697586] mt-0.5">
            {currentCycle
              ? `Cycle ${currentCycle.cycleIdx + 1} · started ${currentCycle.start} · pays out in ${daysUntilPayout}d`
              : `${CYCLE_DAYS}-day pay window`}
          </p>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-black/5 bg-[#fafafa] text-[#697586]">
            <tr>
              {['Customer', 'Loan ID', 'Commission', 'Loan Status', 'Start Date', 'Cycle'].map(h => (
                <th key={h} className="px-5 py-3 font-medium text-xs">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {enriched.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-[#697586]">No commissions recorded yet.</td></tr>
            )}
            {enriched.map(l => (
              <tr key={l.loanId} className="hover:bg-[#fafafa]">
                <td className="px-5 py-3 font-medium">{l.customerName}</td>
                <td className="px-5 py-3 font-mono text-xs text-[#697586]">{l.loanId?.slice(-9)}</td>
                <td className="px-5 py-3 font-semibold text-green-700">{currency(Number(l.guarantorCommission || 0))}</td>
                <td className="px-5 py-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${l.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-[#f4f5f7] text-[#697586]'}`}>
                    {l.status}
                  </span>
                </td>
                <td className="px-5 py-3 text-[#697586] text-xs">{l.startDate}</td>
                <td className="px-5 py-3">
                  {l.inCurrentCycle ? (
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">This cycle</span>
                  ) : (
                    <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">Eligible</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Payout History */}
      {payouts.length > 0 && (
        <div className="overflow-hidden rounded-[1.75rem] border border-white/70 bg-white shadow-panel">
          <div className="border-b border-black/5 px-5 py-4">
            <p className="text-sm font-semibold">Payout History</p>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-black/5 bg-[#fafafa] text-[#697586]">
              <tr>
                {['Request ID', 'Amount', 'Status', 'Requested On', 'Processed On'].map(h => (
                  <th key={h} className="px-5 py-3 font-medium text-xs">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {payouts.map(p => (
                <tr key={p.payoutId} className="hover:bg-[#fafafa]">
                  <td className="px-5 py-3 font-mono text-xs text-[#697586]">{p.payoutId}</td>
                  <td className="px-5 py-3 font-semibold">{currency(p.amount)}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      p.status === 'Paid' ? 'bg-green-100 text-green-700'
                      : p.status === 'Pending' ? 'bg-amber-100 text-amber-700'
                      : 'bg-red-100 text-red-700'
                    }`}>{p.status}</span>
                  </td>
                  <td className="px-5 py-3 text-[#697586]">{p.requestedAt?.slice(0, 10)}</td>
                  <td className="px-5 py-3 text-[#697586]">{p.processedAt ? p.processedAt.slice(0, 10) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
