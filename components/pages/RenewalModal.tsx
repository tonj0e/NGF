'use client'
import { useEffect, useState } from 'react'
import { Session } from '@/types'
import { apiSend } from '@/lib/clientApi'
import { evaluateRenewal } from '@/lib/reviews'
import NgfScoreBadge from '@/components/ui/NgfScoreBadge'

function currency(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

type Eval = { loading: boolean; eligible: boolean; reasons: string[]; rating: number; reviewCount: number }

export default function RenewalModal({ session, onClose, onDone }: {
  session: Session; onClose: () => void; onDone: () => void
}) {
  const [search, setSearch] = useState('')
  const [customers, setCustomers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/customers', { headers: { Authorization: `Bearer ${session.token}` } })
      .then(r => r.json())
      .then(j => { if (j.success) setCustomers(j.data.customers) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [session.token])

  const [evals, setEvals] = useState<Record<string, Eval>>({})

  const q = search.toLowerCase().trim()
  const filtered = q ? customers.filter(c =>
    c.name.toLowerCase().includes(q) ||
    c.phone.includes(q) ||
    (c.aadhaarNo || '').slice(-4) === q ||
    (c.customerId || '').toLowerCase().slice(-4) === q ||
    (c.activeLoanId || '').toLowerCase().slice(-4) === q
  ) : []

  // Fetch each matched customer's repayment history and judge renewal eligibility
  // (dues / delayed payments / rating). Cached per customer in `evals`.
  const filteredIds = filtered.map(c => c.customerId).join(',')
  useEffect(() => {
    filtered.forEach(c => {
      if (evals[c.customerId]) return
      setEvals(prev => ({ ...prev, [c.customerId]: { loading: true, eligible: false, reasons: [], rating: 0, reviewCount: 0 } }))
      fetch(`/api/repayments?customerId=${c.customerId}`, { headers: { Authorization: `Bearer ${session.token}` } })
        .then(r => r.json())
        .then(j => {
          const rows = j.success ? (j.data.rows || []) : []
          const base = evaluateRenewal(rows)
          const extra: string[] = []
          if (c.permanentBlock) extra.push('Closed permanently. An admin must re-admit this customer first.')
          else if (c.holdUntil) extra.push(`On hold until ${c.holdUntil} (the loan was closed early).`)
          if (c.loanStatus === 'Active') extra.push('The current loan is still running.')
          setEvals(prev => ({ ...prev, [c.customerId]: { loading: false, ...base, eligible: base.eligible && extra.length === 0, reasons: [...extra, ...base.reasons] } }))
        })
        .catch(() => setEvals(prev => ({ ...prev, [c.customerId]: { loading: false, eligible: false, reasons: ['Could not load history'], rating: 0, reviewCount: 0 } })))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredIds])

  async function requestRenewal(c: any) {
    setSubmitting(c.customerId)
    setError('')
    try {
      const res = await apiSend(session.token, 'POST', '/api/leads', {
        customerName: c.name,
        phone: c.phone,
        place: c.place || '',
        address: c.address || '',
        loanProduct: 'RENEWAL',
        notes: `Renewal request — Customer ID: ${c.customerId}`,
      })
      if (!res.ok) { setError(res.error || 'Failed to submit'); return }
      setSubmitted(c.customerId)
      onDone()
    } catch {
      setError('Something went wrong.')
    } finally {
      setSubmitting(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-[1.75rem] bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-black/5 flex items-center justify-between">
          <div>
            <p className="font-semibold text-sm">Request Renewal</p>
            <p className="text-xs text-soft mt-0.5">Search your customer to check eligibility</p>
          </div>
          <button onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-mist text-soft hover:text-ink transition text-lg font-bold">
            ✕
          </button>
        </div>

        {/* Search */}
        <div className="px-6 pt-5 pb-3">
          <input
            value={search} onChange={e => setSearch(e.target.value)} autoFocus
            placeholder="Name, phone, Aadhaar last 4, or Loan ID last 4…"
            data-no-upper
            className="w-full rounded-2xl border border-line bg-mist px-4 py-3 text-sm outline-none focus:border-ink focus:bg-white transition"
          />
        </div>

        {/* Results */}
        <div className="px-6 pb-6 space-y-3 max-h-96 overflow-y-auto">
          {loading && (
            <div className="flex justify-center py-6">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-ink border-t-transparent" />
            </div>
          )}
          {!loading && !q && (
            <p className="py-4 text-center text-xs text-soft">Type to search your customers</p>
          )}
          {!loading && q && filtered.length === 0 && (
            <p className="py-4 text-center text-sm text-soft">No customer found.</p>
          )}
          {!loading && filtered.map(c => {
            const ev = evals[c.customerId]
            const checking = !ev || ev.loading
            const eligible = !!ev && !ev.loading && ev.eligible
            const isDone = submitted === c.customerId
            return (
              <div key={c.customerId} className={`rounded-2xl border p-4 space-y-3 ${checking ? 'border-line bg-panel' : eligible ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm">{c.name}</p>
                    <p className="text-xs text-soft">{c.phone}</p>
                    <div className="mt-0.5"><NgfScoreBadge value={c.ngfScore} band={c.ngfBand} reviews={c.ngfReviews} average={c.ngfAverage} /></div>
                    {c.activeLoanId && <p className="font-mono text-[11px] text-soft mt-0.5">{c.activeLoanId}</p>}
                    {c.principal && (
                      <p className="text-xs text-soft">Principal: {currency(Number(c.principal))} · {c.loanStatus}</p>
                    )}
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${checking ? 'bg-mist text-soft' : eligible ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                    {checking ? 'Checking…' : eligible ? 'Eligible' : 'Not Eligible'}
                  </span>
                </div>

                {/* Rating / review summary */}
                {!checking && (
                  ev.reviewCount > 0 ? (
                    <p className="flex items-center gap-1.5 text-xs text-soft">
                      <span className="text-amber-400">{'★'.repeat(Math.round(ev.rating))}{'☆'.repeat(5 - Math.round(ev.rating))}</span>
                      {ev.rating.toFixed(1)}/5 · {ev.reviewCount} review{ev.reviewCount !== 1 ? 's' : ''}
                    </p>
                  ) : (
                    <p className="text-xs text-soft">No reviews on record</p>
                  )
                )}

                {!checking && !eligible && ev.reasons.length > 0 && (
                  <ul className="space-y-0.5">
                    {ev.reasons.map((r, i) => (
                      <li key={i} className="text-xs text-red-600">• {r}</li>
                    ))}
                  </ul>
                )}

                {eligible && !isDone && (
                  <div className="flex gap-2">
                    <button onClick={onClose}
                      className="flex-1 rounded-xl border border-line bg-white py-2 text-xs font-semibold hover:bg-mist transition">
                      Close
                    </button>
                    <button onClick={() => requestRenewal(c)} disabled={submitting === c.customerId}
                      className="flex-1 rounded-xl bg-green-500 py-2 text-xs font-semibold text-white hover:bg-green-600 disabled:opacity-50 transition">
                      {submitting === c.customerId ? 'Sending…' : 'Request Renewal'}
                    </button>
                  </div>
                )}

                {isDone && (
                  <div className="rounded-xl bg-green-100 px-3 py-2 text-xs font-semibold text-green-700 text-center">
                    ✓ Renewal request sent successfully!
                  </div>
                )}
              </div>
            )
          })}
          {error && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-xs text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  )
}
