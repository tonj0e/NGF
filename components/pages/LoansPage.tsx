'use client'
import { useEffect, useRef, useState } from 'react'
import EarlyCloseSection from './EarlyCloseSection'
import { Session } from '@/types'

function currency(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

function DriveImg({ url, token, name }: { url: string; token: string; name: string }) {
  const [src, setSrc] = useState<string | null>(null)
  const fid = url?.match(/[?&]id=([^&]+)/)?.[1] || url?.match(/\/d\/([^/]+)/)?.[1] || ''
  useEffect(() => {
    if (!fid) return
    fetch(`/api/drive/${fid}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (!r.ok) throw new Error(); return r.blob() })
      .then(b => setSrc(URL.createObjectURL(b)))
      .catch(() => {})
  }, [fid, token])
  if (src) return <img src={src} alt={name} className="h-full w-full object-cover" />
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#1a1a2e] text-white text-sm font-bold">
      {name?.charAt(0) || '?'}
    </div>
  )
}

type Filter = 'active' | 'completed' | 'overdue' | 'renewal' | 'all'

export default function LoansPage({ session, defaultFilter = 'active', customers, onViewCustomer }: { session: Session; defaultFilter?: Filter; customers?: any[]; onViewCustomer?: (customerId: string) => void }) {
  const [loans, setLoans] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  // The server filters, searches and pages: only the loans on screen are loaded
  const [page, setPage] = useState(1)
  const [totalLoans, setTotalLoans] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const PAGE_SIZE = 24
  const loansUrl = () => `/api/loans?filter=${defaultFilter}&page=${page}&pageSize=${PAGE_SIZE}&q=${encodeURIComponent(search.trim())}`
  const [closeModal, setCloseModal] = useState<any | null>(null)
  const [closing, setClosing] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [modalRepayments, setModalRepayments] = useState<any[]>([])
  const [modalRepsLoading, setModalRepsLoading] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; sub?: string; onConfirm: () => void } | null>(null)

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(''), 3000) }

  useEffect(() => {
    if (!closeModal) { setModalRepayments([]); return }
    setModalRepsLoading(true)
    fetch('/api/repayments?mode=history&pageSize=500', { headers: { Authorization: `Bearer ${session.token}` } })
      .then(r => r.json())
      .then(j => { if (j.success) setModalRepayments((j.data.rows || []).filter((r: any) => r['Loan ID'] === closeModal.loanId)) })
      .finally(() => setModalRepsLoading(false))
  }, [closeModal])

  async function handleForeclose(loanId: string) {
    setConfirmDialog({
      message: 'Foreclose this loan?',
      sub: 'Remaining weeks will be waived. Customer becomes renewal eligible for new loan.',
      onConfirm: () => { setConfirmDialog(null); execForeclose(loanId) }
    })
  }

  async function execForeclose(loanId: string) {
    setClosing('foreclose')
    const res = await fetch('/api/loans', {
      method: 'PATCH', headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'foreclose', loanId }),
    })
    const json = await res.json()
    setClosing(null)
    if (json.success) {
      showToast(`Loan foreclosed. ${json.data.waivedWeeks} week(s) waived.`)
      setCloseModal(null)
      // Reload in place (keep old rows on screen)
      fetch(loansUrl(), { headers: { Authorization: `Bearer ${session.token}` } })
        .then(r => r.json()).then(j => { if (j.success) setLoans(j.data.loans) }).finally(() => setLoading(false))
    } else showToast(json.error || 'Failed')
  }

  async function handleSettle(loanId: string) {
    setConfirmDialog({
      message: 'Settle remaining balance?',
      sub: 'All pending weeks marked as paid. Loan closed as completed.',
      onConfirm: () => { setConfirmDialog(null); execSettle(loanId) }
    })
  }

  async function execSettle(loanId: string) {
    setClosing('settle')
    const res = await fetch('/api/loans', {
      method: 'PATCH', headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'settleBalance', loanId }),
    })
    const json = await res.json()
    setClosing(null)
    if (json.success) {
      showToast(`Balance settled. ${json.data.settledWeeks} week(s) marked as paid.`)
      setCloseModal(null)
      fetch(loansUrl(), { headers: { Authorization: `Bearer ${session.token}` } })
        .then(r => r.json()).then(j => { if (j.success) setLoans(j.data.loans) }).finally(() => setLoading(false))
    } else showToast(json.error || 'Failed')
  }

  async function handleCloseAccount(loanId: string) {
    setConfirmDialog({
      message: 'Close this account?',
      sub: 'Loan marked as Closed. Cheque return & closing procedures apply.',
      onConfirm: () => { setConfirmDialog(null); execCloseAccount(loanId) }
    })
  }

  async function execCloseAccount(loanId: string) {
    setClosing('account')
    const res = await fetch('/api/loans', {
      method: 'PATCH', headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'closeAccount', loanId }),
    })
    const json = await res.json()
    setClosing(null)
    if (json.success) {
      showToast('Account closed.')
      setCloseModal(null)
      fetch(loansUrl(), { headers: { Authorization: `Bearer ${session.token}` } })
        .then(r => r.json()).then(j => { if (j.success) setLoans(j.data.loans) }).finally(() => setLoading(false))
    } else showToast(json.error || 'Failed')
  }

  // a new tab or a new search starts again at page 1; the search is sent after a short pause
  useEffect(() => { setPage(1) }, [defaultFilter, search])
  const loadSeq = useRef(0)
  useEffect(() => {
    const seq = ++loadSeq.current
    const t = setTimeout(() => {
      setLoading(true)
      fetch(loansUrl(), { headers: { Authorization: `Bearer ${session.token}` } })
        .then(r => r.json()).then(j => {
          if (seq !== loadSeq.current || !j.success) return   // a newer request replaced this one
          setLoans(j.data.loans); setTotalLoans(j.data.total); setTotalPages(j.data.totalPages)
        }).finally(() => setLoading(false))
    }, search ? 300 : 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultFilter, page, search])

  const filtered = loans   // already searched by the server


  return (
    <div className="space-y-4">
      {toast && <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-2xl bg-[#1a1a2e] px-5 py-3 text-sm font-medium text-white shadow-lg">{toast}</div>}

      {/* Custom confirm dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm rounded-[1.75rem] border border-white/70 bg-white shadow-2xl p-6 space-y-4">
            <div className="space-y-1">
              <p className="font-semibold text-base">{confirmDialog.message}</p>
              {confirmDialog.sub && <p className="text-sm text-[#697586]">{confirmDialog.sub}</p>}
            </div>
            <div className="flex gap-3">
              <button onClick={confirmDialog.onConfirm}
                className="flex-1 rounded-2xl bg-[#1a1a2e] px-4 py-3 text-sm font-semibold text-white hover:opacity-90 transition">
                Confirm
              </button>
              <button onClick={() => setConfirmDialog(null)}
                className="flex-1 rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm font-semibold hover:bg-[#f4f5f7] transition">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Close Loan Modal */}
      {closeModal && (() => {
        const photoUrl = closeModal.customerPhotoUrl || customers?.find(c => c.customerId === closeModal.customerId)?.customerPhotoUrl || ''
        const remaining = closeModal.totalWeeks - closeModal.paidWeeks
        const paidCount = modalRepayments.filter(r => r['Status'] === 'Paid').length
        const lateCount = modalRepayments.filter(r => r['Status'] === 'Delayed').length
        const notPaidCount = modalRepayments.filter(r => r['Status'] === 'Pending' || r['Status'] === 'Overdue').length
        return (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="w-full max-w-md rounded-[1.75rem] border border-white/70 bg-white shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="border-b border-black/5 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-[#e5e7eb]">
                  <DriveImg url={photoUrl} token={session.token} name={closeModal.customerName} />
                </div>
                <div>
                  <p className="font-semibold">{closeModal.customerName}</p>
                  <p className="font-mono text-xs text-[#697586]">{closeModal.loanId}</p>
                  <p className="text-[10px] text-[#697586]">ID: {closeModal.customerId}</p>
                </div>
              </div>
              <button onClick={() => setCloseModal(null)} className="rounded-xl border border-[#e5e7eb] px-3 py-1.5 text-xs font-semibold">✕</button>
            </div>

            <div className="p-6 space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-[#f4f5f7] p-4 text-center">
                  <p className="text-xs text-[#697586]">Weeks Paid</p>
                  <p className="mt-1 text-2xl font-bold">{closeModal.paidWeeks}<span className="text-sm font-normal text-[#697586]">/{closeModal.totalWeeks}</span></p>
                </div>
                <div className="rounded-2xl bg-[#f4f5f7] p-4 text-center">
                  <p className="text-xs text-[#697586]">Weeks Remaining</p>
                  <p className="mt-1 text-2xl font-bold text-orange-600">{remaining}</p>
                </div>
                <div className="rounded-2xl bg-[#f4f5f7] p-4 text-center">
                  <p className="text-xs text-[#697586]">Amount Collected</p>
                  <p className="mt-1 text-lg font-bold">{currency(closeModal.paidWeeks * Number(closeModal.weeklyAmount))}</p>
                </div>
                <div className="rounded-2xl bg-red-50 border border-red-100 p-4 text-center">
                  <p className="text-xs text-[#697586]">Amount Remaining</p>
                  <p className="mt-1 text-lg font-bold text-red-600">{currency(remaining * Number(closeModal.weeklyAmount))}</p>
                </div>
              </div>

              {/* Payment behaviour */}
              {modalRepsLoading ? (
                <div className="flex justify-center py-2"><div className="h-4 w-4 animate-spin rounded-full border-2 border-[#1a1a2e] border-t-transparent" /></div>
              ) : (
                <div className="rounded-2xl border border-[#e5e7eb] p-4 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#697586]">Payment Behaviour</p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl bg-green-50 border border-green-100 py-2">
                      <p className="text-lg font-bold text-green-700">{paidCount}</p>
                      <p className="text-[10px] text-green-700">On Time</p>
                    </div>
                    <div className="rounded-xl bg-amber-50 border border-amber-100 py-2">
                      <p className="text-lg font-bold text-amber-700">{lateCount}</p>
                      <p className="text-[10px] text-amber-700">Late</p>
                    </div>
                    <div className="rounded-xl bg-red-50 border border-red-100 py-2">
                      <p className="text-lg font-bold text-red-700">{notPaidCount}</p>
                      <p className="text-[10px] text-red-700">Not Paid</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Early closure: Close & Hold / Close permanently (branch staff and admin) */}
              <EarlyCloseSection session={session} loanId={closeModal.loanId}
                onDone={m => { showToast(m); setCloseModal(null); fetch(loansUrl(), { headers: { Authorization: `Bearer ${session.token}` } }).then(r => r.json()).then(j => { if (j.success) setLoans(j.data.loans) }) }} />

              {session.role === 'Admin' && <>
              {/* Settle balance */}
              {remaining > 0 && (
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 space-y-2">
                  <p className="text-xs font-semibold text-blue-800">Settle Remaining Balance</p>
                  <p className="text-xs text-blue-700">{remaining} weeks × {currency(Number(closeModal.weeklyAmount))} = <span className="font-bold">{currency(remaining * Number(closeModal.weeklyAmount))}</span></p>
                  <button onClick={() => handleSettle(closeModal.loanId)} disabled={closing !== null}
                    className="w-full rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 hover:bg-blue-800 transition">
                    {closing === 'settle' ? 'Processing…' : `Settle ${currency(remaining * Number(closeModal.weeklyAmount))}`}
                  </button>
                </div>
              )}

              {/* Action buttons */}
              <div className="space-y-2 pt-1">
                <button onClick={() => handleForeclose(closeModal.loanId)} disabled={closing !== null}
                  className="w-full rounded-2xl bg-[#1a1a2e] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50 hover:opacity-90 transition">
                  {closing === 'foreclose' ? 'Processing…' : '✓ Foreclose Loan'}
                </button>
                <p className="text-center text-[10px] text-[#697586]">Waives remaining weeks — customer becomes renewal eligible</p>
                <button onClick={() => handleCloseAccount(closeModal.loanId)} disabled={closing !== null}
                  className="w-full rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 disabled:opacity-50 hover:bg-red-100 transition">
                  {closing === 'account' ? 'Processing…' : '✕ Close Account'}
                </button>
                <p className="text-center text-[10px] text-[#697586]">Permanently closes the account — cheque return & closing procedures apply</p>
              </div>
              </>}
            </div>
          </div>
        </div>
        )
      })()}

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone, loan ID…"
        data-no-upper className="w-full max-w-sm rounded-2xl border border-[#e5e7eb] bg-white px-4 py-2.5 text-sm outline-none focus:border-[#1a1a2e]" />

      {loading
        ? <div className="flex h-40 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-[#1a1a2e] border-t-transparent" /></div>
        : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map(l => {
              const photoUrl = l.customerPhotoUrl || customers?.find(c => c.customerId === l.customerId)?.customerPhotoUrl || ''
              return (
              <div key={l.loanId} className="rounded-[1.75rem] border border-white/70 bg-white p-5 shadow-panel space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-[#e5e7eb]">
                      <DriveImg url={photoUrl} token={session.token} name={l.customerName} />
                    </div>
                    <div>
                      <p className="font-semibold">{l.customerName}</p>
                      <p className="font-mono text-xs text-[#697586]">{l.loanId}</p>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${l.isOverdue ? 'bg-red-100 text-red-700' : l.isRenewalEligible ? 'bg-blue-100 text-blue-700' : l.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-[#f4f5f7] text-[#697586]'}`}>
                    {l.isOverdue ? 'Overdue' : l.isRenewalEligible ? 'Renewal Ready' : l.status}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><p className="text-[#697586]">Guarantor</p><p className="font-medium">{l.guarantorName} {l.guarantorCode ? `(${l.guarantorCode})` : ''}</p></div>
                  <div><p className="text-[#697586]">Agent</p><p className="font-medium">{l.agentName || '—'}</p></div>
                  <div><p className="text-[#697586]">Principal</p><p className="font-medium">{currency(Number(l.principal))}</p></div>
                  <div><p className="text-[#697586]">Weekly EMI</p><p className="font-medium">{currency(Number(l.weeklyAmount))}</p></div>
                  <div><p className="text-[#697586]">Start Date</p><p className="font-medium">{l.startDate}</p></div>
                  <div><p className="text-[#697586]">End Date</p><p className="font-medium">{l.endDate}</p></div>
                </div>
                <div className="rounded-2xl bg-[#f4f5f7] px-3 py-2">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-[#697586]">Progress</span>
                    <span className="font-medium">{l.paidWeeks}/{l.totalWeeks} weeks</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[#e5e7eb]">
                    <div className="h-1.5 rounded-full bg-[#1a1a2e]" style={{ width: `${Math.round((l.paidWeeks / Math.max(l.totalWeeks, 1)) * 100)}%` }} />
                  </div>
                </div>
                <div className="flex gap-2">
                  {onViewCustomer && (
                    <button onClick={() => onViewCustomer(l.customerId)}
                      className="flex-1 rounded-xl border border-[#e5e7eb] px-3 py-2 text-xs font-semibold hover:bg-[#f4f5f7] transition">
                      View Customer
                    </button>
                  )}
                  {(session.role === 'Admin' || session.role === 'Staff') && defaultFilter === 'active' && (
                    <button onClick={() => setCloseModal(l)}
                      className="flex-1 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 transition">
                      Close Loan
                    </button>
                  )}
                </div>
              </div>
            )})}
          </div>
        )
      }
      {totalLoans > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3 pt-2">
          <span className="text-xs text-[#697586]">{totalLoans} loans · page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="rounded-2xl border border-[#e5e7eb] bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40">Previous</button>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="rounded-2xl border border-[#e5e7eb] bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
      {!loading && filtered.length === 0 && <p className="py-10 text-center text-sm text-[#697586]">{search ? 'No results found.' : 'No loans found.'}</p>}
    </div>
  )
}
