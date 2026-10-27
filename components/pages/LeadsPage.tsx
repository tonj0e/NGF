'use client'
import { useEffect, useRef, useState, useMemo } from 'react'
import Pager from '@/components/ui/Pager'
import { Session, Lead } from '@/types'
import StatusPill from '@/components/ui/StatusPill'
import DriveImage from '@/components/ui/DriveImage'
import SubmitLeadPage from './SubmitLeadPage'
import RenewalModal from './RenewalModal'
import LeadsHistoryWeeks from './LeadsHistoryWeeks'
import RenewalApproveModal from './RenewalApproveModal'
import DisburseQueue from './DisburseQueue'
import { buildLeadNoteData, buildPromissoryHtml, PROMISSORY_TEMPLATE_KEY, DEFAULT_PROMISSORY_BODY } from '@/lib/promissoryNote'

// a lead is "completed" for the guarantor once the agent has submitted the verification (it then waits for the admin)
const DONE_STATUSES = ['Verification Submitted', 'Approved']

type LeadTab = 'new' | 'history' | 'renewal' | 'disbursements'

function currencyInr(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

// Local YYYY-MM-DD (avoids the UTC shift that toISOString() introduces)
function ymdLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + days); return ymdLocal(d)
}

// Monday (local) of the week containing the given YYYY-MM-DD date
function weekStartIso(dateStr: string): string {
  const d = new Date(dateStr.slice(0, 10) + 'T00:00:00')
  if (isNaN(d.getTime())) return ''
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return ymdLocal(d)
}

// Monday–Saturday range label for a week (keyed by its Monday)
function weekRangeLabel(weekIso: string): string {
  const start = new Date(weekIso + 'T00:00:00')
  const end = new Date(start); end.setDate(end.getDate() + 5)
  const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')} ${d.toLocaleString('en-IN', { month: 'short' })}`
  return `${fmt(start)} – ${fmt(end)} ${end.getFullYear()}`
}

// `perms`: what a Staff user may do (role defaults + extras). Admin and other roles are not limited here; the server checks every action too.
const hasPart = (perms: string[] | undefined, part: string) => !perms || perms.includes('leads') || perms.includes(part)

export default function LeadsPage({ session, perms }: { session: Session; perms?: string[] }) {
  const can = (part: string) => session.role !== 'Staff' || hasPart(perms, part)
  // Staff accounts manage leads/disbursements like an admin
  const isManager = session.role === 'Admin' || session.role === 'Staff'
  const isCollectionAgent = session.role === 'NGF AGENT'
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const loadedOnce = useRef(false)
  const [tab, setTab] = useState<LeadTab>(isCollectionAgent ? 'history' : 'new')
  const [progressView, setProgressView] = useState<'pending' | 'done'>('pending')   // guarantor In Progress: Not completed / Completed
  const [showSubmit, setShowSubmit] = useState(false)
  const [showRenewal, setShowRenewal] = useState(false)
  const [approving, setApproving] = useState<Lead | null>(null)
  const [detail, setDetail] = useState<Lead | null>(null)
  const [agents, setAgents] = useState<any[]>([])
  const [toast, setToast] = useState('')
  const [editing, setEditing] = useState(false)
  const [deleteMode, setDeleteMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [products, setProducts] = useState<any[]>([])
  const [approveProduct, setApproveProduct] = useState('')
  const [branchFilter, setBranchFilter] = useState('')
  // The server filters, searches and pages the leads: only the leads on screen are loaded
  const [page, setPage] = useState(1)
  const [totalLeads, setTotalLeads] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [counts, setCounts] = useState({ new: 0, history: 0, renewal: 0, approved: 0 })
  const [branchList, setBranchList] = useState<{ branchId: string; name: string }[]>([])
  const [search, setSearch] = useState('')
  const LEADS_PAGE = 20

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(''), 3000) }

  function printNote(lead: Lead) {
    const tmpl = (typeof window !== 'undefined' && localStorage.getItem(PROMISSORY_TEMPLATE_KEY)) || DEFAULT_PROMISSORY_BODY
    const html = buildPromissoryHtml(tmpl, buildLeadNoteData(lead))
    const w = window.open('', '_blank')
    if (!w) { showToast('Allow pop-ups to print the note.'); return }
    w.document.write(html); w.document.close()
  }

  function toggleSelect(id: string) {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  async function deleteSelected() {
    if (!selected.size) return
    if (!confirm(`Delete ${selected.size} lead(s)? This cannot be undone.`)) return
    let successCount = 0
    for (const leadId of selected) {
      const res = await fetch(`/api/leads/${leadId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${session.token}` } })
      const json = await res.json()
      if (json.success) successCount++
      else console.error('Failed to delete lead:', leadId, json.error)
    }
    if (successCount > 0) showToast(`${successCount} lead(s) deleted.`)
    else showToast('Failed to delete leads.')
    setSelected(new Set())
    setDeleteMode(false)
    load()
  }

  // the current tab, page, search and branch, read at call time so the 15-second refresh never uses stale values
  const queryRef = useRef({ tab: 'new', page: 1, q: '', branch: '' })
  const loadSeq = useRef(0)
  async function loadLeads() {
    const seq = ++loadSeq.current
    const { tab: t, page: p, q, branch } = queryRef.current
    const url = `/api/leads?tab=${t === 'disbursements' ? 'new' : t}&page=${p}&pageSize=${LEADS_PAGE}&q=${encodeURIComponent(q.trim())}&branch=${encodeURIComponent(branch)}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${session.token}` } })
    const json = await res.json()
    if (seq !== loadSeq.current || !json.success) return   // a newer request replaced this one
    setLeads(json.data.rows); setTotalLeads(json.data.pagination.total); setTotalPages(json.data.pagination.totalPages)
    setCounts(json.data.counts); setBranchList(json.data.branches || [])
  }

  async function load(showLoading = true) {
    if (showLoading && !loadedOnce.current) setLoading(true)
    await loadLeads()
    if (isManager) {
      const s = await fetch('/api/staff', { headers: { Authorization: `Bearer ${session.token}` } })
      const sj = await s.json()
      if (sj.success) setAgents(sj.data.agents)
      const p = await fetch('/api/loan-products', { headers: { Authorization: `Bearer ${session.token}` } })
      const pj = await p.json()
      if (pj.success) setProducts(pj.data.products || [])
    }
    loadedOnce.current = true
    if (showLoading) setLoading(false)
  }

  useEffect(() => { load(true) }, [])

  // a new tab, search or branch starts again at page 1; the search is sent after a short pause
  useEffect(() => { setPage(1) }, [tab, search, branchFilter])
  useEffect(() => {
    queryRef.current = { tab, page, q: search, branch: branchFilter }
    if (!loadedOnce.current) return   // the first load is done above
    const t = setTimeout(() => { loadLeads() }, search ? 300 : 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, page, search, branchFilter])

  // Memoize idle state to avoid dependency array churn
  const isIdle = useMemo(() => !(
    showSubmit || showRenewal || approving || detail || editing || deleteMode || busy || selected.size > 0
  ), [showSubmit, showRenewal, approving, detail, editing, deleteMode, busy, selected.size])

  // Auto-refresh leads every 15 seconds (only when UI is idle)
  useEffect(() => {
    if (!isIdle) return
    const interval = setInterval(() => {
      load(false)
    }, 15000)
    return () => clearInterval(interval)
  }, [isIdle])

  // Default the approval product to the lead's product (or the first product)
  useEffect(() => {
    if (detail) setApproveProduct(detail.loanProduct && detail.loanProduct !== 'RENEWAL' ? detail.loanProduct : (products[0]?.key || ''))
  }, [detail, products])

  async function assign(leadId: string, agentId: string) {
    await fetch(`/api/leads/${leadId}`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'assignAgent', agentId }),
    })
    showToast('Agent assigned.'); load()
  }

  async function assignFromTable(leadId: string, agentId: string) {
    if (!agentId) return
    await fetch(`/api/leads/${leadId}`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'assignAgent', agentId }),
    })
    showToast('Agent assigned.')
    load()
  }

  async function review(leadId: string, decision: string, extra: Record<string, any> = {}) {
    const notes = decision === 'Reject Lead' ? prompt('Rejection reason (optional):') || '' : ''
    setBusy(leadId + decision)
    try {
      // Fetch CSRF token
      const csrfRes = await fetch('/api/csrf', { headers: { Authorization: `Bearer ${session.token}` } })
      const csrfJson = await csrfRes.json()
      const csrfToken = csrfJson.csrfToken || csrfJson.data?.csrfToken
      
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH', 
        headers: { 
          Authorization: `Bearer ${session.token}`, 
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken || ''
        },
        body: JSON.stringify({ action: 'adminReview', decision, notes, ...extra }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Server error')
      showToast(decision === 'Approve Loan' ? 'Approved. It is now in the Disbursement list.' : 'Done.'); setDetail(null); load()
    } catch (e: any) {
      showToast(e.message || 'Failed')
    } finally { setBusy(null) }
  }

  async function deleteLead(leadId: string) {
    if (!confirm('Delete this lead?')) return
    const res = await fetch(`/api/leads/${leadId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${session.token}` } })
    const json = await res.json()
    if (json.success) { showToast('Deleted.'); setDetail(null); load() }
    else showToast(json.error || 'Failed to delete')
  }

  async function scan(leadId: string, btn: HTMLButtonElement) {
    btn.disabled = true; btn.textContent = 'Scanning...'
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'scanFolder' }),
      })
      const j = await res.json()
      showToast(j.data?.found ? `${j.data.found} photo(s) linked.` : 'No new photos found.')
      if (j.data?.found) load()
    } finally { btn.disabled = false; btn.textContent = 'Scan Drive Folder' }
  }

  async function saveEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = e.currentTarget
    const fields = ['customerName','phone','aadhaarNo','address','houseName','place','landmark','nomineeName','nomineePhone','occupation','panNo','chequeNumber','riskLevel']
    const payload: any = { action: 'update' }
    fields.forEach(k => { const el = f.elements.namedItem(k) as HTMLInputElement; if (el) payload[k] = el.value })
    await fetch(`/api/leads/${detail!.leadId}`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    showToast('Saved.'); setEditing(false); load()
  }

  if (loading) return <div className="flex h-40 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-ink border-t-transparent" /></div>

  if (detail) return (
    <div className="space-y-5">
      {approving && <RenewalApproveModal session={session} lead={approving} onClose={() => setApproving(null)} onDone={m => { setApproving(null); setDetail(null); showToast(m); load() }} />}
      {toast && <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-2xl bg-ink px-5 py-3 text-sm font-medium text-white shadow-lg">{toast}</div>}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => { setDetail(null); setEditing(false) }} className="rounded-2xl border border-line bg-white px-4 py-2 text-sm font-semibold">Back</button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="text-lg font-semibold">{detail.customerName}</p>
            {detail.aadhaarStatus === 'exists'
              ? <span className="rounded-lg bg-red-100 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-red-600">Existing Customer — High Risk of Fraud</span>
              : detail.aadhaarNo
                ? <span className="rounded-lg bg-green-100 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-green-700">New Customer</span>
                : null
            }
          </div>
          <p className="text-sm text-soft">{detail.leadId} &bull; {detail.submittedDate}</p>
        </div>
        <StatusPill status={detail.status} />
      </div>

      {!editing ? (
        <div className="space-y-4">
          {/* Top action bar */}
          <div className="flex items-center gap-2 flex-wrap">
            {isManager && <button onClick={() => setEditing(true)} className="rounded-2xl border border-line bg-white px-4 py-2 text-sm font-semibold hover:bg-mist transition">Edit Details</button>}
            <button onClick={() => printNote(detail)} className="inline-flex items-center gap-2 rounded-2xl bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-[#2d2d4e] transition">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
              Print Promissory Note
            </button>
          </div>

          {/* Customer & Loan */}
          <DetailCard title="Customer & Loan" accent="blue">
            <InfoRow>
              <InfoItem label="Full Name" value={detail.customerName} large />
              <InfoItem label="Phone" value={detail.phone} />
              <InfoItem label="Aadhaar No" value={detail.aadhaarNo} />
            </InfoRow>
            <InfoRow>
              <InfoItem label="Loan Product" value={detail.loanProduct} badge="indigo" />
              <InfoItem label="Guarantor" value={detail.guarantorName} />
              <InfoItem label="Agent" value={detail.assignedAgentName} />
            </InfoRow>
          </DetailCard>

          {/* Address */}
          <DetailCard title="Address" accent="green">
            <InfoRow>
              <InfoItem label="Address" value={detail.address} span={2} />
              <InfoItem label="House Name" value={detail.houseName} />
            </InfoRow>
            <InfoRow>
              <InfoItem label="Place" value={detail.place} />
              <InfoItem label="Landmark" value={detail.landmark} span={2} />
            </InfoRow>
          </DetailCard>

          {/* Nominee */}
          <DetailCard title="Nominee" accent="purple">
            <InfoRow>
              <InfoItem label="Nominee Name" value={detail.nomineeName} />
              <InfoItem label="Nominee Phone" value={detail.nomineePhone} />
            </InfoRow>
          </DetailCard>

          {/* Financial Details */}
          <DetailCard title="Financial Details" accent="amber">
            <InfoRow>
              <InfoItem label="Occupation" value={detail.occupation} />
              <InfoItem label="Account Number" value={(detail as any).accountNumber} />
              <InfoItem label="IFSC Code" value={(detail as any).ifscCode} />
            </InfoRow>
            <InfoRow>
              <InfoItem label="PAN No" value={detail.panNo} />
              <InfoItem label="Cheque Number" value={detail.chequeNumber} />
            </InfoRow>
          </DetailCard>

          {/* Verification */}
          <DetailCard title="Verification" accent="rose">
            <InfoRow>
              <InfoItem label="Risk Level" value={detail.riskLevel}
                badge={detail.riskLevel === 'Low' ? 'green' : detail.riskLevel === 'Medium' ? 'amber' : detail.riskLevel === 'High' ? 'red' : undefined} />
              <InfoItem label="Recommendation" value={detail.recommendationStatus}
                badge={detail.recommendationStatus === 'Verified' ? 'green' : detail.recommendationStatus?.includes('Reject') ? 'red' : 'amber'} />
              <InfoItem label="Verification Status" value={detail.verificationStatus} />
            </InfoRow>
            <InfoRow>
              <InfoItem label="Verification Date" value={detail.verificationSubmittedDate} />
              {detail.loanProduct !== 'RENEWAL' && <InfoItem label="Customer OTP at visit" value={detail.otpVerifiedAt ? 'Verified' : detail.otpOverrideReason ? `Not done: ${detail.otpOverrideReason}` : ''} badge={detail.otpVerifiedAt ? 'green' : detail.otpOverrideReason ? 'amber' : undefined} />}
              {(() => {
                try {
                  const n = JSON.parse(detail.verificationNotes || '{}')
                  return <span>
                    {n.mapsLink && (
                      <div className="col-span-2">
                        <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-soft mb-1">Maps Link</p>
                        <a href={n.mapsLink} target="_blank" rel="noreferrer" className="text-sm text-blue-600 underline break-all hover:text-blue-800">{n.mapsLink}</a>
                      </div>
                    )}
                    {n.riskNotes && (
                      <div className="col-span-3">
                        <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-soft mb-1">Field Notes</p>
                        <p className="text-sm text-ink bg-panel rounded-xl px-4 py-3">{n.riskNotes}</p>
                      </div>
                    )}
                  </span>
                } catch { return detail.verificationNotes ? (
                  <div className="col-span-3">
                    <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-soft mb-1">Field Notes</p>
                    <p className="text-sm bg-panel rounded-xl px-4 py-3">{detail.verificationNotes}</p>
                  </div>
                ) : null }
              })()}
            </InfoRow>
            {detail.adminFinalDecision && (
              <InfoRow>
                <div className="col-span-3 rounded-xl border border-line bg-panel px-4 py-3">
                  <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-soft mb-1">Admin Decision</p>
                  <p className="text-sm font-semibold">{detail.adminFinalDecision}</p>
                </div>
              </InfoRow>
            )}
          </DetailCard>

          {/* Documents */}
          <DetailCard title="Documents" accent="gray"
            action={isManager && can('leadsEdit') && detail.documentFolderId
              ? <button onClick={e => scan(detail.leadId, e.currentTarget)} className="rounded-xl bg-mist px-3 py-2 text-xs font-semibold hover:bg-line transition">Scan Drive Folder</button>
              : undefined}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <DriveImage url={detail.customerPhotoUrl} label="Customer Photo" token={session.token} />
              <DriveImage url={detail.aadhaarFrontUrl} label="Aadhaar Front" token={session.token} />
              <DriveImage url={detail.aadhaarBackUrl} label="Aadhaar Back" token={session.token} />
              <DriveImage url={detail.landmarkPhotoUrl} label="Landmark Photo" token={session.token} />
              <DriveImage url={detail.housePhotoUrl} label="House Photo" token={session.token} />
              <DriveImage url={detail.chequePhotoUrl} label="Cheque Photo" token={session.token} />
            </div>
          </DetailCard>

          {isManager && (can('leadsApprove') || can('leadsAssign') || can('leadsDelete')) && (
            <div className="flex flex-wrap items-center gap-2 rounded-[1.75rem] border border-white/70 bg-white px-6 py-4 shadow-panel">
              {can('leadsApprove') && detail.status === 'Verification Submitted' && <span>
                <label className="flex items-center gap-2 text-sm">
                  <span className="font-semibold text-soft">Loan Product</span>
                  <select value={approveProduct} onChange={e => setApproveProduct(e.target.value)}
                    className="rounded-2xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink">
                    {products.map(p => (
                      <option key={p.key} value={p.key}>
                        {p.label} — ₹{Number(p.principal).toLocaleString('en-IN')} / {p.durationWeeks}w
                      </option>
                    ))}
                  </select>
                </label>
                <button onClick={() => review(detail.leadId, 'Approve Loan', { loanProduct: approveProduct })} disabled={busy !== null}
                  className="flex items-center justify-center gap-1.5 rounded-2xl bg-ink px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                  {busy === detail.leadId + 'Approve Loan' ? <span><span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />Approving...</span> : 'Approve'}
                </button>
                <button onClick={() => review(detail.leadId, 'Reject Lead')} disabled={busy !== null}
                  className="flex items-center justify-center gap-1.5 rounded-2xl border border-red-200 bg-red-50 px-5 py-2.5 text-sm font-semibold text-red-600 disabled:opacity-60">
                  {busy === detail.leadId + 'Reject Lead' ? <span><span className="h-3 w-3 animate-spin rounded-full border-2 border-red-400 border-t-transparent" />Rejecting...</span> : 'Reject Lead'}
                </button>
                <button onClick={() => review(detail.leadId, 'Request Reverification')} disabled={busy !== null}
                  className="flex items-center justify-center gap-1.5 rounded-2xl border border-line bg-white px-5 py-2.5 text-sm font-semibold disabled:opacity-60">
                  {busy === detail.leadId + 'Request Reverification' ? <span><span className="h-3 w-3 animate-spin rounded-full border-2 border-soft border-t-transparent" />...</span> : 'Reverify'}
                </button>
              </span>}
              {can('leadsApprove') && detail.status === 'Pending' && detail.loanProduct === 'RENEWAL' && <span>
                <button onClick={() => setApproving(detail)} disabled={busy !== null}
                  className="flex items-center justify-center gap-1.5 rounded-2xl bg-green-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                  Approve (customer OTP)
                </button>
                <button onClick={() => review(detail.leadId, 'Reject Lead')} disabled={busy !== null}
                  className="flex items-center justify-center gap-1.5 rounded-2xl border border-red-200 bg-red-50 px-5 py-2.5 text-sm font-semibold text-red-600 disabled:opacity-60">
                  {busy === detail.leadId + 'Reject Lead' ? <span><span className="h-3 w-3 animate-spin rounded-full border-2 border-red-400 border-t-transparent" />Rejecting...</span> : 'Reject'}
                </button>
              </span>}
              {can('leadsAssign') && detail.status === 'Pending' && detail.loanProduct !== 'RENEWAL' && (
                <select onChange={e => { if (e.target.value) assign(detail.leadId, e.target.value) }} className="rounded-2xl border border-line px-4 py-2.5 text-sm">
                  <option value="">Assign agent...</option>
                  {agents.map(a => <option key={a.agentId} value={a.agentId}>{a.name}</option>)}
                </select>
              )}
              {can('leadsDelete') && <button onClick={() => deleteLead(detail.leadId)} className="ml-auto rounded-2xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 transition">Delete Lead</button>}
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={saveEdit} className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel">
          <div className="border-b border-black/5 px-6 py-4"><p className="text-sm font-semibold">Edit Lead</p></div>
          <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3">
            {[['customerName','Full Name'],['phone','Phone'],['aadhaarNo','Aadhaar No'],['occupation','Occupation'],['panNo','PAN No'],['chequeNumber','Cheque Number'],['address','Address'],['houseName','House Name'],['place','Place'],['landmark','Landmark'],['nomineeName','Nominee Name'],['nomineePhone','Nominee Phone'],['riskLevel','Risk Level']].map(([k,l]) => (
              <label key={k} className="block">
                <span className="mb-1 block text-[0.7rem] font-semibold uppercase tracking-wider text-soft">{l}</span>
                <input name={k} defaultValue={(detail as any)[k] || ''} className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none focus:border-ink" />
              </label>
            ))}
          </div>
          <div className="flex gap-3 border-t border-black/5 px-6 py-4">
            <button type="submit" className="rounded-2xl bg-ink px-6 py-3 text-sm font-semibold text-white">Save Changes</button>
            <button type="button" onClick={() => setEditing(false)} className="rounded-2xl border border-line px-6 py-3 text-sm font-semibold">Cancel</button>
          </div>
        </form>
      )}
    </div>
  )

  // the lists are already filtered by the server; the counts feed the tab badges
  const newLeads = { length: counts.new }, historyLeads = { length: counts.history }, renewalLeads = { length: counts.renewal }
  const branchOptions: [string, string][] = branchList.map(b => [b.branchId, b.name])
  const visibleLeads = leads

  const renderLead = (l: Lead, i: number) => (
              <div key={l.leadId || i}
                onClick={() => deleteMode && toggleSelect(l.leadId)}
                className={`p-4 sm:p-5 transition ${deleteMode ? 'cursor-pointer' : ''} ${selected.has(l.leadId) ? 'bg-red-50' : ''}`}>
                <div className="flex items-start justify-between gap-3">
              {deleteMode && (
                <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${selected.has(l.leadId) ? 'border-red-500 bg-red-500' : 'border-line'}`}>
                  {selected.has(l.leadId) && <span className="text-white text-[10px] font-bold">✓</span>}
                </div>
              )}
              {/* Left: customer info */}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-sm">{l.customerName}</p>
                  <StatusPill status={l.status} />
                  {isManager && <span className="rounded-lg bg-sky-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-700">{l.branchName || 'No branch'}</span>}
                </div>
                <p className="mt-0.5 text-xs text-soft">{l.phone}</p>
                <div className="mt-1 flex flex-wrap gap-2 text-xs text-soft">
                  {l.guarantorName && <span>Guarantor: <span className="font-medium text-ink">{l.guarantorName}</span></span>}
                  {session.role !== 'Guarantor' && l.assignedAgentName && <span>Agent: <span className="font-medium text-ink">{l.assignedAgentName}</span></span>}
                  {l.riskLevel && <span>Risk: <span className="font-medium text-ink">{l.riskLevel}</span></span>}
                </div>
                {l.loanProduct !== 'RENEWAL' && l.status === 'Verification Submitted' && (l.otpVerifiedAt
                  ? <span className="mt-1.5 mr-1.5 inline-block rounded-lg bg-green-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-green-700">Customer OTP verified</span>
                  : <span className="mt-1.5 mr-1.5 inline-block rounded-lg bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">OTP not done: {(l.otpOverrideReason || 'no reason').slice(0, 60)}</span>)}
                {l.aadhaarStatus === 'exists'
                  ? <span className="mt-1.5 inline-block rounded-lg bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-600">Existing Customer — High Risk of Fraud</span>
                  : l.aadhaarNo
                    ? <span className="mt-1.5 inline-block rounded-lg bg-green-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-green-700">New Customer</span>
                    : null
                }
              </div>
              {/* Right: actions */}
              {!deleteMode && <div className="flex flex-wrap items-center justify-end gap-2">
                {session.role !== 'Guarantor' && <button onClick={() => setDetail(l)} className="rounded-xl border border-line px-3 py-1.5 text-xs font-semibold">View</button>}
                {isManager && <button onClick={() => printNote(l)} className="rounded-xl border border-line px-3 py-1.5 text-xs font-semibold">Print Note</button>}
                {isManager && can('leadsApprove') && l.loanProduct === 'RENEWAL' && l.status === 'Pending' && (
                  <span>
                    <button onClick={() => setApproving(l)} disabled={busy !== null}
                      className="flex items-center justify-center gap-1.5 rounded-xl bg-green-600 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
                      Approve (OTP)
                    </button>
                    <button onClick={() => review(l.leadId, 'Reject Lead')} disabled={busy !== null}
                      className="rounded-xl border border-line px-3 py-1.5 text-xs font-semibold text-red-600 disabled:opacity-60">Reject</button>
                  </span>
                )}
                {isManager && can('leadsAssign') && l.loanProduct !== 'RENEWAL' && l.status === 'Pending' && (
                  agents.length > 0 ? (
                    <span>
                      <select key={l.leadId+'-sel'} defaultValue=""
                        onChange={e => { const v = e.target.value; if (v) assignFromTable(l.leadId, v) }}
                        className="rounded-xl border border-line bg-white px-2 py-1.5 text-xs max-w-[130px]">
                        <option value="">Assign agent</option>
                        {agents.map((a: any) => <option key={a.agentId} value={a.agentId}>{a.name}</option>)}
                      </select>
                      <button onClick={() => review(l.leadId, 'Reject Lead')} className="rounded-xl border border-line px-3 py-1.5 text-xs font-semibold text-red-600">Reject</button>
                    </span>
                  ) : <span className="rounded-xl border border-orange-200 bg-orange-50 px-2 py-1 text-[10px] text-orange-600">No agents yet</span>
                )}
                {isManager && can('leadsAssign') && l.status === 'Agent Assigned' && agents.length > 0 && (
                  <span>
                    <select key={l.leadId+'-re'} defaultValue=""
                      onChange={e => { const v = e.target.value; if (v) assignFromTable(l.leadId, v) }}
                      className="rounded-xl border border-line bg-white px-2 py-1.5 text-xs max-w-[130px]">
                      <option value="">Change Agent</option>
                      {agents.map((a: any) => <option key={a.agentId} value={a.agentId}>{a.name}</option>)}
                    </select>
                    <button onClick={() => review(l.leadId, 'Reject Lead')} className="rounded-xl border border-line px-3 py-1.5 text-xs font-semibold text-red-600">Reject</button>
                  </span>
                )}
                {isManager && can('leadsApprove') && l.status === 'Verification Submitted' && (
                  <span>
                    <button onClick={() => review(l.leadId, 'Approve Loan')} disabled={busy !== null}
                      className="flex w-24 items-center justify-center gap-1.5 rounded-xl bg-ink px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
                      {busy === l.leadId + 'Approve Loan' ? <span><span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />...</span> : 'Approve'}
                    </button>
                    <button onClick={() => review(l.leadId, 'Reject Lead')} disabled={busy !== null}
                      className="flex w-24 items-center justify-center gap-1.5 rounded-xl border border-line px-3 py-1.5 text-xs font-semibold text-red-600 disabled:opacity-60">
                      {busy === l.leadId + 'Reject Lead' ? <span><span className="h-3 w-3 animate-spin rounded-full border-2 border-red-400 border-t-transparent" />...</span> : 'Reject'}
                    </button>
                    <button onClick={() => review(l.leadId, 'Request Reverification')} disabled={busy !== null}
                      className="flex w-24 items-center justify-center gap-1.5 rounded-xl border border-line px-3 py-1.5 text-xs font-semibold disabled:opacity-60">
                      {busy === l.leadId + 'Request Reverification' ? <span><span className="h-3 w-3 animate-spin rounded-full border-2 border-soft border-t-transparent" />...</span> : 'Reverify'}
                    </button>
                  </span>
                )}
              </div>}
            </div>
          </div>
  )

  if (showSubmit) return (
    <SubmitLeadPage session={session} onDone={() => { setShowSubmit(false); load() }} />
  )

  return (
    <div className="space-y-4">
      {showRenewal && (
        <RenewalModal session={session} onClose={() => setShowRenewal(false)} onDone={() => { setShowRenewal(false); load() }} />
      )}
      {approving && <RenewalApproveModal session={session} lead={approving} onClose={() => setApproving(null)} onDone={m => { setApproving(null); showToast(m); load() }} />}
      {toast && <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-2xl bg-ink px-5 py-3 text-sm font-medium text-white shadow-lg">{toast}</div>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {(isManager || session.role === 'Guarantor') && (
            <button onClick={() => { setTab('new'); setDeleteMode(false); setSelected(new Set()) }}
              className={`shrink-0 whitespace-nowrap rounded-2xl px-3 py-2 text-[13px] font-medium transition sm:px-4 sm:text-sm ${tab === 'new' ? 'bg-ink text-white' : 'border border-line bg-white text-soft hover:text-ink'}`}>
              {isManager ? 'New Leads' : 'In Progress'} {newLeads.length > 0 && <span className={`ml-1.5 rounded-full px-2 py-0.5 text-xs font-bold ${tab === 'new' ? 'bg-white/20' : 'bg-mist'}`}>{newLeads.length}</span>}
            </button>
          )}
          <button onClick={() => { setTab('history'); setDeleteMode(false); setSelected(new Set()) }}
            className={`shrink-0 whitespace-nowrap rounded-2xl px-3 py-2 text-[13px] font-medium transition sm:px-4 sm:text-sm ${tab === 'history' ? 'bg-ink text-white' : 'border border-line bg-white text-soft hover:text-ink'}`}>
            History {historyLeads.length > 0 && <span className={`ml-1.5 rounded-full px-2 py-0.5 text-xs font-bold ${tab === 'history' ? 'bg-white/20' : 'bg-mist'}`}>{historyLeads.length}</span>}
          </button>
          {isManager && (can('leadsRenew') || can('leadsApprove')) && (
            <button onClick={() => { setTab('renewal'); setDeleteMode(false); setSelected(new Set()) }}
              className={`shrink-0 whitespace-nowrap rounded-2xl px-3 py-2 text-[13px] font-medium transition sm:px-4 sm:text-sm ${tab === 'renewal' ? 'bg-green-600 text-white' : 'border border-green-200 bg-white text-green-700 hover:bg-green-50'}`}>
              Renewal<span className="hidden sm:inline"> Requests</span> {renewalLeads.length > 0 && <span className={`ml-1.5 rounded-full px-2 py-0.5 text-xs font-bold ${tab === 'renewal' ? 'bg-white/20' : 'bg-green-100'}`}>{renewalLeads.length}</span>}
            </button>
          )}
          {isManager && can('leadsDisburse') && (
            <button onClick={() => { setTab('disbursements'); setDeleteMode(false); setSelected(new Set()) }}
              className={`shrink-0 whitespace-nowrap rounded-2xl px-3 py-2 text-[13px] font-medium transition sm:px-4 sm:text-sm ${tab === 'disbursements' ? 'bg-ink text-white' : 'border border-line bg-white text-soft hover:text-ink'}`}>
              Disbursements {counts.approved > 0 && <span className={`ml-1.5 rounded-full px-2 py-0.5 text-xs font-bold ${tab === 'disbursements' ? 'bg-white/20' : 'bg-amber-100 text-amber-700'}`}>{counts.approved}<span className="hidden sm:inline"> to disburse</span></span>}
            </button>
          )}
        </div>
        {session.role === 'Guarantor' && (
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <button onClick={() => setShowSubmit(true)}
              className="rounded-2xl bg-gold px-4 py-2.5 text-sm font-semibold text-[#1a1400] hover:opacity-90 transition">
              + New Lead
            </button>
            <button onClick={() => setShowRenewal(true)}
              className="rounded-2xl bg-green-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-600 transition">
              + Renewal
            </button>
          </div>
        )}
      </div>
      {isManager && tab !== 'disbursements' && (
        <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap sm:gap-3 [&>input]:col-span-2 sm:[&>input]:w-72">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone, Aadhaar…" data-no-upper
            className="w-full rounded-2xl border border-line bg-white px-4 py-2.5 text-sm outline-none focus:border-ink" />
          <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)}
            className="rounded-2xl border border-line bg-white px-4 py-2.5 text-sm font-medium">
            <option value="">All branches</option>
            {branchOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            <option value="none">No branch</option>
          </select>
          {can('leadsDelete') && !deleteMode && (
            <button onClick={() => { setDeleteMode(true); setSelected(new Set()) }}
              className="rounded-2xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600">
              Delete
            </button>
          )}
          {deleteMode && (
            <span>
              <span className="text-sm text-soft">{selected.size} selected</span>
              <button onClick={deleteSelected} disabled={!selected.size}
                className="rounded-2xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
                Confirm Delete
              </button>
              <button onClick={() => { setDeleteMode(false); setSelected(new Set()) }}
                className="rounded-2xl border border-line px-4 py-2.5 text-sm font-semibold">
                Cancel
              </button>
            </span>
          )}
        </div>
      )}
      {tab === 'disbursements' ? <DisbursementsView session={session} /> : tab === 'history' ? (
        <LeadsHistoryWeeks session={session} search={search} branch={branchFilter} version={counts.history} renderLead={renderLead} />
      ) : (
      <>
        {visibleLeads.length === 0 && !(session.role === 'Guarantor' && tab === 'new') && <p className="p-8 text-center text-sm text-soft">{tab === 'new' ? 'No new leads.' : 'No renewal requests yet.'}</p>}
        <div className="px-5 pb-4"><Pager page={page} totalPages={totalPages} total={totalLeads} noun="leads" pageSize={LEADS_PAGE} onPage={setPage} /></div>
        {session.role === 'Guarantor' && tab === 'new' ? (
          // Guarantor: two tabs side by side. "Not completed" = waiting for the agent; "Completed" = the agent has finished the verification
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white p-1.5 shadow-panel">
              {([['pending', 'Not completed', visibleLeads.filter(l => !DONE_STATUSES.includes(l.status)).length, 'bg-amber-100 text-amber-700'],
                 ['done', 'Completed', visibleLeads.filter(l => DONE_STATUSES.includes(l.status)).length, 'bg-green-100 text-green-700']] as const).map(([key, title, n, pill]) => (
                <button key={key} onClick={() => setProgressView(key)}
                  className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${progressView === key ? 'bg-ink text-white' : 'text-soft'}`}>
                  {title}
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${progressView === key ? 'bg-white/20 text-white' : pill}`}>{n}</span>
                </button>
              ))}
            </div>
            {(() => {
              const rows = visibleLeads.filter(l => DONE_STATUSES.includes(l.status) === (progressView === 'done'))
              return (
                <div className="overflow-hidden rounded-[1.75rem] border border-white/70 bg-white shadow-panel divide-y divide-black/5">
                  {rows.length === 0
                    ? <p className="p-6 text-center text-sm text-soft">{progressView === 'done' ? 'Nothing completed yet.' : 'Nothing waiting for the agent.'}</p>
                    : rows.map(renderLead)}
                </div>
              )
            })()}
          </div>
        ) : (
        <div className="overflow-hidden rounded-[1.75rem] border border-white/70 bg-white shadow-panel divide-y divide-black/5">
          <div className="overflow-x-auto">
            {visibleLeads.map(renderLead)}
      </div>
    </div>
        )}
  </>
  )}
</div>
  )
}

// ─── Disbursements: loans disbursed per week, split into New vs Renewals ──────
function DisbursementsView({ session }: { session: Session }) {
  const [loans, setLoans] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [subTab, setSubTab] = useState<'queue' | 'current' | 'history'>('queue')
  const [historyWeek, setHistoryWeek] = useState('')

  // Only the weeks on screen are loaded: this week and the one picked in History
  const currentWeek = weekStartIso(ymdLocal(new Date()))
  const lastWeek = addDaysIso(currentWeek, -7)
  const historyWeeks: string[] = []
  for (let w = lastWeek; w >= addDaysIso(lastWeek, -7 * 51); w = addDaysIso(w, -7)) historyWeeks.push(w)   // the last year of weeks
  const selectedHistory = historyWeek || historyWeeks[0] || lastWeek

  const [byWeek, setByWeek] = useState<Record<string, any[]>>({})
  async function loadWeek(ws: string) {
    if (byWeek[ws]) return
    const rows: any[] = []
    for (let pg = 1; pg < 50; pg++) {
      const j = await fetch(`/api/loans?filter=all&createdFrom=${ws}&createdTo=${addDaysIso(ws, 6)}&page=${pg}&pageSize=200`, { headers: { Authorization: `Bearer ${session.token}` } }).then(r => r.json()).catch(() => null)
      if (!j?.success) break
      rows.push(...(j.data.loans || []))
      if (pg >= j.data.totalPages) break
    }
    setByWeek(prev => ({ ...prev, [ws]: rows }))
  }
  useEffect(() => {
    if (subTab === 'queue') { setLoading(false); return }   // the queue has its own list
    setLoading(true)
    loadWeek(subTab === 'history' ? selectedHistory : currentWeek).finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subTab, selectedHistory])

  const weekLoans = (ws: string) => (byWeek[ws] || []).map(l => ({ ...l, _date: (l.createdAt || l.startDate || '').slice(0, 10) }))

  if (loading) return <div className="flex h-40 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-ink border-t-transparent" /></div>

  const Section = ({ title, rows, accent }: { title: string; rows: any[]; accent: string }) => {
    const total = rows.reduce((s, l) => s + Number(l.netDisbursed || 0), 0)
    return (
      <div className="overflow-hidden rounded-[1.75rem] border border-white/70 bg-white shadow-panel">
        <div className="flex items-center justify-between border-b border-black/5 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${accent}`} />
            <p className="text-sm font-semibold">{title}</p>
            <span className="rounded-full bg-mist px-2 py-0.5 text-xs font-semibold text-soft">{rows.length}</span>
          </div>
          <p className="text-sm font-semibold">{currencyInr(total)} <span className="text-xs font-normal text-soft">disbursed</span></p>
        </div>
        {rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-soft">No {title.toLowerCase()} this week.</p>
        ) : (
          <div className="divide-y divide-black/5">
            {rows.map(l => {
              return (
                <div key={l.loanId} className="flex items-start justify-between gap-3 px-5 py-3 hover:bg-panel">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{l.customerName}</p>
                    <p className="font-mono text-xs text-soft">{l.loanId}</p>
                    <p className="text-xs text-soft truncate">
                      {l.guarantorName || '—'}{l.agentName ? ` · ${l.agentName}` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold text-green-700">{currencyInr(Number(l.netDisbursed || 0))}</p>
                    <p className="text-xs text-soft">{l.startDate}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  const renderWeek = (rows: any[]) => {
    if (rows.length === 0) return (
      <p className="rounded-2xl border border-dashed border-line bg-white p-8 text-center text-sm text-soft">
        This week had no new or renewal disbursements.
      </p>
    )
    return (
      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <Section title="New" rows={rows.filter(l => !l.isRenewal)} accent="bg-blue-500" />
        <Section title="Renewals" rows={rows.filter(l => l.isRenewal)} accent="bg-green-500" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-2">
        <button onClick={() => setSubTab('queue')}
          className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${subTab === 'queue' ? 'bg-green-600 text-white' : 'border border-green-200 bg-white text-green-700 hover:bg-green-50'}`}>
          To Disburse
        </button>
        <button onClick={() => setSubTab('current')}
          className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${subTab === 'current' ? 'bg-ink text-white' : 'border border-line bg-white text-soft hover:text-ink'}`}>
          Current Week
        </button>
        <button onClick={() => setSubTab('history')}
          className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${subTab === 'history' ? 'bg-ink text-white' : 'border border-line bg-white text-soft hover:text-ink'}`}>
          History
        </button>
      </div>

      {subTab === 'queue' ? <DisburseQueue session={session} /> : subTab === 'current' ? (
        <div className="space-y-4">
          <p className="text-sm text-soft">Current week · <span className="font-semibold text-ink">{weekRangeLabel(currentWeek)}</span> (Mon–Sat)</p>
          {renderWeek(weekLoans(currentWeek))}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-soft">Past weeks — completed disbursement weeks.</p>
            <select value={selectedHistory} onChange={e => setHistoryWeek(e.target.value)}
              className="rounded-2xl border border-line bg-white px-4 py-2 text-sm font-medium outline-none focus:border-ink">
              {historyWeeks.map(w => (
                <option key={w} value={w}>{w === lastWeek ? `Last Week · ${weekRangeLabel(w)}` : weekRangeLabel(w)}</option>
              ))}
            </select>
          </div>
          {renderWeek(weekLoans(selectedHistory))}
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="mb-4 text-[0.7rem] font-semibold uppercase tracking-wider text-soft">{title}</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  )
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-soft">{label}</p>
      <p className="mt-1 text-sm">{value || '-'}</p>
    </div>
  )
}

const accentMap: Record<string, string> = {
  blue:   'border-l-blue-400 bg-blue-50/30',
  green:  'border-l-green-400 bg-green-50/30',
  purple: 'border-l-purple-400 bg-purple-50/30',
  amber:  'border-l-amber-400 bg-amber-50/30',
  rose:   'border-l-rose-400 bg-rose-50/30',
  gray:   'border-l-gray-300 bg-white',
}
const accentTitle: Record<string, string> = {
  blue: 'text-blue-700', green: 'text-green-700', purple: 'text-purple-700',
  amber: 'text-amber-700', rose: 'text-rose-700', gray: 'text-soft',
}
const badgeMap: Record<string, string> = {
  green: 'bg-green-100 text-green-700', red: 'bg-red-100 text-red-700',
  amber: 'bg-amber-100 text-amber-700', indigo: 'bg-indigo-100 text-indigo-700',
}

function DetailCard({ title, accent = 'gray', children, action }: {
  title: string; accent?: string; children: React.ReactNode; action?: React.ReactNode
}) {
  return (
    <div className={`rounded-[1.75rem] border border-white/70 border-l-4 shadow-panel p-5 space-y-4 ${accentMap[accent] ?? accentMap.gray}`}>
      <div className="flex items-center justify-between">
        <p className={`text-xs font-bold uppercase tracking-widest ${accentTitle[accent] ?? 'text-soft'}`}>{title}</p>
        {action}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  )
}

function InfoRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-3 gap-4">{children}</div>
}

function InfoItem({ label, value, large, span, badge }: {
  label: string; value?: string; large?: boolean; span?: number; badge?: string
}) {
  const colClass = span === 2 ? 'col-span-2' : span === 3 ? 'col-span-3' : ''
  return (
    <div className={colClass}>
      <p className="text-[0.65rem] font-semibold uppercase tracking-widest text-gray-400 mb-1">{label}</p>
      {badge && value && value !== '-' ? (
        <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${badgeMap[badge] ?? badgeMap.indigo}`}>{value}</span>
      ) : (
        <p className={`${large ? 'text-base font-semibold text-ink' : 'text-sm text-ink'} ${!value || value === '-' ? 'text-gray-400' : ''}`}>
          {value || '—'}
        </p>
      )}
    </div>
  )
}
