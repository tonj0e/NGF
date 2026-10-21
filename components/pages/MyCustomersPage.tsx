'use client'
import { useEffect, useState } from 'react'
import NgfScoreBadge from '@/components/ui/NgfScoreBadge'
import { Session } from '@/types'
import LoansPage from './LoansPage'

type SubTab = 'customers' | 'approved' | 'overdue'

function DriveImg({ url, token, alt, className }: { url: string; token: string; alt: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null)
  const fid = url?.match(/[?&]id=([^&]+)/)?.[1] || url?.match(/\/d\/([^/]+)/)?.[1] || ''
  useEffect(() => {
    if (!fid) return
    fetch(`/api/drive/${fid}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (!r.ok) throw new Error(); return r.blob() })
      .then(b => setSrc(URL.createObjectURL(b)))
      .catch(() => {})
  }, [fid, token])
  if (!src) return <div className={`${className} bg-[#f4f5f7]`} />
  return <img src={src} alt={alt} className={className} />
}

function currency(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-[#697586]">{label}</p>
      <p className="mt-0.5 text-sm font-medium">{value}</p>
    </div>
  )
}

function PhotoCard({ label, url, token }: { label: string; url: string; token: string }) {
  if (!url) return null
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#697586]">{label}</p>
      <div className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-[#f4f5f7]">
        <DriveImg url={url} token={token} alt={label} className="w-full h-64 object-cover" />
      </div>
    </div>
  )
}

export default function MyCustomersPage({ session }: { session: Session }) {
  const [subTab, setSubTab] = useState<SubTab>('customers')
  const [customers, setCustomers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<any | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 20000)
    fetch('/api/customers', { headers: { Authorization: `Bearer ${session.token}` }, signal: ctrl.signal })
      .then(r => r.json())
      .then(j => { if (j.success) setCustomers(j.data.customers) })
      .catch(() => {})
      .finally(() => { clearTimeout(timer); setLoading(false) })
  }, [session.token])

  const filtered = customers.filter(c => {
    if (!search) return true
    const q = search.toLowerCase()
    return c.name.toLowerCase().includes(q) || c.phone.includes(search) ||
      c.place?.toLowerCase().includes(q) || c.activeLoanId?.toLowerCase().includes(q)
  })

  const tabs: { key: SubTab; label: string }[] = [
    { key: 'customers', label: 'My Customers' },
    { key: 'approved',  label: 'Approved Loans' },
    { key: 'overdue',   label: 'Overdue Loans' },
  ]

  if (subTab === 'approved') return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${subTab === t.key ? 'bg-[#1a1a2e] text-white' : 'border border-[#e5e7eb] bg-white text-[#697586] hover:text-[#1a1a2e]'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <LoansPage session={session} defaultFilter="active" />
    </div>
  )

  if (subTab === 'overdue') return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${subTab === t.key ? 'bg-[#1a1a2e] text-white' : 'border border-[#e5e7eb] bg-white text-[#697586] hover:text-[#1a1a2e]'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <LoansPage session={session} defaultFilter="overdue" />
    </div>
  )

  if (loading) return (
    <div className="flex h-40 items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#1a1a2e] border-t-transparent" />
    </div>
  )

  if (detail) return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => setDetail(null)} className="rounded-2xl border border-[#e5e7eb] bg-white px-4 py-2 text-sm font-semibold">Back</button>
        <div className="flex items-center gap-3">
          {detail.customerPhotoUrl && (
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-[#e5e7eb]">
              <DriveImg url={detail.customerPhotoUrl} token={session.token} alt={detail.name} className="h-full w-full object-cover" />
            </div>
          )}
          <div>
            <p className="font-semibold text-lg">{detail.name}</p>
            {detail.activeLoanId && <p className="font-mono text-sm text-[#697586]">{detail.activeLoanId}</p>}
          </div>
        </div>
        <span className={`ml-auto rounded-full px-3 py-1 text-xs font-semibold ${detail.isOverdue ? 'bg-red-100 text-red-700' : detail.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-[#f4f5f7] text-[#697586]'}`}>
          {detail.isOverdue ? 'Overdue' : detail.status}
        </span>
      </div>

      <div className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel divide-y divide-black/5">
        {/* Personal + Nominee merged */}
        <div className="p-6 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#697586]">Personal</p>
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
            <Field label="Full Name" value={detail.name} />
            <Field label="Phone" value={detail.phone} />
            <Field label="Occupation" value={detail.occupation} />
            <Field label="Aadhaar No" value={detail.aadhaarNo} />
            <Field label="Nominee Name" value={detail.nomineeName} />
            <Field label="Nominee Phone" value={detail.nomineePhone} />
            <Field label="PAN No" value={detail.panNo} />
          </div>
        </div>

        {/* Address */}
        <div className="p-6 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#697586]">Address</p>
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
            <Field label="House Name" value={detail.houseName} />
            <Field label="Address" value={detail.address} />
            <Field label="Place" value={detail.place} />
          </div>
        </div>

        {/* Active Loan */}
        {detail.activeLoanId && (
          <div className="p-6 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#697586]">Active Loan</p>
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
              <Field label="Loan ID" value={detail.activeLoanId} />
              <Field label="Weekly EMI" value={detail.weeklyAmount ? currency(Number(detail.weeklyAmount)) : undefined} />
              <Field label="Principal" value={detail.principal ? currency(Number(detail.principal)) : undefined} />
              <Field label="Start Date" value={detail.startDate} />
              <Field label="End Date" value={detail.endDate} />
              <Field label="Loan Status" value={detail.loanStatus} />
              {detail.mapsLink && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#697586] mb-2">Location</p>
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

        {/* Documents */}
        {(detail.customerPhotoUrl || detail.aadhaarFrontUrl || detail.aadhaarBackUrl || detail.housePhotoUrl || detail.landmarkPhotoUrl) && (
          <div className="p-6 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#697586]">Documents</p>
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              <PhotoCard label="Customer Photo" url={detail.customerPhotoUrl} token={session.token} />
              <PhotoCard label="Aadhaar Front" url={detail.aadhaarFrontUrl} token={session.token} />
              <PhotoCard label="Aadhaar Back" url={detail.aadhaarBackUrl} token={session.token} />
              <PhotoCard label="House Photo" url={detail.housePhotoUrl} token={session.token} />
              <PhotoCard label="Landmark Photo" url={detail.landmarkPhotoUrl} token={session.token} />
              <PhotoCard label="Cheque Photo" url={detail.chequePhotoUrl} token={session.token} />
            </div>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${subTab === t.key ? 'bg-[#1a1a2e] text-white' : 'border border-[#e5e7eb] bg-white text-[#697586] hover:text-[#1a1a2e]'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search name, phone, place..." data-no-upper
        className="w-full rounded-2xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm outline-none focus:border-[#1a1a2e]" />

      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[#e5e7eb] bg-white p-8 text-center text-sm text-[#697586]">No customers found.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map(c => (
            <div key={c.customerId} className="rounded-[1.75rem] border border-white/70 bg-white p-5 shadow-panel space-y-3">
              <div className="flex items-center gap-3">
                {c.customerPhotoUrl ? (
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-[#e5e7eb]">
                    <DriveImg url={c.customerPhotoUrl} token={session.token} alt={c.name} className="h-full w-full object-cover" />
                  </div>
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#f4f5f7] text-sm font-semibold text-[#697586]">
                    {c.name.charAt(0)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate">{c.name}</p>
                  <p className="text-xs text-[#697586]">{c.phone}</p>
                  {c.activeLoanId && <p className="font-mono text-[11px] text-[#697586]">{c.activeLoanId}</p>}
                  <div className="mt-1"><NgfScoreBadge value={c.ngfScore} band={c.ngfBand} reviews={c.ngfReviews} average={c.ngfAverage} /></div>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${c.isOverdue ? 'bg-red-100 text-red-700' : c.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-[#f4f5f7] text-[#697586]'}`}>
                  {c.isOverdue ? 'Overdue' : c.status}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><p className="text-[#697586]">Occupation</p><p className="font-medium">{c.occupation || '—'}</p></div>
                <div><p className="text-[#697586]">Place</p><p className="font-medium">{c.place || '—'}</p></div>
                {c.activeLoanId && <>
                  <div><p className="text-[#697586]">Weekly EMI</p><p className="font-medium">{currency(Number(c.weeklyAmount))}</p></div>
                  <div><p className="text-[#697586]">Principal</p><p className="font-medium">{currency(Number(c.principal))}</p></div>
                </>}
              </div>
              {c.address && <p className="text-xs text-[#697586]">{c.houseName ? `${c.houseName}, ` : ''}{c.address}</p>}
              <button onClick={() => setDetail(c)}
                className="w-full rounded-xl border border-[#e5e7eb] px-3 py-2 text-xs font-semibold hover:bg-[#f4f5f7] transition">
                View Details
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
