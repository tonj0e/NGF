'use client'
import { useEffect, useRef, useState } from 'react'
import { Session } from '@/types'
import { formatINR, formatDateIN } from '@/lib/format'

export default function PayoutRequestsPage({ session }: { session: Session }) {
  const [payouts, setPayouts] = useState<any[]>([])
  const [commissions, setCommissions] = useState<any[]>([])
  // the pay window: approving a request, or paying a guarantor's unlocked commission straight away
  const [payModal, setPayModal] = useState<{ kind: 'approve'; payoutId: string; name: string; amount: number } | { kind: 'now'; guarantorId: string; name: string; max: number } | null>(null)
  const [payMode, setPayMode] = useState('Cash')
  const [payRef, setPayRef] = useState('')
  const [payAmount, setPayAmount] = useState('')
  const [payBusy, setPayBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [scanning, setScanning] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [rejectNotes, setRejectNotes] = useState('')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [rejectModal, setRejectModal] = useState<{ payoutId: string } | null>(null)

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  const loadedOnce = useRef(false)
  async function load() {
    if (!loadedOnce.current) setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch('/api/commissions/payout?all=1', { headers: { Authorization: `Bearer ${session.token}` } })
      const json = await res.json()
      if (json.success === false || !json.data) setLoadError(json.error || json.message || 'Failed to load payout requests')
      else { setPayouts(json.data.payouts || []); setCommissions(json.data.commissions || []) }
    } catch (e: any) {
      setLoadError(e.message || 'Failed to load payout requests')
    } finally {
      loadedOnce.current = true
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleAction(payoutId: string, action: 'approve' | 'reject', notes = '') {
    if (action === 'reject' && !notes.trim()) {
      showToast('Rejection reason required', false)
      return
    }

    if (action === 'approve') {
      const p = payouts.find(x => x.payoutId === payoutId)
      setPayMode('Cash'); setPayRef(''); setPayModal({ kind: 'approve', payoutId, name: p?.guarantorName || '', amount: p?.amount || 0 })
      return
    } else {
      setRejecting(payoutId)
    }

    try {
      const res = await fetch('/api/commissions/payout', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ payoutId, action, notes }),
      }).then(r => r.json())

      if (res.success) {
        showToast('Payout rejected', true)
        load()
      } else {
        showToast(res.error || res.message || 'Action failed', false)
      }
    } catch (e: any) {
      showToast(e.message || 'Action failed', false)
    } finally {
      setScanning(null)
      setRejecting(null)
      setRejectNotes('')
      setRejectModal(null)
    }
  }

  async function confirmPay() {
    if (!payModal || payBusy) return
    setPayBusy(true)
    try {
      const isNow = payModal.kind === 'now'
      const res = await fetch('/api/commissions/payout', {
        method: isNow ? 'POST' : 'PATCH',
        headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(isNow ? { action: 'payNow', guarantorId: payModal.guarantorId, amount: Number(payAmount), mode: payMode, reference: payRef } : { payoutId: payModal.payoutId, action: 'approve', mode: payMode, reference: payRef }),
      }).then(r => r.json())
      if (res.success) { showToast(isNow ? 'Commission payment recorded' : 'Payout marked as paid', true); setPayModal(null); load() }
      else showToast(res.error || res.message || 'Could not record the payment', false)
    } catch (e: any) { showToast(e.message || 'Could not record the payment', false) }
    setPayBusy(false)
  }

  function openRejectModal(payoutId: string) {
    setRejectModal({ payoutId })
    setRejectNotes('')
  }

  function confirmReject() {
    if (!rejectModal) return
    if (!rejectNotes.trim()) {
      showToast('Rejection reason required', false)
      return
    }
    handleAction(rejectModal.payoutId, 'reject', rejectNotes)
  }

  if (loading && !loadedOnce.current) return <div className="flex h-40 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-ink border-t-transparent" /></div>

  const inRange = (p: any) => {
    const d = (p.requestedAt || '').slice(0, 10)
    return (!fromDate || d >= fromDate) && (!toDate || d <= toDate)
  }
  const filtered = payouts.filter(p => inRange(p) && (statusFilter === 'all' || p.status === statusFilter))
  const pendingPayouts = filtered.filter(p => p.status === 'Pending')
  const processedPayouts = filtered.filter(p => p.status !== 'Pending')

  return (
    <div className="space-y-5">
      {toast && (
        <div className={`fixed top-5 right-5 z-50 rounded-2xl px-5 py-3 text-sm font-medium text-white shadow-lg ${toast.ok ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Payout Requests</h1>
        <button onClick={load} className="rounded-2xl border border-line bg-white px-4 py-2 text-sm font-medium hover:bg-mist transition">
          Refresh
        </button>
      </div>

      {loadError && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{loadError}</span>
          <button onClick={load} className="rounded-xl bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 transition">Retry</button>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-soft">Status
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="mt-1 block rounded-2xl border border-line bg-white px-3 py-2 text-sm text-black">
            <option value="all">All</option>
            <option value="Pending">Pending</option>
            <option value="Paid">Paid</option>
            <option value="Rejected">Rejected</option>
          </select>
        </label>
        <label className="text-xs text-soft">From
          <input type="date" value={fromDate} max={toDate || undefined} onChange={e => setFromDate(e.target.value)} className="mt-1 block rounded-2xl border border-line bg-white px-3 py-2 text-sm text-black" />
        </label>
        <label className="text-xs text-soft">To
          <input type="date" value={toDate} min={fromDate || undefined} onChange={e => setToDate(e.target.value)} className="mt-1 block rounded-2xl border border-line bg-white px-3 py-2 text-sm text-black" />
        </label>
        {(fromDate || toDate || statusFilter !== 'all') && (
          <button onClick={() => { setFromDate(''); setToDate(''); setStatusFilter('all') }} className="rounded-2xl border border-line bg-white px-3 py-2 text-sm hover:bg-mist transition">Clear</button>
        )}
      </div>

      {/* Commission tracker: who has earned what, what is unlocked, what was paid, and what can be paid now */}
      <div className="overflow-hidden rounded-[1.75rem] border border-white/70 bg-white shadow-panel">
        <div className="border-b border-black/5 px-5 py-4">
          <p className="text-sm font-semibold">Guarantor commission</p>
          <p className="text-xs text-soft">Commission is earned on every loan and unlocks 35 days after the first loan of a cycle starts. Paid includes cash recorded on the Guarantors page.</p>
        </div>
        {commissions.length === 0 ? <p className="p-8 text-center text-sm text-soft">No commission earned yet.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-left text-sm">
            <thead className="border-b border-black/5 bg-panel text-soft"><tr>{['Guarantor', 'Earned', 'Unlocked', 'Paid', 'Waiting', 'Can pay now', 'Next unlock', ''].map(h => <th key={h} className="px-4 py-3 text-xs font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-black/5">
              {commissions.map(c => (
                <tr key={c.guarantorId}>
                  <td className="px-4 py-3 font-medium">{c.name}{c.code ? <span className="ml-1.5 rounded-full bg-mist px-2 py-0.5 font-mono text-[11px] text-soft">{c.code}</span> : null}</td>
                  <td className="px-4 py-3">{formatINR(c.earned)}</td>
                  <td className="px-4 py-3">{formatINR(c.unlocked)}</td>
                  <td className="px-4 py-3">{formatINR(c.paid)}{c.aheadPaid > 0 && <span className="ml-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800" title="Paid before the 35 days ended">{formatINR(c.aheadPaid)} early</span>}</td>
                  <td className="px-4 py-3">{c.pending > 0 ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{formatINR(c.pending)} requested</span> : '—'}</td>
                  <td className={`px-4 py-3 font-semibold ${c.available > 0 ? 'text-emerald-700' : 'text-soft'}`}>{formatINR(c.available)}</td>
                  <td className="px-4 py-3 text-soft">{c.nextPayoutDate ? formatDateIN(c.nextPayoutDate) : '—'}</td>
                  <td className="px-4 py-3 text-right">
                    {c.pendingPayoutId ? <span className="text-xs text-soft">Approve the request below</span>
                      : <button disabled={c.available <= 0} onClick={() => { setPayMode('Cash'); setPayRef(''); setPayAmount(String(c.available)); setPayModal({ kind: 'now', guarantorId: c.guarantorId, name: c.name, max: c.available }) }}
                          className="rounded-xl bg-ink px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">Pay now</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>

      {payModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => setPayModal(null)}>
          <div className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
            <div>
              <p className="text-base font-semibold">{payModal.kind === 'now' ? `Pay commission to ${payModal.name}` : `Mark ${payModal.name}'s payout as paid`}</p>
              <p className="mt-1 text-sm text-soft">{payModal.kind === 'now' ? `Up to ${formatINR(payModal.max)} is unlocked and unpaid.` : `Amount ${formatINR(payModal.amount)}. Record how you paid it.`}</p>
            </div>
            {payModal.kind === 'now' && (
              <label className="block text-xs text-soft">Amount
                <input type="number" inputMode="decimal" value={payAmount} onChange={e => setPayAmount(e.target.value)} max={payModal.max} className="mt-1 block w-full rounded-2xl border border-line bg-white px-3 py-2.5 text-sm text-ink" />
              </label>
            )}
            <div>
              <p className="text-xs text-soft">Paid by</p>
              <div className="mt-1 grid grid-cols-3 gap-2">
                {['Cash', 'UPI', 'Bank Transfer'].map(m => <button key={m} onClick={() => setPayMode(m)} className={`min-h-11 rounded-2xl border px-2 text-sm font-semibold ${payMode === m ? 'border-brand bg-brand text-white' : 'border-line bg-white text-ink'}`}>{m}</button>)}
              </div>
            </div>
            <label className="block text-xs text-soft">Reference or UTR (optional)
              <input value={payRef} onChange={e => setPayRef(e.target.value)} data-no-upper className="mt-1 block w-full rounded-2xl border border-line bg-white px-3 py-2.5 text-sm text-ink" />
            </label>
            <div className="flex gap-2">
              <button onClick={() => setPayModal(null)} className="min-h-11 flex-1 rounded-2xl border border-line bg-white text-sm font-semibold">Cancel</button>
              <button onClick={confirmPay} disabled={payBusy || (payModal.kind === 'now' && !(Number(payAmount) > 0))} className="min-h-11 flex-1 rounded-2xl bg-ink text-sm font-bold text-white disabled:opacity-50">{payBusy ? 'Saving…' : 'Record payment'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Pending Requests */}
      {pendingPayouts.length > 0 && (
        <div className="overflow-hidden rounded-[1.75rem] border border-white/70 bg-white shadow-panel">
          <div className="border-b border-black/5 px-5 py-4 bg-amber-50">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
              <p className="text-sm font-semibold text-amber-700">Pending Review ({pendingPayouts.length})</p>
            </div>
          </div>
          <div className="overflow-x-auto"><table className="w-full text-left text-sm">
            <thead className="border-b border-black/5 bg-panel text-soft">
              <tr>
                {['Guarantor', 'Request ID', 'Amount', 'Requested On', 'Action'].map(h => (
                  <th key={h} className="px-5 py-3 font-medium text-xs">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {pendingPayouts.map(p => (
                <tr key={p.payoutId} className="hover:bg-panel">
                  <td className="px-5 py-3 font-medium">{p.guarantorName || p.guarantorId}</td>
                  <td className="px-5 py-3 font-mono text-xs text-soft">{p.payoutId}</td>
                  <td className="px-5 py-3 font-semibold text-green-700">{formatINR(p.amount)}</td>
                  <td className="px-5 py-3 text-soft">{p.requestedAt ? formatDateIN(p.requestedAt) : '—'}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        disabled={scanning === p.payoutId || rejecting === p.payoutId}
                        onClick={() => handleAction(p.payoutId, 'approve')}
                        className="flex-1 rounded-2xl bg-green-600 py-2 text-sm font-semibold text-white disabled:opacity-60 hover:bg-green-700 transition"
                      >
                        {scanning === p.payoutId ? 'Approving…' : 'Approve'}
                      </button>
                      <button
                        disabled={scanning === p.payoutId || rejecting === p.payoutId}
                        onClick={() => openRejectModal(p.payoutId)}
                        className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-600 disabled:opacity-40 hover:bg-red-100 transition"
                      >
                        {rejecting === p.payoutId ? 'Rejecting…' : 'Reject'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}

      {/* Processed History */}
      <div className="overflow-hidden rounded-[1.75rem] border border-white/70 bg-white shadow-panel">
        <div className="border-b border-black/5 px-5 py-4">
          <p className="text-sm font-semibold">Payout History ({processedPayouts.length})</p>
        </div>
        {processedPayouts.length === 0 ? (
          <p className="p-8 text-center text-sm text-soft">No processed payouts yet.</p>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-left text-sm">
            <thead className="border-b border-black/5 bg-panel text-soft">
              <tr>
                {['Guarantor', 'Request ID', 'Amount', 'Status', 'Requested On', 'Processed On', 'Notes'].map(h => (
                  <th key={h} className="px-5 py-3 font-medium text-xs">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {processedPayouts.map(p => (
                <tr key={p.payoutId} className="hover:bg-panel">
                  <td className="px-5 py-3 font-medium">{p.guarantorName || p.guarantorId}</td>
                  <td className="px-5 py-3 font-mono text-xs text-soft">{p.payoutId}</td>
                  <td className="px-5 py-3 font-semibold">{formatINR(p.amount)}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      p.status === 'Paid' ? 'bg-green-100 text-green-700'
                      : p.status === 'Rejected' ? 'bg-red-100 text-red-700'
                      : 'bg-amber-100 text-amber-700'
                    }`}>{p.status}</span>
                  </td>
                  <td className="px-5 py-3 text-soft">{p.requestedAt ? formatDateIN(p.requestedAt) : '—'}</td>
                  <td className="px-5 py-3 text-soft">{p.processedAt ? formatDateIN(p.processedAt) : '—'}</td>
                  <td className={`px-5 py-3 max-w-xs ${p.status === 'Rejected' ? 'text-red-700' : 'text-soft'}`}>
                    {p.status === 'Rejected' ? <span title={p.notes || ''}>Reason: {p.notes || 'Not provided'}</span> : <span className="truncate block">{p.notes || '—'}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>

      {/* Reject Modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setRejectModal(null)}>
          <div className="w-full max-w-md rounded-[1.75rem] bg-white shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-black/5">
              <p className="font-semibold">Reject Payout Request</p>
              <button onClick={() => setRejectModal(null)} className="rounded-full p-1.5 hover:bg-mist transition">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <p className="text-sm text-soft">Enter rejection reason (required):</p>
              <textarea
                value={rejectNotes}
                onChange={e => setRejectNotes(e.target.value)}
                placeholder="Reason for rejecting this payout request..."
                className="w-full rounded-2xl border border-line bg-mist px-4 py-3 text-sm outline-none focus:border-ink focus:bg-white transition resize-none min-h-[100px]"
                rows={4}
              />
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setRejectModal(null)}
                  className="flex-1 rounded-2xl border border-line bg-white py-2.5 text-sm font-semibold hover:bg-mist transition"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmReject}
                  disabled={rejecting !== null}
                  className="flex-1 rounded-2xl bg-red-600 py-2.5 text-sm font-semibold text-white disabled:opacity-60 hover:bg-red-700 transition"
                >
                  {rejecting === rejectModal.payoutId ? 'Rejecting…' : 'Confirm Reject'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}