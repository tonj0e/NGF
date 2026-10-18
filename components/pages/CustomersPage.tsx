'use client'
import { useEffect, useState, useMemo } from 'react'
import CustomerHistory from '@/components/customers/CustomerHistory'
import { Session } from '@/types'
import DriveImage from '@/components/ui/DriveImage'
import LoansPage from './LoansPage'
import { parseReview } from '@/lib/reviews'
import StatusPill from '@/components/ui/StatusPill'

type Tab = 'customers' | 'active' | 'renewal' | 'completed'

function CustomerPhoto({ url, token, name }: { url: string; token: string; name: string }) {
  const [src, setSrc] = useState<string | null>(null)
  const fid = url?.match(/[?&]id=([^&]+)/)?.[1] || ''
  useEffect(() => {
    if (!fid) return
    fetch(`/api/drive/${fid}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.blob() : Promise.reject())
      .then(b => setSrc(URL.createObjectURL(b)))
      .catch(() => {})
  }, [fid])
  if (src) return <img src={src} alt={name} className="h-12 w-12 rounded-full object-cover ring-2 ring-white" />
  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1a1a2e] text-white text-sm font-bold ring-2 ring-white">
      {name?.charAt(0) || '?'}
    </div>
  )
}

function currency(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

const KYC_WEEKS = 40
function kycExpiry(joinedDate: string): string {
  if (!joinedDate) return ''
  const d = new Date(joinedDate)
  d.setDate(d.getDate() + KYC_WEEKS * 7)
  return d.toISOString().slice(0, 10)
}
function isKycExpired(joinedDate: string): boolean {
  const expiry = kycExpiry(joinedDate)
  if (!expiry) return false
  return new Date() > new Date(expiry)
}

function customerRating(joinedDate: string): { stars: number; label: string; duration: string } | null {
  if (!joinedDate) return null
  const joined = new Date(joinedDate)
  const now = new Date()
  const days = Math.floor((now.getTime() - joined.getTime()) / (1000 * 60 * 60 * 24))
  const months = Math.floor(days / 30)
  const years = Math.floor(days / 365)

  let duration = ''
  if (years >= 1) duration = `${years}yr${years > 1 ? 's' : ''}${months % 12 > 0 ? ` ${months % 12}mo` : ''}`
  else if (months >= 1) duration = `${months} month${months > 1 ? 's' : ''}`
  else duration = `${days} day${days !== 1 ? 's' : ''}`

  if (years >= 1) return { stars: 5, label: 'Best Customer', duration }
  if (months >= 8) return { stars: 4, label: duration, duration }
  if (months >= 5) return { stars: 3, label: duration, duration }
  if (months >= 1) return { stars: 1, label: duration, duration }
  return { stars: 1, label: duration, duration }
}

function StarBadge({ joinedDate }: { joinedDate: string }) {
  const r = customerRating(joinedDate)
  if (!r) return null
  return (
    <div className="flex items-center gap-1">
      <span className="text-yellow-400 text-xs leading-none">{'★'.repeat(r.stars)}{'☆'.repeat(5 - r.stars)}</span>
      <span className="text-[11px] text-[#697586] font-medium">{r.label}</span>
    </div>
  )
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-[#697586]">{label}</p>
      <p className="mt-1 text-sm">{value || '-'}</p>
    </div>
  )
}

function EditField({ name, label, value, occupation }: { name: string; label: string; value?: string; occupation?: boolean }) {
  return (
    <div>
      <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-[#697586]">{label}</p>
      {occupation ? (
        <select name={name} defaultValue={value || ''} className="mt-1 w-full rounded-xl border border-[#e5e7eb] bg-white px-3 py-2 text-sm outline-none focus:border-[#1a1a2e]">
          <option value="">Select</option>
          <option>House Wife</option>
          <option>Daily Wages</option>
          <option>Business Running Shop</option>
          <option>Employed in Private Firm</option>
        </select>
      ) : (
        <input name={name} defaultValue={value || ''} className="mt-1 w-full rounded-xl border border-[#e5e7eb] px-3 py-2 text-sm outline-none focus:border-[#1a1a2e]" />
      )}
    </div>
  )
}

function ActivitySpinner() {
  return <div className="flex h-32 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-[#1a1a2e] border-t-transparent" /></div>
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.5rem] border border-white/70 bg-white p-5 shadow-panel">
      <p className="text-xs text-[#697586]">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  )
}

function statusClass(s: string) {
  if (s === 'Paid') return 'bg-green-100 text-green-700'
  if (s === 'Overdue' || s === 'Not Paid') return 'bg-red-100 text-red-700'
  if (s === 'Delayed') return 'bg-amber-100 text-amber-700'
  return 'bg-[#f4f5f7] text-[#697586]'
}

type Period = 'all' | 'week' | 'month' | 'year'

function inPeriod(dateStr: string, period: Period): boolean {
  if (period === 'all') return true
  if (!dateStr) return false
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return false
  const now = new Date()
  if (period === 'year') return d.getFullYear() === now.getFullYear()
  if (period === 'month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  // week — Monday-start window containing today
  const startOfWeek = new Date(now)
  startOfWeek.setHours(0, 0, 0, 0)
  startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  const endOfWeek = new Date(startOfWeek)
  endOfWeek.setDate(startOfWeek.getDate() + 7)
  return d >= startOfWeek && d < endOfWeek
}

function TransactionTab({ rows, loading, startDate, loanId }: {
  rows: any[]; loading: boolean; startDate?: string; loanId?: string
}) {
  const [period, setPeriod] = useState<Period>('all')
  if (loading) return <ActivitySpinner />
  if (rows.length === 0) return <p className="rounded-2xl border border-dashed border-[#e5e7eb] bg-white p-8 text-center text-sm text-[#697586]">No transactions yet.</p>

  // Group repayments by loan so each loan gets its own disbursement + closure/payments.
  // A fully-paid loan is collapsed to a single "Loan Closed" line (close date + total
  // paid); an ongoing loan still lists each weekly payment.
  type Txn = { date: string; desc: string; debit: number; credit: number; order: number }
  const byLoan = new Map<string, any[]>()
  for (const r of rows) {
    const lid = r['Loan ID'] || ''
    if (!byLoan.has(lid)) byLoan.set(lid, [])
    byLoan.get(lid)!.push(r)
  }

  const txns: Txn[] = []
  for (const [lid, lrows] of byLoan) {
    const loanTotal = lrows.reduce((s, r) => s + Number(r['Amount'] || 0), 0)
    // Disbursement must come before any payment — anchor it to the earliest known
    // date for the loan (start date, any due date, or any paid date).
    const candidateDates = [
      (lid === loanId && startDate) ? startDate : '',
      ...lrows.map(r => r['Due Date']),
      ...lrows.map(r => r['Paid Date']),
    ].filter(Boolean).sort()
    const disburse = candidateDates[0] || ''
    txns.push({ date: disburse, desc: `Loan Disbursed${lid ? ` · ${lid}` : ''}`, debit: loanTotal, credit: 0, order: 0 })

    const paidRows = lrows.filter(r => r['Status'] === 'Paid')
    const allPaid = lrows.length > 0 && paidRows.length === lrows.length

    // Group payments by the date they were actually paid. Weeks paid individually
    // (one per date) stay as normal weekly rows; several weeks settled on the same
    // date is a bulk payment — and if it clears the loan, it's the early closure.
    const groups = new Map<string, any[]>()
    for (const r of paidRows.sort((a, b) => String(a['Paid Date']).localeCompare(String(b['Paid Date'])) || Number(a['Week No']) - Number(b['Week No']))) {
      const d = r['Paid Date'] || r['Due Date'] || ''
      if (!groups.has(d)) groups.set(d, [])
      groups.get(d)!.push(r)
    }
    const groupArr = [...groups.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])))

    groupArr.forEach(([date, grows], gi) => {
      const total = grows.reduce((s, r) => s + Number(r['Amount'] || 0), 0)
      const weeks = grows.map(r => Number(r['Week No'] || 0)).sort((a, b) => a - b)
      const isLastGroup = gi === groupArr.length - 1
      if (grows.length === 1) {
        txns.push({ date, desc: `Week ${weeks[0]} Payment`, debit: 0, credit: total, order: 1 })
      } else {
        const range = `Weeks ${weeks[0]}–${weeks[weeks.length - 1]}`
        const desc = (isLastGroup && allPaid) ? `Loan Closed · ${lid} (${range})` : `${range} Payment`
        txns.push({ date, desc, debit: 0, credit: total, order: 1 })
      }
    })
  }

  // Chronological order; disbursement (order 0) wins ties so it never sorts below a
  // same-day payment, keeping the running balance from going negative.
  txns.sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.order - b.order)
  let bal = 0
  const ledger = txns.map(t => { bal += t.debit - t.credit; return { ...t, balance: bal } })

  const totalDue = txns.reduce((s, t) => s + t.debit, 0)
  const totalCredit = txns.reduce((s, t) => s + t.credit, 0)
  const outstanding = Math.max(0, totalDue - totalCredit)

  const shown = ledger.filter(t => inPeriod(t.date, period))

  const periods: [Period, string][] = [['all', 'All'], ['week', 'This Week'], ['month', 'This Month'], ['year', 'This Year']]

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Loan Disbursed (Debit)" value={currency(totalDue)} />
        <StatCard label="Collected (Credit)" value={currency(totalCredit)} />
        <StatCard label="Outstanding" value={currency(outstanding)} />
      </div>

      <div className="flex gap-2 flex-wrap">
        {periods.map(([k, label]) => (
          <button key={k} type="button" onClick={() => setPeriod(k)}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${period === k ? 'bg-[#1a1a2e] text-white' : 'border border-[#e5e7eb] bg-white text-[#697586] hover:text-[#1a1a2e]'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-[1.75rem] border border-white/70 bg-white shadow-panel">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-black/5 bg-[#fafafa] text-[#697586]">
            <tr>
              <th className="px-5 py-3 font-medium text-xs">Date</th>
              <th className="px-5 py-3 font-medium text-xs">Description</th>
              <th className="px-5 py-3 font-medium text-xs text-right">Debit</th>
              <th className="px-5 py-3 font-medium text-xs text-right">Credit</th>
              <th className="px-5 py-3 font-medium text-xs text-right">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {shown.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-[#697586]">No transactions in this period.</td></tr>
            ) : shown.map((t, i) => (
              <tr key={i} className="hover:bg-[#fafafa]">
                <td className="px-5 py-3 text-[#697586] whitespace-nowrap">{t.date || '—'}</td>
                <td className="px-5 py-3 font-medium">{t.desc}</td>
                <td className="px-5 py-3 text-right font-semibold text-red-600">{t.debit ? `− ${currency(t.debit)}` : '—'}</td>
                <td className="px-5 py-3 text-right font-semibold text-green-700">{t.credit ? `+ ${currency(t.credit)}` : '—'}</td>
                <td className="px-5 py-3 text-right font-semibold">{currency(t.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ReviewsTab({ rows, loading }: { rows: any[]; loading: boolean }) {
  if (loading) return <ActivitySpinner />

  // Only the new star-rated reviews. Old-format reviews (no star rating) are ignored.
  const reviews = rows
    .map(r => ({ r, rev: parseReview(r['Notes'] || '') }))
    .filter((x): x is { r: any; rev: { rating: number; label: string } } => !!x.rev && x.rev.rating > 0)
    .sort((a, b) => String(b.r['Paid Date'] || b.r['Due Date']).localeCompare(String(a.r['Paid Date'] || a.r['Due Date'])))

  const total = reviews.length
  const avg = total ? reviews.reduce((s, x) => s + x.rev.rating, 0) / total : 0
  const positive = reviews.filter(x => x.rev.rating >= 4).length
  const negative = reviews.filter(x => x.rev.rating <= 2).length

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Reviews" value={String(total)} />
        <div className="rounded-[1.5rem] border border-white/70 bg-white p-5 shadow-panel">
          <p className="text-xs text-[#697586]">Average Rating</p>
          <p className="mt-1 flex items-center gap-2 text-2xl font-semibold">
            {avg.toFixed(1)}
            <span className="text-amber-400 text-base">{'★'.repeat(Math.round(avg))}{'☆'.repeat(5 - Math.round(avg))}</span>
          </p>
        </div>
        <div className="rounded-[1.5rem] border border-white/70 bg-white p-5 shadow-panel">
          <p className="text-xs text-[#697586]">Positive (4–5★)</p>
          <p className="mt-1 text-2xl font-semibold text-green-700">{positive}</p>
        </div>
        <div className="rounded-[1.5rem] border border-white/70 bg-white p-5 shadow-panel">
          <p className="text-xs text-[#697586]">Negative (1–2★)</p>
          <p className="mt-1 text-2xl font-semibold text-red-600">{negative}</p>
        </div>
      </div>

      {/* Review list */}
      {total === 0 ? (
        <p className="rounded-2xl border border-dashed border-[#e5e7eb] bg-white p-8 text-center text-sm text-[#697586]">No reviews recorded yet. Reviews are added with a star rating when an agent records a payment.</p>
      ) : (
      <div className="overflow-hidden rounded-[1.75rem] border border-white/70 bg-white shadow-panel divide-y divide-black/5">
        {reviews.map(({ r, rev }) => (
          <div key={r['Repayment ID']} className="flex items-start justify-between gap-4 px-5 py-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-amber-400 text-base leading-none">{'★'.repeat(rev.rating)}{'☆'.repeat(5 - rev.rating)}</span>
                <span className="text-xs font-semibold text-[#1a1a2e]">{rev.rating}/5</span>
              </div>
              {rev.label && <p className="mt-1 text-sm font-medium">{rev.label}</p>}
              <p className="mt-1 text-xs text-[#697586]">
                {r['Loan ID']} · Week {r['Week No']} · {currency(Number(r['Amount'] || 0))}
              </p>
            </div>
            <p className="shrink-0 text-xs text-[#697586]">{r['Paid Date'] || r['Due Date']}</p>
          </div>
        ))}
      </div>
      )}
    </div>
  )
}

function LoanCard({ loanId, loan, loanRows, currency }: { 
  loanId: string; 
  loan: any; 
  loanRows: any[]; 
  currency: (n: number) => string 
}) {
  // Memoize computed values
  const principal = useMemo(() => Number(loan['Principal Amount'] || 0), [loan['Principal Amount']])
  const weekly = useMemo(() => Number(loan['Weekly Collection Amount'] || 0), [loan['Weekly Collection Amount']])
  const duration = useMemo(() => Number(loan['Duration Weeks'] || 0), [loan['Duration Weeks']])
  const status = useMemo(() => loan['Status'] || 'Unknown', [loan['Status']])
  const startDate = useMemo(() => loan['Start Date'] || '', [loan['Start Date']])
  const endDate = useMemo(() => loan['End Date'] || '', [loan['End Date']])
  const agentName = useMemo(() => loan['Assigned Agent Name'] || '—', [loan['Assigned Agent Name']])
  const guarantorName = useMemo(() => loan['Guarantor Name'] || '—', [loan['Guarantor Name']])
  
  const paidRows = useMemo(() => loanRows.filter(r => r['Status'] === 'Paid'), [loanRows])
  const pendingRows = useMemo(() => loanRows.filter(r => r['Status'] !== 'Paid' && r['Status'] !== 'Waived'), [loanRows])
  const totalPaid = useMemo(() => paidRows.reduce((s, r) => s + Number(r['Amount'] || 0), 0), [paidRows])
  const totalPending = useMemo(() => pendingRows.reduce((s, r) => s + Number(r['Amount'] || 0), 0), [pendingRows])
  const totalAmount = principal
  const progress = useMemo(() => totalAmount > 0 ? Math.round((totalPaid / totalAmount) * 100) : 0, [totalPaid, totalAmount])
  const allPaid = pendingRows.length === 0

return (
    <div key={loanId} className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel overflow-hidden">
      {/* Loan Header */}
      <div className={`p-4 md:p-5 border-b border-black/5 ${allPaid ? 'bg-green-50' : ''}`}>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="min-w-0">
            <p className="text-lg font-semibold truncate">{loanId}</p>
            <p className="text-sm text-[#697586] mt-0.5 truncate">
              {startDate} to {endDate} · {duration} weeks · ₹{weekly}/week
            </p>
          </div>
          <div className="flex flex-col md:flex-row md:items-center gap-3 w-full md:w-auto">
            <StatusPill status={status} />
            <div className="w-full md:w-40 flex flex-col items-start md:items-end">
              <div className="w-full h-2 bg-[#e5e7eb] rounded-full overflow-hidden">
                <div className="h-full bg-green-600 transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-xs text-[#697586] mt-1 text-center md:text-right">{progress}% collected</p>
            </div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 mt-4 text-sm">
        <div className="p-3 bg-[#f9fafb] rounded-xl">
          <p className="text-[#697586] text-xs uppercase tracking-wider">Principal</p>
          <p className="font-semibold mt-1">{currency(principal)}</p>
        </div>
        <div className="p-3 bg-[#f9fafb] rounded-xl">
          <p className="text-[#697586] text-xs uppercase tracking-wider">Collected</p>
          <p className="font-semibold text-green-700 mt-1">{currency(totalPaid)}</p>
        </div>
        <div className="p-3 bg-[#f9fafb] rounded-xl">
          <p className="text-[#697586] text-xs uppercase tracking-wider">Pending</p>
          <p className="font-semibold text-red-600 mt-1">{currency(totalPending)}</p>
        </div>
        <div className="col-span-1 lg:col-span-3 p-3 bg-[#f9fafb] rounded-xl">
          <p className="text-[#697586] text-xs uppercase tracking-wider">Guarantor / Agent</p>
          <p className="font-semibold mt-1 truncate">{guarantorName} · {agentName}</p>
        </div>
      </div>

    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[600px]">
        <thead className="border-b border-black/5 bg-[#fafafa] text-[#697586]">
          <tr>
            <th className="px-3 md:px-5 py-2 font-medium text-xs">Week</th>
            <th className="px-3 md:px-5 py-2 font-medium text-xs">Due Date</th>
            <th className="px-3 md:px-5 py-2 font-medium text-xs">Paid Date</th>
            <th className="px-3 md:px-5 py-2 font-medium text-xs text-right">Amount</th>
            <th className="px-3 md:px-5 py-2 font-medium text-xs">Status</th>
            <th className="px-3 md:px-5 py-2 font-medium text-xs">Mode</th>
            <th className="px-3 md:px-5 py-2 font-medium text-xs">Notes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/5">
          {loanRows
            .sort((a, b) => Number(a['Week No'] || 0) - Number(b['Week No'] || 0))
            .map((r, i) => (
            <tr key={r['Repayment ID'] || i} className="hover:bg-[#fafafa]">
              <td className="px-3 md:px-5 py-2 font-medium">{r['Week No']}</td>
              <td className="px-3 md:px-5 py-2 text-[#697586]">{r['Due Date'] || '—'}</td>
              <td className="px-3 md:px-5 py-2">{r['Paid Date'] || (r['Status'] === 'Paid' ? 'Paid' : '—')}</td>
              <td className="px-3 md:px-5 py-2 text-right font-semibold">{currency(Number(r['Amount'] || 0))}</td>
              <td className="px-3 md:px-5 py-2"><StatusPill status={r['Status']} /></td>
              <td className="px-3 md:px-5 py-2 text-[#697586]">{r['Payment Mode'] || '—'}</td>
              <td className="px-3 md:px-5 py-2 text-[#697586] text-sm max-w-xs truncate">{r['Notes'] || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {pendingRows.length > 0 && (
      <div className="p-3 md:p-4 bg-[#fef3c7] border-t border-yellow-200">
        <p className="text-sm font-medium text-amber-800">⚠ {pendingRows.length} week(s) pending — Total: {currency(totalPending)}</p>
      </div>
    )}
  </div>
  )
}

function LoansTab({ rows, loading }: { rows: any[]; loading: boolean }) {
  if (loading) return <ActivitySpinner />

  // Group rows by Loan ID
  const byLoan = new Map<string, any[]>()
  for (const r of rows) {
    const loanId = r['Loan ID'] || 'Unknown'
    if (!byLoan.has(loanId)) byLoan.set(loanId, [])
    byLoan.get(loanId)!.push(r)
  }

  if (byLoan.size === 0) {
    return <p className="rounded-2xl border border-dashed border-[#e5e7eb] bg-white p-8 text-center text-sm text-[#697586]">No loan history found.</p>
  }

  return (
    <div className="space-y-4">
      {Array.from(byLoan.entries()).map(([loanId, loanRows]) => {
        const loan = loanRows[0]
        return <LoanCard key={loanId} loanId={loanId} loan={loan} loanRows={loanRows} currency={currency} />
      })}
    </div>
  )
}

export default function CustomersPage({ session }: { session: Session }) {
  const [tab, setTab] = useState<Tab>('customers')
  const [customers, setCustomers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [detail, setDetail] = useState<any | null>(null)
  const [editing, setEditing] = useState(false)
  const [deleteMode, setDeleteMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState('')
  const [photoUploads, setPhotoUploads] = useState<Record<string, string>>({})
  const [detailTab, setDetailTab] = useState<'details' | 'transaction' | 'reviews' | 'loans' | 'history'>('details')
  const [activity, setActivity] = useState<any[]>([])
  const [activityLoading, setActivityLoading] = useState(false)

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(''), 3000) }

  function handlePhotoSelect(key: string, file: File | null) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setPhotoUploads(prev => ({ ...prev, [key]: reader.result as string }))
    reader.readAsDataURL(file)
  }

  function toggleSelect(id: string) {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  async function deleteSelected() {
    if (!selected.size) return
    if (!confirm(`Delete ${selected.size} customer(s)? This cannot be undone.`)) return
    let successCount = 0
    for (const customerId of selected) {
      const res = await fetch('/api/customers', {
        method: 'DELETE', headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId }),
      })
      const json = await res.json()
      if (json.success) successCount++
      else console.error('Failed to delete customer:', customerId, json.error)
    }
    if (successCount > 0) showToast(`${successCount} customer(s) deleted.`)
    else showToast('Failed to delete customers.')
    setSelected(new Set())
    setDeleteMode(false)
    load()
  }

  function load() {
    fetch('/api/customers', { headers: { Authorization: `Bearer ${session.token}` } })
      .then(r => r.json()).then(j => { if (j.success) setCustomers(j.data.customers) }).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  // Pull this customer's repayment history for the Transaction & Reviews tabs
  useEffect(() => {
    if (!detail) return
    setDetailTab('details')
    setActivityLoading(true)
    fetch(`/api/repayments?customerId=${detail.customerId}`, { headers: { Authorization: `Bearer ${session.token}` } })
      .then(r => r.json())
      .then(j => { if (j.success) setActivity(j.data.rows || []) })
      .catch(() => {})
      .finally(() => setActivityLoading(false))
  }, [detail?.customerId])

  async function saveEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = e.currentTarget
    const g = (k: string) => (f.elements.namedItem(k) as HTMLInputElement)?.value || ''
    const res = await fetch('/api/customers', {
      method: 'PATCH', headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId: detail.customerId,
        name: g('name'), phone: g('phone'), address: g('address'),
        houseName: g('houseName'), place: g('place'), occupation: g('occupation'),
        accountNumber: g('accountNumber'), ifscCode: g('ifscCode'), panNo: g('panNo'),
        ...photoUploads,
      }),
    })
    const json = await res.json()
    if (json.success) {
      showToast('Customer updated.')
      setEditing(false)
      setPhotoUploads({})
      load()
      setDetail((d: any) => ({ ...d, name: g('name'), phone: g('phone'), address: g('address'), houseName: g('houseName'), place: g('place'), occupation: g('occupation'), accountNumber: g('accountNumber'), ifscCode: g('ifscCode'), panNo: g('panNo') }))
    } else showToast(json.error || 'Failed')
  }

  const filtered = customers.filter(c => {
    if (!search) return true
    const q = search.toLowerCase()
    return c.name.toLowerCase().includes(q) ||
      c.phone.includes(search) ||
      c.place.toLowerCase().includes(q) ||
      (c.activeLoanId && c.activeLoanId.toLowerCase().includes(q))
  })

  const TABS: { key: Tab; label: string }[] = session.role === 'Admin'
    ? [
        { key: 'customers', label: 'All Customers' },
        { key: 'active',    label: 'Active Loans' },
        { key: 'renewal',   label: 'Renewal Eligible' },
        { key: 'completed', label: 'Completed Loans' },
      ]
    : [{ key: 'customers', label: 'All Customers' }]

  const tabBar = (
    <div className="flex gap-2 flex-wrap mb-1">
      {TABS.map(t => (
        <button key={t.key} onClick={() => { setTab(t.key); setDetail(null); setEditing(false) }}
          className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${tab === t.key ? 'bg-[#1a1a2e] text-white' : 'border border-[#e5e7eb] bg-white text-[#697586] hover:text-[#1a1a2e]'}`}>
          {t.label}
        </button>
      ))}
    </div>
  )

  function viewCustomerById(customerId: string) {
    const customer = customers.find(c => c.customerId === customerId)
    if (customer) { setDetail(customer); setEditing(false) }
  }

  // Detail view — shown from any tab
  if (detail) return (
    <div className="space-y-5">
      {tabBar}
      {toast && <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-2xl bg-[#1a1a2e] px-5 py-3 text-sm font-medium text-white shadow-lg">{toast}</div>}
      <div className="flex items-center gap-3">
        <button onClick={() => { setDetail(null); setEditing(false) }} className="rounded-2xl border border-[#e5e7eb] bg-white px-4 py-2 text-sm font-semibold">Back</button>
        <CustomerPhoto url={detail.customerPhotoUrl} token={session.token} name={detail.name} />
        <div className="flex-1">
          <p className="text-lg font-semibold">{detail.name}</p>
          {detail.activeLoanId && <p className="font-mono text-sm text-[#697586]">{detail.activeLoanId}{detail.loanAccountNo && <span className="ml-2 text-xs">· {detail.loanAccountNo}</span>}</p>}
          <StarBadge joinedDate={detail.joinedDate} />
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${detail.isOverdue ? 'bg-red-100 text-red-700' : detail.loanStatus === 'Active' ? 'bg-green-100 text-green-700' : 'bg-[#f4f5f7] text-[#697586]'}`}>
          {detail.isOverdue ? 'Overdue' : detail.loanStatus === 'Active' ? 'Active' : 'Inactive'}
        </span>
      </div>

      {isKycExpired(detail.joinedDate) && (
        <div className="flex items-center gap-3 rounded-[1.75rem] border border-orange-300 bg-orange-50 px-5 py-4">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0 text-orange-500" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L1 21h22L12 2zm0 3.5L20.5 19h-17L12 5.5zM11 10v4h2v-4h-2zm0 6v2h2v-2h-2z"/>
          </svg>
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-orange-700">KYC Updation Required</p>
            <p className="text-xs text-orange-600">KYC expired on {kycExpiry(detail.joinedDate)} — update documents before issuing a new loan</p>
          </div>
        </div>
      )}

      {/* Detail sub-tabs */}
      <div className="flex gap-2 flex-wrap">
        {([['details', 'Customer Details'], ['transaction', 'Transaction'], ['reviews', 'Reviews'], ['loans', 'Loans & Payments'], ['history', 'History & Score']] as const).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setDetailTab(k)}
            className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${detailTab === k ? 'bg-[#1a1a2e] text-white' : 'border border-[#e5e7eb] bg-white text-[#697586] hover:text-[#1a1a2e]'}`}>
            {label}
          </button>
        ))}
      </div>

      {detailTab === 'transaction' && <TransactionTab rows={activity} loading={activityLoading} startDate={detail.startDate} loanId={detail.activeLoanId} />}
      {detailTab === 'reviews' && <ReviewsTab rows={activity} loading={activityLoading} />}
      {detailTab === 'loans' && <LoansTab rows={activity} loading={activityLoading} />}
      {detailTab === 'history' && <CustomerHistory session={session} customerId={detail.customerId} />}

      {detailTab === 'details' && (
      <form onSubmit={saveEdit} className="space-y-4">
          <div className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel flex items-center justify-between px-6 py-4">
            <p className="text-sm font-semibold">Customer Details</p>
            {session.role === 'Admin' && !editing && (
              <button type="button" onClick={() => setEditing(true)} className="rounded-xl bg-[#f4f5f7] px-3 py-2 text-xs font-semibold">Edit</button>
            )}
            {editing && (
              <div className="flex gap-2">
                <button type="submit" className="rounded-xl bg-[#1a1a2e] px-4 py-2 text-xs font-semibold text-white">Save</button>
                <button type="button" onClick={() => setEditing(false)} className="rounded-xl border border-[#e5e7eb] px-4 py-2 text-xs font-semibold">Cancel</button>
              </div>
            )}
          </div>

          <div className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel p-6 space-y-4">
            <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-[#697586]">Personal</p>
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
              {editing ? (
                <>
                  <EditField name="name" label="Full Name" value={detail.name} />
                  <EditField name="phone" label="Phone" value={detail.phone} />
                  <EditField name="occupation" label="Occupation" value={detail.occupation} occupation />
                  <EditField name="accountNumber" label="Account Number" value={detail.accountNumber} />
                  <EditField name="ifscCode" label="IFSC Code" value={detail.ifscCode} />
                  <EditField name="panNo" label="PAN No" value={detail.panNo} />
                </>
              ) : (
                <>
                  <Field label="Full Name" value={detail.name} />
                  <Field label="Phone" value={detail.phone} />
                  <Field label="Occupation" value={detail.occupation} />
                  {detail.accountNumber && <Field label="Account Number" value={detail.accountNumber} />}
                  {detail.ifscCode && <Field label="IFSC Code" value={detail.ifscCode} />}
                  {detail.panNo && <Field label="PAN No" value={detail.panNo} />}
                </>
              )}
              <Field label="Guarantor" value={`${detail.guarantorName}${detail.guarantorCode ? ` (${detail.guarantorCode})` : ''}`} />
              <Field label="Agent" value={detail.agentName} />
              {detail.aadhaarNo && <Field label="Aadhaar No" value={detail.aadhaarNo} />}
              {detail.joinedDate && <Field label="Joined Date" value={detail.joinedDate} />}
              {detail.joinedDate && (
                <div>
                  <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-[#697586]">KYC Expiry</p>
                  <p className={`mt-1 text-sm font-semibold ${isKycExpired(detail.joinedDate) ? 'text-orange-600' : 'text-green-700'}`}>
                    {kycExpiry(detail.joinedDate)}
                    <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${isKycExpired(detail.joinedDate) ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                      {isKycExpired(detail.joinedDate) ? 'EXPIRED' : 'VALID'}
                    </span>
                  </p>
                </div>
              )}
            </div>
          </div>

          {(detail.nomineeName || detail.nomineePhone) && (
            <div className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel p-6 space-y-4">
              <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-[#697586]">Nominee</p>
              <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
                <Field label="Nominee Name" value={detail.nomineeName} />
                <Field label="Nominee Phone" value={detail.nomineePhone} />
              </div>
            </div>
          )}

          <div className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel p-6 space-y-4">
            <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-[#697586]">Address</p>
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
              {editing ? (
                <>
                  <EditField name="houseName" label="House Name" value={detail.houseName} />
                  <EditField name="address" label="Address" value={detail.address} />
                  <EditField name="place" label="Place" value={detail.place} />
                </>
              ) : (
                <>
                  <Field label="House Name" value={detail.houseName} />
                  <Field label="Address" value={detail.address} />
                  <Field label="Place" value={detail.place} />
                </>
              )}
            </div>
          </div>

          {detail.activeLoanId && (
            <div className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel p-6 space-y-4">
              <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-[#697586]">Active Loan</p>
              <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
                <Field label="Loan ID" value={detail.activeLoanId} />
                <Field label="Weekly EMI" value={currency(Number(detail.weeklyAmount))} />
                <Field label="Principal" value={currency(Number(detail.principal))} />
                <Field label="Start Date" value={detail.startDate} />
                <Field label="End Date" value={detail.endDate} />
                <Field label="Loan Status" value={detail.loanStatus} />
                {detail.mapsLink && (
                  <div>
                    <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-[#697586] mb-2">Location</p>
                    <a href={detail.mapsLink} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl bg-[#1a1a2e] px-4 py-2 text-xs font-semibold text-white">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                      </svg>
                      Locate on Map
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel p-6 space-y-4">
            <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-[#697586]">Documents</p>
            {editing ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {([
                  ['customerPhoto', 'Customer Photo', detail.customerPhotoUrl],
                  ['aadhaarFront',  'Aadhaar Front',  detail.aadhaarFrontUrl],
                  ['aadhaarBack',   'Aadhaar Back',   detail.aadhaarBackUrl],
                  ['housePhoto',    'House Photo',    detail.housePhotoUrl],
                  ['landmarkPhoto', 'Landmark Photo', detail.landmarkPhotoUrl],
                  ['chequePhoto',   'Cheque Photo',   detail.chequePhotoUrl],
                ] as [string, string, string][]).map(([key, label, currentUrl]) => (
                  <div key={key}>
                    <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-[#697586] mb-2">{label}</p>
                    {photoUploads[key] ? (
                      <img src={photoUploads[key]} alt={label} className="mb-2 h-32 w-full rounded-xl object-cover border border-[#e5e7eb]" />
                    ) : currentUrl ? (
                      <div className="mb-2 h-32 w-full rounded-xl border border-[#e5e7eb] bg-[#f4f5f7] flex items-center justify-center text-xs text-[#697586]">Current image</div>
                    ) : (
                      <div className="mb-2 h-32 w-full rounded-xl border border-dashed border-[#e5e7eb] bg-[#f9fafb] flex items-center justify-center text-xs text-[#697586]">Not uploaded</div>
                    )}
                    <input type="file" accept="image/*"
                      onChange={e => handlePhotoSelect(key, e.target.files?.[0] || null)}
                      className="w-full rounded-xl border border-[#e5e7eb] bg-white px-3 py-2 text-xs text-[#697586]" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                <DriveImage url={detail.customerPhotoUrl} label="Customer Photo" token={session.token} />
                <DriveImage url={detail.aadhaarFrontUrl} label="Aadhaar Front" token={session.token} />
                <DriveImage url={detail.aadhaarBackUrl} label="Aadhaar Back" token={session.token} />
                <DriveImage url={detail.housePhotoUrl} label="House Photo" token={session.token} />
                <DriveImage url={detail.landmarkPhotoUrl} label="Landmark Photo" token={session.token} />
                <DriveImage url={detail.chequePhotoUrl} label="Cheque Photo" token={session.token} />
              </div>
            )}
          </div>
        </form>
      )}
    </div>
  )

  if (tab === 'active')    return <div className="space-y-4">{tabBar}<LoansPage session={session} defaultFilter="active" customers={customers} onViewCustomer={viewCustomerById} /></div>
  if (tab === 'renewal')   return <div className="space-y-4">{tabBar}<LoansPage session={session} defaultFilter="renewal" customers={customers} onViewCustomer={viewCustomerById} /></div>
  if (tab === 'completed') return <div className="space-y-4">{tabBar}<LoansPage session={session} defaultFilter="completed" customers={customers} onViewCustomer={viewCustomerById} /></div>

  if (loading) return <div className="space-y-4">{tabBar}<div className="flex h-40 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-[#1a1a2e] border-t-transparent" /></div></div>

  return (
    <div className="space-y-4">
      {tabBar}
      {toast && <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-2xl bg-[#1a1a2e] px-5 py-3 text-sm font-medium text-white shadow-lg">{toast}</div>}
      <div className="flex items-center gap-3 flex-wrap">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone, place…"
          data-no-upper className="flex-1 min-w-0 max-w-sm rounded-2xl border border-[#e5e7eb] bg-white px-4 py-2.5 text-sm outline-none focus:border-[#1a1a2e]" />
        {session.role === 'Admin' && !deleteMode && (
          <button onClick={() => { setDeleteMode(true); setSelected(new Set()) }}
            className="rounded-2xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600">
            Delete
          </button>
        )}
        {deleteMode && (
          <>
            <span className="text-sm text-[#697586]">{selected.size} selected</span>
            <button onClick={deleteSelected} disabled={!selected.size}
              className="rounded-2xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
              Confirm Delete
            </button>
            <button onClick={() => { setDeleteMode(false); setSelected(new Set()) }}
              className="rounded-2xl border border-[#e5e7eb] px-4 py-2.5 text-sm font-semibold">
              Cancel
            </button>
          </>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map(c => (
          <div key={c.customerId}
            onClick={() => deleteMode && toggleSelect(c.customerId)}
            className={`rounded-[1.75rem] border bg-white p-5 shadow-panel space-y-3 transition ${deleteMode ? 'cursor-pointer' : ''} ${selected.has(c.customerId) ? 'border-red-400 bg-red-50' : 'border-white/70'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                {deleteMode && (
                  <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${selected.has(c.customerId) ? 'border-red-500 bg-red-500' : 'border-[#e5e7eb]'}`}>
                    {selected.has(c.customerId) && <span className="text-white text-[10px] font-bold">✓</span>}
                  </div>
                )}
                <CustomerPhoto url={c.customerPhotoUrl} token={session.token} name={c.name} />
                <div>
                  <p className="font-semibold">{c.name}</p>
                  <p className="text-xs text-[#697586]">{c.phone}</p>
                  {c.activeLoanId && <p className="font-mono text-[11px] text-[#697586]">{c.activeLoanId}</p>}
                  <StarBadge joinedDate={c.joinedDate} />
                  {isKycExpired(c.joinedDate) && (
                    <span className="mt-1 inline-block rounded-lg bg-orange-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-700">KYC Updation Required</span>
                  )}
                </div>
              </div>
              <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${c.isOverdue ? 'bg-red-100 text-red-700' : c.loanStatus === 'Active' ? 'bg-green-100 text-green-700' : 'bg-[#f4f5f7] text-[#697586]'}`}>
                {c.isOverdue ? 'Overdue' : c.loanStatus === 'Active' ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><p className="text-[#697586]">Guarantor</p><p className="font-medium">{c.guarantorName || '—'} {c.guarantorCode ? `(${c.guarantorCode})` : ''}</p></div>
              <div><p className="text-[#697586]">Agent</p><p className="font-medium">{c.agentName || '—'}</p></div>
              <div><p className="text-[#697586]">Occupation</p><p className="font-medium">{c.occupation || '—'}</p></div>
              <div><p className="text-[#697586]">Place</p><p className="font-medium">{c.place || '—'}</p></div>
              {c.activeLoanId && <>
                <div><p className="text-[#697586]">Loan ID</p><p className="font-medium font-mono text-[11px]">{c.activeLoanId}</p></div>
                <div><p className="text-[#697586]">Weekly EMI</p><p className="font-medium">{currency(Number(c.weeklyAmount))}</p></div>
              </>}
            </div>
            {c.address && <p className="text-xs text-[#697586]">{c.houseName ? `${c.houseName}, ` : ''}{c.address}</p>}
            {!deleteMode && (
              <div className="flex gap-2 pt-1">
                <button onClick={() => { setDetail(c); setEditing(false) }} className="rounded-xl border border-[#e5e7eb] px-3 py-1.5 text-xs font-semibold">View</button>
                {session.role === 'Admin' && <button onClick={() => { setDetail(c); setEditing(true) }} className="rounded-xl bg-[#f4f5f7] px-3 py-1.5 text-xs font-semibold">Edit</button>}
              </div>
            )}
          </div>
        ))}
      </div>
      {filtered.length === 0 && <p className="py-10 text-center text-sm text-[#697586]">No customers found.</p>}
    </div>
  )
}
