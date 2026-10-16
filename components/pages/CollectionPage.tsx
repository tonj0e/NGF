'use client'
import { Fragment, useEffect, useRef, useState, useCallback } from 'react'
import { Session } from '@/types'
import StatusPill from '@/components/ui/StatusPill'

function currency(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

async function fileToPayload(file: File): Promise<string> {
  return new Promise(resolve => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.readAsDataURL(file)
  })
}

type Repayment = {
  'Repayment ID': string
  'Loan ID': string
  'Customer ID': string
  'Due Date': string
  'Week No': string
  'Amount': string
  'Status': string
  'Paid Date': string
  'Payment Mode'?: string
  'Notes': string
  customerName: string
  customerPhone: string
  guarantorName: string
}

type ReviewOption = { 'Option ID': string; 'Label': string; 'Category': string }

// ─── Action panel (mark paid / delayed / not paid) ──────────────────────────

function ActionPanel({ row, reviewOptions, session, onDone, onClose }: {
  row: Repayment; reviewOptions: ReviewOption[]; session: Session
  onDone: () => void; onClose: () => void
}) {
  const [status, setStatus] = useState<'Paid' | 'Delayed' | 'Not Paid'>('Paid')
  const [paymentMode, setPaymentMode] = useState('')
  const [notes, setNotes] = useState('')
  const [rating, setRating] = useState(0)
  const [review, setReview] = useState('')
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  const reviewChoices = reviewOptions.filter(o => o['Category'] === 'Review')

  async function submit() {
    if (saving) return
    if (status === 'Paid' && !paymentMode) {
      alert('Please choose a payment mode.')
      return
    }
    if (!rating) {
      alert('Please give a star rating for the customer.')
      return
    }
    setSaving(true)
    const reviewLabel = `${rating}★${review ? ` · ${review}` : ''}`
    const proof = proofFile ? await fileToPayload(proofFile) : null
    try {
      const res = await fetch('/api/repayments', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ repaymentId: row['Repayment ID'], status, paymentMode, notes, reviewLabel, paymentProof: proof }),
      })
      const json = await res.json()
      // The API wraps its reply, so a "not found" arrives as success:true with data.success:false
      if (json.success && json.data?.success !== false) { onDone(); onClose() }
      else alert(json.data?.error || json.error || 'Could not save the payment. Please try again.')
    } catch {
      alert('Network error. The payment was not saved.')
    } finally { setSaving(false) }
  }

  const btnCls = (s: string) =>
    `flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold transition border ${status === s
      ? s === 'Paid' ? 'bg-green-600 text-white border-green-600'
        : s === 'Delayed' ? 'bg-amber-500 text-white border-amber-500'
        : 'bg-red-600 text-white border-red-600'
      : 'bg-white text-[#697586] border-[#e5e7eb] hover:bg-[#f4f5f7]'}`

  return (
    <div className="mt-4 rounded-2xl border border-[#e5e7eb] bg-[#f9fafb] p-4 space-y-3">
      <div className="flex gap-2">
        {(['Paid', 'Delayed', 'Not Paid'] as const).map(s => (
          <button key={s} type="button" onClick={() => setStatus(s)} className={btnCls(s)}>{s}</button>
        ))}
      </div>
      <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)}
        className="w-full rounded-2xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm outline-none focus:border-[#1a1a2e]">
        <option value="">Payment mode</option>
        <option value="Cash">Cash</option>
        <option value="UPI">UPI / QR</option>
        <option value="Bank">Bank Transfer</option>
      </select>
      <div className="rounded-2xl border border-[#e5e7eb] bg-white p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#697586]">Customer Rating <span className="text-red-500">*</span></p>
        <div className="flex items-center gap-1.5">
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} type="button" onClick={() => setRating(n)}
              aria-label={`${n} star${n > 1 ? 's' : ''}`}
              className="text-3xl leading-none transition-transform hover:scale-110">
              <span className={n <= rating ? 'text-amber-400' : 'text-[#d1d5db]'}>★</span>
            </button>
          ))}
          {rating > 0 && <span className="ml-2 text-sm font-semibold text-[#1a1a2e]">{rating}/5</span>}
        </div>
        {reviewChoices.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-[#1a1a2e]">Review (optional)</p>
            <select value={review} onChange={e => setReview(e.target.value)}
              className="w-full rounded-xl border border-[#e5e7eb] bg-[#f9fafb] px-4 py-2.5 text-sm outline-none focus:border-[#1a1a2e] focus:bg-white">
              <option value="">Select a review</option>
              {reviewChoices.map(o => (
                <option key={o['Option ID']} value={o['Label']}>{o['Label']}</option>
              ))}
            </select>
          </div>
        )}
      </div>
      <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)" rows={2}
        className="w-full rounded-2xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm outline-none focus:border-[#1a1a2e] resize-none" />
      <div>
        <label className="block text-xs text-[#697586] mb-1">Payment proof (optional)</label>
        <input type="file" accept="image/*" onChange={e => setProofFile(e.target.files?.[0] || null)}
          className="w-full rounded-2xl border border-[#e5e7eb] bg-white px-3 py-2.5 text-sm" />
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={submit} disabled={saving}
          className="flex-1 rounded-2xl bg-[#1a1a2e] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button type="button" onClick={onClose}
          className="rounded-2xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm font-semibold text-[#697586]">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ─── Repayment card list (shared renderer) ──────────────────────────────────

const IST_OFFSET = 5.5 * 60 * 60 * 1000
const isTodaySaturday = new Date(Date.now() + IST_OFFSET).getUTCDay() === 6

// Testing flag (toggled from the Dev page): when on, payments can be recorded
// any day, bypassing the Saturday-only restriction. Stored in localStorage.
export const PAYMENT_UNLOCK_KEY = 'ngf_payment_unlock'
function isPaymentUnlocked() {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(PAYMENT_UNLOCK_KEY) === '1'
}

function RepaymentCards({ rows, page, search, reviewOptions, session, onSaved, onPageChange, total, showSearch }: {
  rows: Repayment[]; page: number; search: string; total: number
  reviewOptions: ReviewOption[]; session: Session
  onSaved: () => void; onPageChange: (p: number, q: string) => void
  showSearch: boolean
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [q, setQ] = useState(() => search)
  const [unlocked, setUnlocked] = useState(isPaymentUnlocked)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const PAGE_SIZE = 30
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const hint = session.role === 'Guarantor' ? 'Search last 4 digits of Loan ID or mobile' : 'Search Loan ID or mobile'
  const canRecord = isTodaySaturday || unlocked

  // Pick up Dev-page toggle changes (fires across tabs; re-read on focus too)
  useEffect(() => {
    const refresh = () => setUnlocked(isPaymentUnlocked())
    window.addEventListener('storage', refresh)
    window.addEventListener('focus', refresh)
    return () => { window.removeEventListener('storage', refresh); window.removeEventListener('focus', refresh) }
  }, [])

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(''), 3000) }
  function handleSearch(v: string) {
    setQ(v)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => onPageChange(1, v), 500)
  }

  return (
    <div className="space-y-4">
      {toast && <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-2xl bg-[#1a1a2e] px-5 py-3 text-sm font-medium text-white shadow-lg">{toast}</div>}
      {showSearch && (
        <div className="flex gap-3">
          <input value={q} onChange={e => handleSearch(e.target.value)} placeholder={hint} data-no-upper
            className="flex-1 rounded-2xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm outline-none focus:border-[#1a1a2e]" />
          <span className="rounded-2xl bg-[#f4f5f7] px-4 py-3 text-sm font-medium text-[#697586]">{total} records</span>
        </div>
      )}
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[#e5e7eb] bg-white p-8 text-center text-sm text-[#697586]">No repayments found.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
          {rows.map(r => (
            <div key={r['Repayment ID']} className="rounded-[1.6rem] border border-white/70 bg-white p-5 shadow-panel">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{r.customerName}</p>
                  <p className="text-sm text-[#697586]">{r['Loan ID']} &bull; Week {r['Week No']}</p>
                  <p className="text-xs text-[#697586]">Due: {r['Due Date']}</p>
                  {r.guarantorName && <p className="text-xs text-[#697586]">Guarantor: {r.guarantorName}</p>}
                  {r.customerPhone && (
                    <div className="mt-1 flex items-center gap-2">
                      <a href={`tel:${r.customerPhone}`} className="text-xs text-[#697586] hover:text-green-700">{r.customerPhone}</a>
                      <CallButton phone={r.customerPhone} />
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xl font-semibold">{currency(Number(r['Amount']))}</p>
                  <StatusPill status={r['Status']} />
                </div>
              </div>
              {r['Status'] !== 'Paid' && (
                openId === r['Repayment ID'] ? (
                  <ActionPanel row={r} reviewOptions={reviewOptions} session={session}
                    onDone={() => { showToast('Saved.'); onSaved() }}
                    onClose={() => setOpenId(null)} />
                ) : canRecord ? (
                  <button onClick={() => setOpenId(r['Repayment ID'])}
                    className="mt-4 w-full rounded-2xl border border-[#e5e7eb] bg-[#f4f5f7] px-4 py-2.5 text-sm font-semibold text-[#1a1a2e] hover:bg-[#1a1a2e] hover:text-white transition">
                    Record Payment
                  </button>
                ) : (
                  <div className="mt-4 w-full rounded-2xl border border-[#e5e7eb] bg-[#f9fafb] px-4 py-2.5 text-sm font-semibold text-[#697586] text-center cursor-not-allowed">
                    Not the payment day
                  </div>
                )
              )}
            </div>
          ))}
        </div>
      )}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button onClick={() => onPageChange(page - 1, q)} disabled={page === 1}
            className="rounded-2xl border border-[#e5e7eb] bg-white px-4 py-2 text-sm font-medium disabled:opacity-40">Prev</button>
          <span className="text-sm text-[#697586]">Page {page} of {totalPages}</span>
          <button onClick={() => onPageChange(page + 1, q)} disabled={page === totalPages}
            className="rounded-2xl border border-[#e5e7eb] bg-white px-4 py-2 text-sm font-medium disabled:opacity-40">Next</button>
        </div>
      )}
    </div>
  )
}

// ─── Generic pending list with search (All Pending / Today) ─────────────────

function PendingList({ apiMode, session, reviewOptions }: {
  apiMode: string; session: Session; reviewOptions: ReviewOption[]
}) {
  const [rows, setRows] = useState<Repayment[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const PAGE_SIZE = 30

  const load = useCallback(async (p = 1, q = '') => {
    setLoading(true)
    const params = new URLSearchParams({ mode: apiMode, search: q, page: String(p), pageSize: String(PAGE_SIZE) })
    const res = await fetch(`/api/repayments?${params}`, { headers: { Authorization: `Bearer ${session.token}` } })
    const json = await res.json()
    if (json.success) { setRows(json.data.rows); setTotal(json.data.total) }
    setLoading(false)
  }, [apiMode, session.token])

  useEffect(() => { load(1, '') }, [apiMode])

  return (
    <div>
      {loading && <div className="flex h-40 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-[#1a1a2e] border-t-transparent" /></div>}
      <RepaymentCards rows={rows} page={page} search={search} total={total} showSearch
        reviewOptions={reviewOptions} session={session}
        onSaved={() => load(page, search)}
        onPageChange={(p, q) => { setPage(p); setSearch(q); load(p, q) }} />
    </div>
  )
}

// ─── Coming Saturday tab (no search, summary + full list) ───────────────────

function ComingSaturdayTab({ session, reviewOptions }: { session: Session; reviewOptions: ReviewOption[] }) {
  const [rows, setRows] = useState<Repayment[]>([])
  const [summary, setSummary] = useState<{ saturdayDate: string; customerCount: number; totalAmount: number; guarantorCount: number } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const params = new URLSearchParams({ mode: 'nextsaturday', page: '1', pageSize: '500' })
      const res = await fetch(`/api/repayments?${params}`, { headers: { Authorization: `Bearer ${session.token}` } })
      const json = await res.json()
      if (json.success) {
        setRows(json.data.rows)
        setSummary(json.data.summary || null)
      }
      setLoading(false)
    }
    load()
  }, [session.token])

  if (loading) return <div className="flex h-40 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-[#1a1a2e] border-t-transparent" /></div>

  return (
    <div className="space-y-5">
      {summary && (
        <>
          <p className="text-sm text-[#697586] font-medium">Collections due on <span className="font-semibold text-[#1a1a2e]">{summary.saturdayDate}</span></p>
          <div className={`grid gap-4 ${session.role === 'Guarantor' ? 'grid-cols-2' : 'grid-cols-3'}`}>
            <div className="rounded-[1.5rem] border border-white/70 bg-white p-5 shadow-panel text-center">
              <p className="text-xs text-[#697586]">Customers</p>
              <p className="mt-2 text-3xl font-semibold">{summary.customerCount}</p>
            </div>
            <div className="rounded-[1.5rem] border border-white/70 bg-white p-5 shadow-panel text-center">
              <p className="text-xs text-[#697586]">Total Amount</p>
              <p className="mt-2 text-2xl font-semibold">{currency(summary.totalAmount)}</p>
            </div>
            {session.role !== 'Guarantor' && (
              <div className="rounded-[1.5rem] border border-white/70 bg-white p-5 shadow-panel text-center">
                <p className="text-xs text-[#697586]">Guarantors</p>
                <p className="mt-2 text-3xl font-semibold">{summary.guarantorCount}</p>
              </div>
            )}
          </div>
        </>
      )}
      <RepaymentCards rows={rows} page={1} search="" total={rows.length} showSearch={false}
        reviewOptions={reviewOptions} session={session}
        onSaved={() => {}}
        onPageChange={() => {}} />
    </div>
  )
}

// ─── Past month summary ──────────────────────────────────────────────────────

function PastMonthTab({ session }: { session: Session }) {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/repayments?mode=history', { headers: { Authorization: `Bearer ${session.token}` } })
      .then(r => r.json()).then(j => { if (j.success) setRows(j.data.rows || []) }).finally(() => setLoading(false))
  }, [])

  const lastMonth = new Date(); lastMonth.setMonth(lastMonth.getMonth() - 1)
  const lastMonthStr = lastMonth.toISOString().slice(0, 7)
  const paid = rows.filter(r => r['Status'] === 'Paid' && (r['Paid Date'] || '').startsWith(lastMonthStr))
  const total = paid.reduce((s, r) => s + Number(r['Amount'] || 0), 0)
  const avg = paid.length ? total / paid.length : 0

  if (loading) return <div className="flex h-40 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-[#1a1a2e] border-t-transparent" /></div>

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-[1.5rem] border border-white/70 bg-white p-5 shadow-panel">
          <p className="text-xs text-[#697586]">Total Collected</p>
          <p className="mt-2 text-3xl font-semibold">{currency(total)}</p>
          <p className="mt-1 text-xs text-[#697586]">{lastMonthStr}</p>
        </div>
        <div className="rounded-[1.5rem] border border-white/70 bg-white p-5 shadow-panel">
          <p className="text-xs text-[#697586]">Avg Ticket</p>
          <p className="mt-2 text-3xl font-semibold">{currency(avg)}</p>
        </div>
        <div className="rounded-[1.5rem] border border-white/70 bg-white p-5 shadow-panel">
          <p className="text-xs text-[#697586]">Collection Count</p>
          <p className="mt-2 text-3xl font-semibold">{paid.length}</p>
        </div>
      </div>
      <div className="overflow-hidden rounded-[1.75rem] border border-white/70 bg-white shadow-panel">
        <div className="border-b border-black/5 px-5 py-4">
          <p className="text-sm font-semibold">Past Month Transactions — {lastMonthStr}</p>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-black/5 bg-[#fafafa] text-[#697586]">
            <tr>{['Customer','Loan ID','Week','Paid Date','Amount','Mode'].map(h => <th key={h} className="px-5 py-3 font-medium text-xs">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {paid.map(r => (
              <tr key={r['Repayment ID']} className="hover:bg-[#fafafa]">
                <td className="px-5 py-3 font-medium">{r.customerName}</td>
                <td className="px-5 py-3 font-mono text-xs text-[#697586]">{r['Loan ID']}</td>
                <td className="px-5 py-3 text-[#697586]">{r['Week No']}</td>
                <td className="px-5 py-3 text-[#697586]">{r['Paid Date']}</td>
                <td className="px-5 py-3 font-semibold">{currency(Number(r['Amount']))}</td>
                <td className="px-5 py-3 text-[#697586]">{r['Payment Mode'] || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {paid.length === 0 && <p className="p-8 text-center text-sm text-[#697586]">No collections for last month.</p>}
      </div>
    </div>
  )
}

// ─── Collection history table ────────────────────────────────────────────────

function HistoryTab({ session }: { session: Session }) {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/repayments?mode=history', { headers: { Authorization: `Bearer ${session.token}` } })
      .then(r => r.json()).then(j => { if (j.success) setRows(j.data.rows || []) }).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex h-40 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-[#1a1a2e] border-t-transparent" /></div>

  const paid = rows.filter(r => r['Status'] === 'Paid')

  return (
    <div className="overflow-hidden rounded-[1.75rem] border border-white/70 bg-white shadow-panel">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-black/5 bg-[#fafafa] text-[#697586]">
            <tr>{['Customer','Loan ID','Week','Due Date','Paid Date','Amount','Mode'].map(h => <th key={h} className="px-5 py-4 font-medium text-xs">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {paid.map(r => (
              <tr key={r['Repayment ID']} className="hover:bg-[#fafafa]">
                <td className="px-5 py-4 font-medium">{r.customerName}</td>
                <td className="px-5 py-4 text-[#697586]">{r['Loan ID']}</td>
                <td className="px-5 py-4 text-[#697586]">{r['Week No']}</td>
                <td className="px-5 py-4 text-[#697586]">{r['Due Date']}</td>
                <td className="px-5 py-4 text-[#697586]">{r['Paid Date']}</td>
                <td className="px-5 py-4 font-semibold">{currency(Number(r['Amount']))}</td>
                <td className="px-5 py-4 text-[#697586]">{r['Payment Mode'] || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {paid.length === 0 && <p className="p-8 text-center text-sm text-[#697586]">No collections recorded.</p>}
    </div>
  )
}

// ─── Main CollectionPage ─────────────────────────────────────────────────────

type CollectionTab = 'all' | 'today' | 'list' | 'coming' | 'pastMonth' | 'history'

// ─── Tap-to-call button (triggers the dialer on mobile) ──────────────────────

function CallButton({ phone, className = '' }: { phone: string; className?: string }) {
  if (!phone) return null
  return (
    <a href={`tel:${phone}`} onClick={e => e.stopPropagation()}
      title={`Call ${phone}`}
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700 hover:bg-green-600 hover:text-white transition ${className}`}>
      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
      </svg>
    </a>
  )
}

// ─── List tab: full customer list (same data as the downloadable sheet) ──────

function CollectionListTab({ session }: { session: Session }) {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  useEffect(() => {
    fetch('/api/collection-sheet', { headers: { Authorization: `Bearer ${session.token}` } })
      .then(r => r.json())
      .then(j => { if (j.success) setRows(j.data.rows || []) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [session.token])

  const query = q.toLowerCase().trim()
  const filtered = query
    ? rows.filter(r =>
        r.name.toLowerCase().includes(query) ||
        String(r.number).includes(query) ||
        String(r.code).toLowerCase().includes(query) ||
        (r.place || '').toLowerCase().includes(query))
    : rows

  // Admins/agents see the list grouped by guarantor; guarantors see only their own
  const grouped = session.role !== 'Guarantor'
  const groups: { label: string; rows: any[] }[] = []
  if (grouped) {
    const idx = new Map<string, number>()
    for (const r of filtered) {
      const key = r.guarantorName || 'Unassigned'
      if (!idx.has(key)) {
        idx.set(key, groups.length)
        groups.push({ label: r.guarantorCode ? `${key} (${r.guarantorCode})` : key, rows: [] })
      }
      groups[idx.get(key)!].rows.push(r)
    }
  }

  if (loading) return (
    <div className="flex h-40 items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#1a1a2e] border-t-transparent" />
    </div>
  )

  const customerRow = (r: any, i: number) => (
    <tr key={r.code + r.number} className="hover:bg-[#f9fafb]">
      <td className="px-4 py-3 text-center text-[#697586]">{i + 1}</td>
      <td className="px-4 py-3 font-medium">{r.name}</td>
      <td className="px-4 py-3 text-right font-semibold">{currency(Number(r.balance))}</td>
      <td className="px-4 py-3 text-center font-semibold">{r.rp}</td>
      <td className="px-4 py-3 text-center font-mono text-[#697586]">{r.code}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <a href={`tel:${r.number}`} className="font-mono text-[#697586] hover:text-green-700">{r.number}</a>
          <CallButton phone={r.number} />
        </div>
      </td>
      <td className="px-4 py-3 text-[#697586]">{r.place}</td>
    </tr>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <input value={q} onChange={e => setQ(e.target.value)} data-no-upper
          placeholder="Search name, code, mobile, place…"
          className="flex-1 min-w-[220px] rounded-2xl border border-[#e5e7eb] bg-white px-4 py-2.5 text-sm outline-none focus:border-[#1a1a2e]" />
        <span className="text-sm text-[#697586]">{filtered.length} customer{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[#e5e7eb] bg-white p-8 text-center text-sm text-[#697586]">
          No active customers to collect from.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-[1.5rem] border border-white/70 bg-white shadow-panel">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-[#f4f5f7] text-left text-xs uppercase tracking-wider text-[#697586]">
                <th className="px-4 py-3 text-center">No</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3 text-right">Balance</th>
                <th className="px-4 py-3 text-center">RP</th>
                <th className="px-4 py-3 text-center">Code</th>
                <th className="px-4 py-3">Number</th>
                <th className="px-4 py-3">Place</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {grouped
                ? groups.map(g => {
                    const groupTotal = g.rows.reduce((s, r) => s + Number(r.balance || 0), 0)
                    return (
                      <Fragment key={`grp-${g.label}`}>
                        <tr className="bg-[#1a1a2e]">
                          <td colSpan={7} className="px-4 py-2.5 text-sm font-semibold text-white">
                            {g.label} · {g.rows.length} customer{g.rows.length !== 1 ? 's' : ''} · {currency(groupTotal)}
                          </td>
                        </tr>
                        {g.rows.map((r, i) => customerRow(r, i))}
                      </Fragment>
                    )
                  })
                : filtered.map((r, i) => customerRow(r, i))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// Friday (IST) 5pm through end of Saturday — when guarantors may pull the sheet
function isSheetWindowOpen() {
  const istOffset = 5.5 * 60 * 60 * 1000
  const d = new Date(Date.now() + istOffset)
  const day = d.getUTCDay()
  const hour = d.getUTCHours()
  return (day === 5 && hour >= 17) || day === 6
}

function buildSheetHtml(data: any) {
  const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string))
  const rows = data.rows || []
  // A specific-guarantor sheet (guarantor portal / admin filtered by one guarantor)
  // stays a flat list; the all-customers sheet groups rows under guarantor headings.
  const grouped = !data.guarantorName
  const title = data.guarantorName
    ? `${data.guarantorName}${data.guarantorCode ? ` (${data.guarantorCode})` : ''}`
    : 'ALL CUSTOMERS'

  const customerRow = (r: any, i: number) => `
    <tr>
      <td class="c">${i + 1}</td>
      <td>${esc(r.name)}</td>
      <td class="r">₹${Number(r.balance).toLocaleString('en-IN')}</td>
      <td class="c">${esc(r.rp)}</td>
      <td class="c">${esc(r.code)}</td>
      <td>${esc(r.number)}</td>
      <td>${esc(r.place)}</td>
    </tr>`

  let body: string
  if (grouped) {
    // Build guarantor → rows map preserving the API's sorted order
    const groups: { key: string; label: string; rows: any[] }[] = []
    const idx = new Map<string, number>()
    for (const r of rows) {
      const key = r.guarantorName || 'Unassigned'
      if (!idx.has(key)) {
        idx.set(key, groups.length)
        const label = r.guarantorCode ? `${key} (${r.guarantorCode})` : key
        groups.push({ key, label, rows: [] })
      }
      groups[idx.get(key)!].rows.push(r)
    }
    body = groups.map(g => {
      const groupTotal = g.rows.reduce((s, r) => s + Number(r.balance || 0), 0)
      const header = `
        <tr class="grp"><td colspan="7">${esc(g.label)} — ${g.rows.length} customer${g.rows.length !== 1 ? 's' : ''} · ₹${groupTotal.toLocaleString('en-IN')}</td></tr>`
      // Number resets within each guarantor group
      return header + g.rows.map((r: any, i: number) => customerRow(r, i)).join('')
    }).join('')
  } else {
    body = rows.map((r: any, i: number) => customerRow(r, i)).join('')
  }

  return `<!doctype html><html><head><meta charset="utf-8"><title>Collection Sheet ${esc(data.saturday)}</title>
  <style>
    @page { margin: 14mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; }
    h1 { text-align: center; font-size: 18px; margin: 0 0 4px; }
    .sub { text-align: center; font-size: 12px; color: #555; margin: 0 0 14px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #444; padding: 6px 8px; text-align: left; }
    th { background: #f0f0f0; }
    td.c, th.c { text-align: center; }
    td.r, th.r { text-align: right; }
    tr { page-break-inside: avoid; }
    tr.grp td { background: #1a1a2e; color: #fff; font-weight: bold; font-size: 12.5px; }
  </style></head>
  <body onload="window.print()">
    <h1>COLLECTION SHEET — ${esc(title)}</h1>
    <p class="sub">Saturday ${esc(data.saturday)} · ${data.count} customers · generated ${esc(data.generatedAt)}</p>
    <table>
      <thead><tr>
        <th class="c">NO</th><th>NAME</th><th class="r">BALANCE</th><th class="c">RP</th>
        <th class="c">CODE</th><th>NUMBER</th><th>PLACE</th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table>
  </body></html>`
}

export default function CollectionPage({ session }: { session: Session }) {
  const [tab, setTab] = useState<CollectionTab>(session.role === 'Guarantor' ? 'today' : 'all')
  const [reviewOptions, setReviewOptions] = useState<ReviewOption[]>([])
  const [downloading, setDownloading] = useState(false)

  const canDownload = session.role === 'Admin' || session.role === 'Staff' || isSheetWindowOpen()

  async function downloadSheet() {
    if (downloading) return
    setDownloading(true)
    try {
      const res = await fetch('/api/collection-sheet?download=1', { headers: { Authorization: `Bearer ${session.token}` } })
      const json = await res.json()
      if (!json.success) { alert(json.error || 'Could not generate sheet.'); return }
      if (!json.data.rows.length) { alert('No active customers to collect from.'); return }
      const w = window.open('', '_blank')
      if (!w) { alert('Please allow pop-ups to download the sheet.'); return }
      w.document.write(buildSheetHtml(json.data))
      w.document.close()
    } catch {
      alert('Something went wrong generating the sheet.')
    } finally {
      setDownloading(false)
    }
  }

  useEffect(() => {
    fetch('/api/review-options', { headers: { Authorization: `Bearer ${session.token}` } })
      .then(r => r.json()).then(j => { if (j.success) setReviewOptions(j.data.options) })
  }, [session.token])

  type TabDef = { key: CollectionTab; label: string; roles?: string[] }
  const TABS: TabDef[] = [
    { key: 'all',       label: 'All Pending',      roles: ['Admin', 'NGF AGENT', 'Staff'] },
    { key: 'today',     label: 'Today (Saturday)' },
    { key: 'list',      label: 'List' },
    { key: 'coming',    label: 'Coming Saturday',  roles: ['Admin', 'NGF AGENT', 'Staff'] },
    { key: 'pastMonth', label: 'Past Month',        roles: ['Admin', 'Staff'] },
    { key: 'history',   label: 'History',           roles: ['Admin', 'Staff'] },
  ]

  const visibleTabs = TABS.filter(t => !t.roles || t.roles.includes(session.role))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          {visibleTabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${tab === t.key ? 'bg-[#1a1a2e] text-white' : 'border border-[#e5e7eb] bg-white text-[#697586] hover:text-[#1a1a2e]'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={downloadSheet}
          disabled={!canDownload || downloading}
          title={canDownload ? 'Download collection sheet' : 'Available Friday 5pm through Saturday'}
          className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold transition ${
            canDownload
              ? 'bg-green-600 text-white hover:bg-green-700'
              : 'border border-[#e5e7eb] bg-[#f4f5f7] text-[#9ca3af] cursor-not-allowed'
          } ${downloading ? 'opacity-60' : ''}`}>
          {downloading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          )}
          {downloading ? 'Preparing…' : 'Download Sheet'}
        </button>
      </div>
      {!canDownload && (
        <p className="text-xs text-[#9ca3af]">The collection sheet can be downloaded from Friday 5:00 PM through Saturday.</p>
      )}
      {tab === 'all'       && <PendingList apiMode=""       session={session} reviewOptions={reviewOptions} />}
      {tab === 'today'     && <PendingList apiMode="today"  session={session} reviewOptions={reviewOptions} />}
      {tab === 'list'      && <CollectionListTab session={session} />}
      {tab === 'coming'    && <ComingSaturdayTab session={session} reviewOptions={reviewOptions} />}
      {tab === 'pastMonth' && <PastMonthTab session={session} />}
      {tab === 'history'   && <HistoryTab session={session} />}
    </div>
  )
}
