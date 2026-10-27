'use client'
import { useEffect, useRef, useState } from 'react'
import { Session } from '@/types'
import QRCode from 'qrcode'

import { formatINR, formatINRShort, formatDateIN } from '@/lib/format'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function monthLabel(ym: string) {
  const [y, m] = ym.split('-')
  return `${MONTHS[Number(m) - 1] ?? m} ${y}`
}
function dayDiff(from: string, to: string) {
  return Math.round((new Date(to + 'T00:00:00Z').getTime() - new Date(from + 'T00:00:00Z').getTime()) / 86400000)
}

type Loan = { loanId: string; customerName?: string; guarantorCommission?: string | number; status?: string; startDate?: string }
type Payout = { payoutId: string; amount: number; status: string; requestedAt?: string; processedAt?: string; notes?: string; rejectionReason?: string }
type SummaryCycle = { start: string; end: string; amount: number; past: boolean }
type Summary = { earned: number; eligible: number; locked: number; paid: number; pending: number; available: number; todayIST: string; nextPayoutDate: string | null; cycles: SummaryCycle[] }
type Row = Loan & { inCurrentCycle: boolean; cycleIdx: number }
type ReceiptData = { payoutId: string; qrDataUrl: string; amount: number; periodFrom: string; periodTo: string; loans: Row[] }

export default function CommissionsPage({ session }: { session: Session }) {
  const [loans, setLoans] = useState<Loan[]>([])
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [requesting, setRequesting] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [receipt, setReceipt] = useState<ReceiptData | null>(null)
  const [dismissedRejected, setDismissedRejected] = useState(false)
  const [monthFilter, setMonthFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const loadedOnce = useRef(false)

  const load = async () => {
    if (loadedOnce.current) setRefreshing(true)
    else setLoading(true)
    try {
      const headers = { Authorization: `Bearer ${session.token}` }
      const [loansRes, payoutsRes, sumRes] = await Promise.all([
        fetch('/api/loans?filter=all', { headers }).then(r => r.json()),
        fetch('/api/commissions/payout', { headers }).then(r => r.json()),
        fetch('/api/commissions/payout?summary=1', { headers }).then(r => r.json()),
      ])
      const failed = [loansRes, payoutsRes, sumRes].find(r => !r || r.success === false)
      if (failed) throw new Error(failed?.error || 'Could not load commissions')
      const pl: Payout[] = payoutsRes.data?.payouts || []
      setLoans(loansRes.data?.loans || [])
      setPayouts(pl)
      setSummary(sumRes.data as Summary)
      setLoadError(null)
      loadedOnce.current = true
      const latestId = pl[0]?.payoutId
      if (latestId) {
        try { setDismissedRejected(localStorage.getItem(`payout_dismissed_${latestId}`) === 'true') } catch { setDismissedRejected(false) }
      }
    } catch (e) {
      setLoadError(e instanceof Error && e.message ? e.message : 'Could not load commissions')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    load()
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  // ── Derived from server summary ──
  const todayStr = summary?.todayIST ?? ''
  const cycles = summary?.cycles ?? []
  const pastCycles = cycles.filter(c => c.past)
  const currentCycle = cycles.find(c => !c.past) ?? null
  const currentCycleIdx = currentCycle ? cycles.indexOf(currentCycle) : -1
  const nextPayout = summary?.nextPayoutDate ?? currentCycle?.end ?? null
  const daysUntilPayout = nextPayout && todayStr ? Math.max(0, dayDiff(todayStr, nextPayout)) : 0
  const totalEarned = summary?.earned ?? 0
  const lockedCommission = summary?.locked ?? 0
  const availableAmount = summary?.available ?? 0
  const pendingAmount = summary?.pending ?? 0

  const pendingPayout = payouts.find(p => p.status === 'Pending')
  const hasPending = !!pendingPayout
  const latestPayout = payouts.length > 0 ? payouts[0] : null
  const hasRejected = latestPayout?.status === 'Rejected'
  const canRequestPayout = pastCycles.length > 0 && availableAmount > 0 && !hasPending

  const enriched: Row[] = loans.map(l => {
    const idx = l.startDate ? cycles.findIndex(c => l.startDate! >= c.start && l.startDate! < c.end) : -1
    const past = idx >= 0 ? cycles[idx].past : false
    return { ...l, inCurrentCycle: !past, cycleIdx: idx >= 0 ? idx : 0 }
  })
  const eligibleRows = enriched.filter(l => !l.inCurrentCycle)

  const months = Array.from(new Set(enriched.map(l => (l.startDate || '').slice(0, 7)).filter(Boolean))).sort().reverse()
  const visibleRows = enriched.filter(l =>
    (monthFilter === 'all' || (l.startDate || '').startsWith(monthFilter)) &&
    (statusFilter === 'all' || (statusFilter === 'eligible' ? !l.inCurrentCycle : l.inCurrentCycle))
  )
  const visibleTotal = visibleRows.reduce((s, l) => s + Number(l.guarantorCommission || 0), 0)

  // ── Receipt generator ──
  const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
  const buildReceiptHtml = (payoutId: string, qrDataUrl: string, amount: number, periodFrom: string, periodTo: string, eligibleLoans: Row[]) => {
    const loanRows = eligibleLoans.map(l =>
      `<tr><td>${esc(l.customerName)}</td><td class="mono">${esc(String(l.loanId).slice(-9))}</td><td class="amt">+${esc(formatINR(Number(l.guarantorCommission || 0)))}</td></tr>`
    ).join('')
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Payout Receipt – ${esc(payoutId)}</title>
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
    <div class="pid">${esc(payoutId)}</div>
  </div>
  <div class="meta">
    <div class="mi"><label>Guarantor</label><span>${esc(session.name)}</span></div>
    <div class="mi"><label>Requested On</label><span>${esc(formatDateIN(todayStr))}</span></div>
    <div class="mi"><label>Period From</label><span>${esc(formatDateIN(periodFrom))}</span></div>
    <div class="mi"><label>Payout date</label><span>${esc(formatDateIN(periodTo))}</span></div>
  </div>
  <table>
    <thead><tr><th>Customer</th><th>Loan</th><th style="text-align:right">Commission</th></tr></thead>
    <tbody>${loanRows || '<tr><td colspan="3" style="text-align:center;color:#697586;padding:12px">No eligible loans</td></tr>'}</tbody>
  </table>
  <div class="total"><span>Total Payout Amount</span><span>${esc(formatINR(amount))}</span></div>
  <div class="qr">
    <img src="${qrDataUrl}" width="190" height="190" alt="Payout QR" />
    <p class="qr-label">Admin scans this QR to record payment</p>
  </div>
  <div class="footer">NGF FINCORP · Status: Pending Admin Approval<br/>Generated on ${esc(formatDateIN(todayStr))}</div>
</div>
</body></html>`
  }

  const generateReceipt = async (payoutId: string) => {
    const eligibleLoans = eligibleRows
    const periodFrom = pastCycles[0]?.start ?? todayStr
    const periodTo = pastCycles[pastCycles.length - 1]?.end ?? todayStr
    const qrPayload = JSON.stringify({ t: 'NGF_PAYOUT', pid: payoutId, gn: session.name, uid: session.userId, amt: availableAmount, pf: periodFrom, pt: periodTo, rd: todayStr })
    const qrDataUrl = await QRCode.toDataURL(qrPayload, { width: 220, margin: 2, color: { dark: '#1a1a2e', light: '#ffffff' } })
    setReceipt({ payoutId, qrDataUrl, amount: availableAmount, periodFrom, periodTo, loans: eligibleLoans })
  }

  const showPendingReceipt = async () => {
   try {
    const pending = pendingPayout
    if (!pending) return
    const eligibleLoans = eligibleRows
    const periodFrom = pastCycles[0]?.start ?? todayStr
    const periodTo = pastCycles[pastCycles.length - 1]?.end ?? todayStr
    const qrPayload = JSON.stringify({ t: 'NGF_PAYOUT', pid: pending.payoutId, gn: session.name, uid: session.userId, amt: pending.amount, pf: periodFrom, pt: periodTo, rd: pending.requestedAt?.slice(0, 10) ?? todayStr })
    const qrDataUrl = await QRCode.toDataURL(qrPayload, { width: 220, margin: 2, color: { dark: '#1a1a2e', light: '#ffffff' } })
    setReceipt({ payoutId: pending.payoutId, qrDataUrl, amount: pending.amount, periodFrom, periodTo, loans: eligibleLoans })
   } catch { showToast('Could not generate receipt', false) }
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
      const resp = await fetch('/api/commissions/payout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: availableAmount }),
      })
      let res: { success?: boolean; error?: string; data?: { payoutId: string } } | null = null
      try { res = await resp.json() } catch { res = null }
      if (res?.success && res.data?.payoutId) {
        showToast('Payout request submitted!', true)
        try { await generateReceipt(res.data.payoutId) } catch { showToast('Request submitted, but the receipt could not be generated', false) }
        load()
      } else {
        showToast(res?.error || `Request failed (${resp.status})`, false)
        load()
      }
    } catch (e) {
      showToast(e instanceof Error && e.message ? e.message : 'Request failed', false)
    } finally {
      setRequesting(false)
    }
  }

  if (loading && !summary && !loadError) return (
    <div className="flex h-40 items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-ink border-t-transparent" />
    </div>
  )

  if (!summary) return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 flex items-center justify-between gap-3">
      <span>{loadError || 'Could not load commissions'}</span>
      <button onClick={load} className="rounded-2xl bg-red-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-700 transition">Retry</button>
    </div>
  )

  return (
    <div className="space-y-5">
      {loadError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center justify-between gap-3">
          <span>{loadError}</span>
          <button onClick={load} className="shrink-0 rounded-2xl bg-red-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-700 transition">Retry</button>
        </div>
      )}
      {toast && (
        <div className={`fixed top-4 left-4 right-4 sm:left-auto sm:right-5 sm:top-5 z-50 rounded-2xl px-5 py-3 text-center sm:text-left text-sm font-medium text-white shadow-lg ${toast.ok ? 'bg-green-600' : 'bg-red-600'}`}>
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
                <p className="text-xs font-mono text-soft mt-0.5">{receipt.payoutId}</p>
              </div>
              <button onClick={() => setReceipt(null)} className="rounded-full p-1.5 hover:bg-mist transition">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Receipt body */}
            <div className="px-5 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div><p className="text-soft font-medium uppercase tracking-wide text-[9px]">Guarantor</p><p className="font-semibold mt-0.5">{session.name}</p></div>
                <div><p className="text-soft font-medium uppercase tracking-wide text-[9px]">Amount</p><p className="font-bold text-green-700 mt-0.5 text-base">{formatINR(receipt.amount)}</p></div>
                <div><p className="text-soft font-medium uppercase tracking-wide text-[9px]">Period From</p><p className="font-semibold mt-0.5">{formatDateIN(receipt.periodFrom)}</p></div>
                <div><p className="text-soft font-medium uppercase tracking-wide text-[9px]">Payout date</p><p className="font-semibold mt-0.5">{formatDateIN(receipt.periodTo)}</p></div>
              </div>

              {/* Loan breakdown */}
              <div className="rounded-2xl bg-mist divide-y divide-black/5 overflow-hidden">
                {receipt.loans.map(l => (
                  <div key={l.loanId} className="flex justify-between items-center px-3 py-2 text-xs">
                    <span className="font-medium">{l.customerName}</span>
                    <span className="font-semibold text-green-700">+{formatINR(Number(l.guarantorCommission || 0))}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center px-3 py-2 text-xs font-bold bg-green-50">
                  <span>Total</span>
                  <span className="text-green-700">{formatINR(receipt.amount)}</span>
                </div>
              </div>

              {/* QR code */}
              <div className="flex flex-col items-center py-2">
                <img src={receipt.qrDataUrl} width={160} height={160} alt="Payout QR" className="rounded-xl border border-line" />
                <p className="text-[10px] text-soft mt-2 text-center">Admin scans this QR to record payment</p>
              </div>

              <p className="text-center text-[10px] text-soft">Status: Pending Admin Approval</p>
            </div>

            {/* Modal footer */}
            <div className="flex gap-3 px-5 py-4 border-t border-black/5">
              <button onClick={downloadReceipt}
                className="flex-1 rounded-2xl bg-ink py-2.5 text-sm font-semibold text-white hover:bg-[#2d2d4e] transition">
                Download / Print
              </button>
              <button onClick={() => setReceipt(null)}
                className="rounded-2xl border border-line px-5 py-2.5 text-sm font-semibold hover:bg-mist transition">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-soft">Commission Overview</p>
        <button onClick={load} disabled={refreshing} className="flex items-center disabled:opacity-60 gap-1.5 rounded-2xl border border-line bg-white px-4 py-1.5 text-xs font-semibold text-soft hover:bg-mist transition">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-[1.5rem] border border-white/70 bg-white p-5 shadow-panel">
          <p className="text-xs text-soft">Total Earned</p>
          <p className="mt-2 text-3xl font-semibold">{formatINRShort(totalEarned)}</p>
          <p className="mt-1 text-xs text-soft">Across {loans.length} loan{loans.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="rounded-[1.5rem] border border-white/70 bg-white p-5 shadow-panel">
          <p className="text-xs text-soft">Available for Payout</p>
          <p className={`mt-2 text-3xl font-semibold ${availableAmount > 0 ? 'text-green-700' : ''}`}>{formatINR(availableAmount)}</p>
          <p className="mt-1 text-xs text-soft">{pastCycles.length} completed cycle{pastCycles.length !== 1 ? 's' : ''}</p>
          {pendingAmount > 0 && <p className="mt-0.5 text-xs font-medium text-amber-700">Pending request: {formatINR(pendingAmount)}</p>}
        </div>
        <div className="rounded-[1.5rem] border border-white/70 bg-white p-5 shadow-panel">
          <p className="text-xs text-soft">Locked until payout date</p>
          <p className="mt-2 text-3xl font-semibold text-amber-600">{formatINR(lockedCommission)}</p>
          <p className="mt-1 text-xs text-soft">
            {currentCycle ? `Payout date ${nextPayout ? formatDateIN(nextPayout) : ''} · ${daysUntilPayout} day${daysUntilPayout !== 1 ? 's' : ''}` : 'No active cycle'}
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
              <p className="text-sm text-soft mt-0.5">
                Your request of {formatINR(pendingPayout?.amount || 0)} is under review. You will be notified once processed.
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
              <p className="text-sm text-soft mt-0.5">
                {latestPayout?.rejectionReason || latestPayout?.notes || 'Your payout request was rejected.'}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  setDismissedRejected(true)
                  if (latestPayout?.payoutId) {
                    try { localStorage.setItem(`payout_dismissed_${latestPayout.payoutId}`, 'true') } catch { /* ignore */ }
                  }
                }}
                className="rounded-2xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : canRequestPayout ? (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex-1">
              <p className="text-xs text-soft mb-1">Withdraw Amount</p>
              <p className="text-3xl font-bold text-green-700">{formatINR(availableAmount)}</p>
              <p className="text-sm text-soft mt-1">
                From {eligibleRows.length} loan{eligibleRows.length !== 1 ? 's' : ''} · {pastCycles.length} completed cycle{pastCycles.length !== 1 ? 's' : ''}
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
              <p className="text-sm text-soft mt-0.5">
                {currentCycle
                  ? `Next payout date ${nextPayout ? formatDateIN(nextPayout) : ''} (${daysUntilPayout} day${daysUntilPayout !== 1 ? 's' : ''})`
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
        <div className="flex flex-col gap-3 border-b border-black/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">Commission Ledger</p>
            <p className="text-xs text-soft mt-0.5">
              {currentCycle
                ? `Cycle ${currentCycleIdx + 1} · started ${formatDateIN(currentCycle.start)} · payout date ${formatDateIN(currentCycle.end)}`
                : 'Commission pay cycles'}
            </p>
          </div>
          <div className="flex gap-2">
            <select value={monthFilter} onChange={e => setMonthFilter(e.target.value)} aria-label="Filter by month"
              className="rounded-2xl border border-line bg-white px-3 py-1.5 text-xs font-semibold text-soft">
              <option value="all">All months</option>
              {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} aria-label="Filter by status"
              className="rounded-2xl border border-line bg-white px-3 py-1.5 text-xs font-semibold text-soft">
              <option value="all">All status</option>
              <option value="eligible">Eligible</option>
              <option value="locked">Locked</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-black/5 bg-panel text-soft">
            <tr>
              {['Customer', 'Loan ID', 'Commission', 'Loan Status', 'Start Date', 'Cycle'].map(h => (
                <th key={h} className="px-5 py-3 font-medium text-xs">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {visibleRows.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-soft">{enriched.length === 0 ? 'No commissions recorded yet.' : 'No loans match the filters.'}</td></tr>
            )}
            {visibleRows.map(l => (
              <tr key={l.loanId} className="hover:bg-panel">
                <td className="px-5 py-3 font-medium">{l.customerName}</td>
                <td className="px-5 py-3 font-mono text-xs text-soft">{l.loanId?.slice(-9)}</td>
                <td className="px-5 py-3 font-semibold text-green-700">{formatINR(Number(l.guarantorCommission || 0))}</td>
                <td className="px-5 py-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${l.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-mist text-soft'}`}>
                    {l.status}
                  </span>
                </td>
                <td className="px-5 py-3 text-soft text-xs">{l.startDate ? formatDateIN(l.startDate) : '—'}</td>
                <td className="px-5 py-3">
                  {l.inCurrentCycle ? (
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">Locked</span>
                  ) : (
                    <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">Eligible</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          {visibleRows.length > 0 && (
            <tfoot className="border-t border-black/10 bg-panel">
              <tr>
                <td className="px-5 py-3 text-xs font-semibold text-soft" colSpan={2}>Total ({visibleRows.length} loan{visibleRows.length !== 1 ? 's' : ''})</td>
                <td className="px-5 py-3 font-bold text-green-700">{formatINR(visibleTotal)}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          )}
        </table>
        </div>
      </div>

      {/* Payout History */}
      {payouts.length > 0 && (
        <div className="overflow-hidden rounded-[1.75rem] border border-white/70 bg-white shadow-panel">
          <div className="border-b border-black/5 px-5 py-4">
            <p className="text-sm font-semibold">Payout History</p>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-black/5 bg-panel text-soft">
              <tr>
                {['Request ID', 'Amount', 'Status', 'Requested On', 'Processed On'].map(h => (
                  <th key={h} className="px-5 py-3 font-medium text-xs">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {payouts.map(p => (
                <tr key={p.payoutId} className="hover:bg-panel">
                  <td className="px-5 py-3 font-mono text-xs text-soft">{p.payoutId}</td>
                  <td className="px-5 py-3 font-semibold">{formatINR(p.amount)}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      p.status === 'Paid' ? 'bg-green-100 text-green-700'
                      : p.status === 'Pending' ? 'bg-amber-100 text-amber-700'
                      : 'bg-red-100 text-red-700'
                    }`}>{p.status}</span>
                  </td>
                  <td className="px-5 py-3 text-soft">{p.requestedAt ? formatDateIN(p.requestedAt) : '—'}</td>
                  <td className="px-5 py-3 text-soft">
                    {p.processedAt ? formatDateIN(p.processedAt) : '—'}
                    {p.status === 'Rejected' && (p.rejectionReason || p.notes) && (
                      <p className="mt-1 text-xs text-red-600">Reason: {p.rejectionReason || p.notes}</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  )
}
