'use client'
import { useEffect, useState } from 'react'
import { Session } from '@/types'
import { formatINR, formatDateIN } from '@/lib/format'

export default function PayoutRequestsPage({ session }: { session: Session }) {
  const [payouts, setPayouts] = useState<any[]>([])
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

  async function load() {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch('/api/commissions/payout?all=1', { headers: { Authorization: `Bearer ${session.token}` } })
      const json = await res.json()
      if (json.success === false || !json.data) setLoadError(json.error || json.message || 'Failed to load payout requests')
      else setPayouts(json.data.payouts || [])
    } catch (e: any) {
      setLoadError(e.message || 'Failed to load payout requests')
    } finally {
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
      setScanning(payoutId)
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
        showToast(`Payout ${action === 'approve' ? 'approved' : 'rejected'}`, true)
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

  if (loading) return <div className="flex h-40 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-[#1a1a2e] border-t-transparent" /></div>

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
        <button onClick={load} className="rounded-2xl border border-[#e5e7eb] bg-white px-4 py-2 text-sm font-medium hover:bg-[#f4f5f7] transition">
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
        <label className="text-xs text-[#697586]">Status
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="mt-1 block rounded-2xl border border-[#e5e7eb] bg-white px-3 py-2 text-sm text-black">
            <option value="all">All</option>
            <option value="Pending">Pending</option>
            <option value="Paid">Paid</option>
            <option value="Rejected">Rejected</option>
          </select>
        </label>
        <label className="text-xs text-[#697586]">From
          <input type="date" value={fromDate} max={toDate || undefined} onChange={e => setFromDate(e.target.value)} className="mt-1 block rounded-2xl border border-[#e5e7eb] bg-white px-3 py-2 text-sm text-black" />
        </label>
        <label className="text-xs text-[#697586]">To
          <input type="date" value={toDate} min={fromDate || undefined} onChange={e => setToDate(e.target.value)} className="mt-1 block rounded-2xl border border-[#e5e7eb] bg-white px-3 py-2 text-sm text-black" />
        </label>
        {(fromDate || toDate || statusFilter !== 'all') && (
          <button onClick={() => { setFromDate(''); setToDate(''); setStatusFilter('all') }} className="rounded-2xl border border-[#e5e7eb] bg-white px-3 py-2 text-sm hover:bg-[#f4f5f7] transition">Clear</button>
        )}
      </div>

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
            <thead className="border-b border-black/5 bg-[#fafafa] text-[#697586]">
              <tr>
                {['Guarantor', 'Request ID', 'Amount', 'Requested On', 'Action'].map(h => (
                  <th key={h} className="px-5 py-3 font-medium text-xs">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {pendingPayouts.map(p => (
                <tr key={p.payoutId} className="hover:bg-[#fafafa]">
                  <td className="px-5 py-3 font-medium">{p.guarantorName || p.guarantorId}</td>
                  <td className="px-5 py-3 font-mono text-xs text-[#697586]">{p.payoutId}</td>
                  <td className="px-5 py-3 font-semibold text-green-700">{formatINR(p.amount)}</td>
                  <td className="px-5 py-3 text-[#697586]">{p.requestedAt ? formatDateIN(p.requestedAt) : '—'}</td>
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
          <p className="p-8 text-center text-sm text-[#697586]">No processed payouts yet.</p>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-left text-sm">
            <thead className="border-b border-black/5 bg-[#fafafa] text-[#697586]">
              <tr>
                {['Guarantor', 'Request ID', 'Amount', 'Status', 'Requested On', 'Processed On', 'Notes'].map(h => (
                  <th key={h} className="px-5 py-3 font-medium text-xs">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {processedPayouts.map(p => (
                <tr key={p.payoutId} className="hover:bg-[#fafafa]">
                  <td className="px-5 py-3 font-medium">{p.guarantorName || p.guarantorId}</td>
                  <td className="px-5 py-3 font-mono text-xs text-[#697586]">{p.payoutId}</td>
                  <td className="px-5 py-3 font-semibold">{formatINR(p.amount)}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      p.status === 'Paid' ? 'bg-green-100 text-green-700'
                      : p.status === 'Rejected' ? 'bg-red-100 text-red-700'
                      : 'bg-amber-100 text-amber-700'
                    }`}>{p.status}</span>
                  </td>
                  <td className="px-5 py-3 text-[#697586]">{p.requestedAt ? formatDateIN(p.requestedAt) : '—'}</td>
                  <td className="px-5 py-3 text-[#697586]">{p.processedAt ? formatDateIN(p.processedAt) : '—'}</td>
                  <td className={`px-5 py-3 max-w-xs ${p.status === 'Rejected' ? 'text-red-700' : 'text-[#697586]'}`}>
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
              <button onClick={() => setRejectModal(null)} className="rounded-full p-1.5 hover:bg-[#f4f5f7] transition">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <p className="text-sm text-[#697586]">Enter rejection reason (required):</p>
              <textarea
                value={rejectNotes}
                onChange={e => setRejectNotes(e.target.value)}
                placeholder="Reason for rejecting this payout request..."
                className="w-full rounded-2xl border border-[#e5e7eb] bg-[#f4f5f7] px-4 py-3 text-sm outline-none focus:border-[#1a1a2e] focus:bg-white transition resize-none min-h-[100px]"
                rows={4}
              />
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setRejectModal(null)}
                  className="flex-1 rounded-2xl border border-[#e5e7eb] bg-white py-2.5 text-sm font-semibold hover:bg-[#f4f5f7] transition"
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