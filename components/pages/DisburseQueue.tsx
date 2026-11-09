'use client'
// Approved leads waiting for the money to be handed over. Left: renewals. Right: new customers. Filter by guarantor.
// The money goes out through the bank's payment portal: staff check each customer's bank details (and verify them by phone),
// select the customers, create the bank files (one for renewals, one for new customers), upload them in the portal, and only
// then press "Mark disbursed" (which creates the loan).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Session } from '@/types'
import { apiGet, apiSend } from '@/lib/clientApi'
import { save } from '@/lib/tallyExport'
import { fileToPayload } from './SubmitLeadPage'
import DriveImage from '@/components/ui/DriveImage'

type Row = {
  leadId: string; isRenewal: boolean; customerName: string; phone: string; place: string
  guarantorId: string; guarantorCode: string; guarantorName: string; branchName: string
  principal: number; netDisbursed: number; weekly: number; weeks: number; productLabel: string
  approvedAt: string | null; approvedBy: string; otpVerified: boolean; otpOverrideReason: string
  firstPaymentDate: string; canDisburse: boolean
  bankIfsc: string; bankAccount: string; bankName: string; bankMode: string; passbookUrl: string; bankIssues: string[]; bankVerified: boolean
  payNumber: string; inFile: { fileName: string; reference: string } | null
}
type Data = { firstPaymentDate: string; guarantors: { guarantorId: string; code: string; name: string; renewals: number; newLeads: number }[]; renewals: Row[]; newLeads: Row[] }
type Batch = { batchId: string; fileName: string; kind: 'renewal' | 'new'; fileDate: string; count: number; total: number; status: 'created' | 'cancelled'; createdAt: string; disbursed: number; cancelReason: string }

const inr = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
const niceDate = (ymd: string) => { const d = new Date(ymd + 'T00:00:00'); return isNaN(d.getTime()) ? ymd : d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }) }
const maskAcc = (a: string) => a.length > 4 ? `••••${a.slice(-4)}` : a
const inputCls = 'w-full rounded-xl border border-line bg-mist px-3 py-2 text-sm outline-none focus:border-ink focus:bg-white'

export default function DisburseQueue({ session }: { session: Session }) {
  const [data, setData] = useState<Data | null>(null)
  const [batches, setBatches] = useState<Batch[]>([])
  const [error, setError] = useState('')
  const [guarantor, setGuarantor] = useState('')
  const [confirm, setConfirm] = useState<Row | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bankFor, setBankFor] = useState<Row | null>(null)
  const [bankForm, setBankForm] = useState({ account: '', ifsc: '', name: '', verified: false, passbook: '' })
  const [bankErr, setBankErr] = useState('')
  const [preview, setPreview] = useState(false)
  const [refStart, setRefStart] = useState('')
  const [cancelFor, setCancelFor] = useState<Batch | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [showFiles, setShowFiles] = useState(false)
  const [deleteFor, setDeleteFor] = useState<Batch | null>(null)
  const loaded = useRef(false)
  const say = (m: string, ms = 5000) => { setToast(m); setTimeout(() => setToast(''), ms) }

  const load = useCallback(async () => {
    const [r, b] = await Promise.all([apiGet<Data>(session.token, '/api/disbursements'), apiGet<{ batches: Batch[] }>(session.token, '/api/disbursements/bank')])
    if (r.ok) { setData(r.data!); setError(''); loaded.current = true } else setError(r.error || 'Could not load the list')
    if (b.ok) setBatches(b.data!.batches)
  }, [session.token])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); const t = setInterval(() => { if (!confirm && !bankFor && !preview) load() }, 20000); return () => clearInterval(t) }, [load, confirm, bankFor, preview])

  async function disburse(row: Row) {
    setBusy(true)
    const r = await apiSend(session.token, 'PATCH', `/api/leads/${row.leadId}`, { action: 'disburse' })
    setBusy(false)
    if (!r.ok) { say(r.error || 'Could not disburse', 4000); return }
    setConfirm(null); say(`${row.customerName}: disbursed. First payment ${niceDate(r.data.firstPayment)}.`); load()
  }

  function openBank(r: Row) {
    setBankFor(r); setBankErr('')
    setBankForm({ account: r.bankAccount, ifsc: r.bankIfsc, name: r.bankName || r.customerName, verified: false, passbook: '' })
  }
  async function saveBank() {
    if (!bankFor) return
    setBusy(true); setBankErr('')
    const r = await apiSend(session.token, 'POST', '/api/disbursements/bank', {
      action: 'saveDetails', leadId: bankFor.leadId, accountNumber: bankForm.account, ifscCode: bankForm.ifsc, accountHolder: bankForm.name,
      verified: bankForm.verified, passbookPhoto: bankForm.passbook || undefined,
    })
    setBusy(false)
    if (!r.ok) { setBankErr(r.error || 'Could not save'); return }
    setBankFor(null); say(bankForm.verified ? 'Bank details saved and marked verified.' : 'Bank details saved. They still need to be verified with the customer.'); load()
  }

  async function download(b: { batchId: string; fileName: string }) {
    const res = await fetch(`/api/disbursements/bank?batchId=${encodeURIComponent(b.batchId)}`, { headers: { Authorization: `Bearer ${session.token}` } })
    if (!res.ok) { let m = 'Could not download the file'; try { m = (await res.json()).error || m } catch { /* keep */ } say(m); return }
    await save(`${b.fileName}.xls`, 'application/vnd.ms-excel', new Uint8Array(await res.arrayBuffer()))
  }
  async function createFiles() {
    setBusy(true)
    const r = await apiSend(session.token, 'POST', '/api/disbursements/bank', { action: 'createFiles', leadIds: [...selected], refStart: refStart ? Number(refStart) : undefined })
    setBusy(false)
    if (!r.ok) { say(r.error || 'Could not create the files', 12000); return }
    const made = r.data.created as { batchId: string; fileName: string; kind: string; count: number; total: number }[]
    setPreview(false); setSelected(new Set()); setRefStart('')
    for (const b of made) await download(b)
    say(`Made ${made.map(b => `${b.fileName} (${b.count})`).join(' and ')}. Upload in the bank portal, then press Mark disbursed.`, 9000); load()
  }
  async function cancelBatch() {
    if (!cancelFor) return
    setBusy(true)
    const r = await apiSend(session.token, 'POST', '/api/disbursements/bank', { action: 'cancelBatch', batchId: cancelFor.batchId, reason: cancelReason })
    setBusy(false)
    if (!r.ok) { say(r.error || 'Could not cancel', 6000); return }
    setCancelFor(null); setCancelReason(''); say(`${cancelFor.fileName} cancelled. Its customers can go in a new file.`); load()
  }

  async function deleteBatch() {
    if (!deleteFor) return
    setBusy(true)
    const r = await apiSend(session.token, 'POST', '/api/disbursements/bank', { action: 'deleteBatch', batchId: deleteFor.batchId })
    setBusy(false)
    if (!r.ok) { say(r.error || 'Could not delete', 6000); return }
    setDeleteFor(null); say(`${deleteFor.fileName} deleted. Its file number and reference numbers are free again.`); load()
  }

  const view = useMemo(() => {
    const keep = (r: Row) => !guarantor || r.guarantorId === guarantor
    return { renewals: (data?.renewals || []).filter(keep), newLeads: (data?.newLeads || []).filter(keep) }
  }, [data, guarantor])
  const canFile = (r: Row) => r.canDisburse && !r.inFile && r.bankIssues.length === 0 && r.bankVerified
  const all = useMemo(() => [...(data?.renewals || []), ...(data?.newLeads || [])], [data])
  const chosen = all.filter(r => selected.has(r.leadId))
  const toggle = (id: string) => setSelected(p => { const s = new Set(p); s.has(id) ? s.delete(id) : s.add(id); return s })

  if (!data && !error) return <div className="flex h-32 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-ink border-t-transparent" /></div>
  if (error && !data) return <p className="rounded-2xl bg-red-50 p-4 text-sm text-red-600">{error} <button onClick={load} className="font-semibold underline">Retry</button></p>

  const group = (rows: Row[]) => {
    const m = new Map<string, Row[]>(); rows.forEach(r => m.set(r.guarantorId, [...(m.get(r.guarantorId) || []), r])); return [...m.entries()]
  }
  const bankChip = (r: Row) => r.inFile
    ? <span className="rounded-lg bg-indigo-100 px-2 py-0.5 text-[10px] font-bold uppercase text-indigo-700">In file {r.inFile.fileName} · ref {r.inFile.reference}</span>
    : r.bankIssues.length ? <span className="rounded-lg bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase text-red-700">Bank details {r.bankAccount || r.bankIfsc ? 'need fixing' : 'missing'}</span>
    : r.bankVerified ? <span className="rounded-lg bg-green-100 px-2 py-0.5 text-[10px] font-bold uppercase text-green-700">Bank details verified</span>
    : <span className="rounded-lg bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">Verify bank details with the customer</span>

  const renderColumn = (title: string, rows: Row[], accent: string) => (
    <div className="overflow-hidden rounded-[1.75rem] border border-white/70 bg-white shadow-panel">
      <div className="flex items-center justify-between border-b border-black/5 px-5 py-4">
        <div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${accent}`} /><p className="text-sm font-semibold">{title}</p><span className="rounded-full bg-mist px-2 py-0.5 text-xs font-semibold text-soft">{rows.length}</span></div>
        <div className="flex items-center gap-3">
          {rows.some(canFile) && <button onClick={() => setSelected(p => { const s = new Set(p); const ready = rows.filter(canFile); const allOn = ready.every(r => s.has(r.leadId)); ready.forEach(r => allOn ? s.delete(r.leadId) : s.add(r.leadId)); return s })} className="text-xs font-semibold text-soft underline">Select all ready</button>}
          <p className="text-sm font-semibold">{inr(rows.reduce((s, r) => s + r.netDisbursed, 0))} <span className="text-xs font-normal text-soft">to hand over</span></p>
        </div>
      </div>
      {rows.length === 0 ? <p className="p-6 text-center text-sm text-soft">Nothing waiting.</p> : group(rows).map(([gid, list]) => (
        <div key={gid}>
          {!guarantor && <p className="bg-panel px-5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-soft">{list[0].guarantorCode} · {list[0].guarantorName}</p>}
          <div className="divide-y divide-black/5">
            {list.map(r => (
              <div key={r.leadId} className="px-5 py-3">
                <div className="flex items-start justify-between gap-3">
                  <label className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center ${canFile(r) ? 'cursor-pointer' : 'opacity-30'}`} title={canFile(r) ? 'Select for the bank file' : 'Bank details must be complete and verified, and not already in a file'}>
                    <input type="checkbox" checked={selected.has(r.leadId)} disabled={!canFile(r)} onChange={() => toggle(r.leadId)} className="h-4 w-4" />
                  </label>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{r.customerName}{r.payNumber && <span className="ml-2 font-mono text-xs font-normal text-soft">#{r.payNumber}</span>}</p>
                    <p className="text-xs text-soft">{r.phone}{r.place ? ` · ${r.place}` : ''}{session.role === 'Admin' && r.branchName ? ` · ${r.branchName}` : ''}</p>
                    <p className="mt-1 text-xs text-ink">{r.weeks ? <>{inr(r.principal)} loan · pays out <b>{inr(r.netDisbursed)}</b> · {inr(r.weekly)} × {r.weeks} weeks</> : r.productLabel}</p>
                    <p className="mt-1 text-xs text-soft">{r.bankAccount ? <><b className="font-mono text-ink">{r.bankIfsc}</b> · A/C <b className="font-mono text-ink">{maskAcc(r.bankAccount)}</b> · {r.bankName || '—'} · {r.bankMode === 'S' ? 'South Indian Bank' : 'NEFT'}</> : 'No bank account saved yet'}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {bankChip(r)}
                      {r.otpVerified && <span className="rounded-lg bg-green-100 px-2 py-0.5 text-[10px] font-bold uppercase text-green-700">OTP verified</span>}
                      {!r.otpVerified && r.otpOverrideReason && <span title={r.otpOverrideReason} className="rounded-lg bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">Without OTP: {r.otpOverrideReason.slice(0, 40)}</span>}
                      {r.approvedBy && <span className="text-[11px] text-soft">approved by {r.approvedBy}</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1.5">
                    <button onClick={() => openBank(r)} disabled={!r.canDisburse || !!r.inFile} className="rounded-xl border border-line px-3 py-2 text-xs font-semibold disabled:opacity-40">Bank details</button>
                    <button onClick={() => setConfirm(r)} disabled={!r.canDisburse} title={r.canDisburse ? '' : 'Only the branch manager, assistant manager or accountant can disburse'}
                      className="rounded-xl bg-ink px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Mark disbursed</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )

  const previewRows = (rows: Row[]) => (
    <table className="min-w-full text-xs">
      <thead><tr className="bg-mist text-left"><th className="px-2 py-1.5">Customer</th><th className="px-2 py-1.5">S/N</th><th className="px-2 py-1.5">IFSC</th><th className="px-2 py-1.5">Account number</th><th className="px-2 py-1.5">Name in bank</th><th className="px-2 py-1.5 text-right">Amount</th><th className="px-2 py-1.5">Remarks</th></tr></thead>
      <tbody>{rows.map(r => (
        <tr key={r.leadId} className="border-t border-line/60">
          <td className="px-2 py-1.5">{r.customerName}</td><td className="px-2 py-1.5 font-bold">{r.bankMode}</td><td className="px-2 py-1.5 font-mono">{r.bankIfsc}</td>
          <td className="px-2 py-1.5 font-mono">{r.bankAccount}</td><td className="px-2 py-1.5">{r.bankName}</td><td className="px-2 py-1.5 text-right font-semibold">{inr(r.netDisbursed)}</td>
          <td className="px-2 py-1.5 font-mono">LEND {r.payNumber || 'new no.'}</td>
        </tr>))}</tbody>
    </table>
  )

  return (
    <div className="space-y-4">
      {toast && <div className="fixed left-1/2 top-4 z-50 max-w-[90vw] -translate-x-1/2 rounded-2xl bg-ink px-5 py-3 text-sm font-medium text-white shadow-lg">{toast}</div>}
      <div className="flex flex-wrap items-center gap-3">
        <select value={guarantor} onChange={e => setGuarantor(e.target.value)} className="rounded-2xl border border-line bg-white px-4 py-2.5 text-sm font-medium">
          <option value="">All guarantors</option>
          {data!.guarantors.map(g => <option key={g.guarantorId} value={g.guarantorId}>{g.code} · {g.name} ({g.renewals} renewal, {g.newLeads} new)</option>)}
        </select>
        <button onClick={() => setPreview(true)} disabled={!selected.size} className="rounded-2xl bg-gold px-4 py-2.5 text-sm font-semibold text-[#1a1400] disabled:opacity-40">Create bank file{selected.size ? ` (${selected.size})` : ''}</button>
        <button onClick={() => setShowFiles(v => !v)} className="rounded-2xl border border-line bg-white px-4 py-2.5 text-sm font-semibold">Bank files{batches.length ? ` (${batches.filter(b => b.status === 'created').length})` : ''}</button>
        <p className="text-xs text-soft">A loan handed over today starts paying on <b className="text-ink">{niceDate(data!.firstPaymentDate)}</b>.</p>
      </div>

      {showFiles && (
        <div className="rounded-[1.75rem] border border-white/70 bg-white p-5 shadow-panel">
          <p className="mb-2 text-sm font-semibold">Bank files of the last 14 days</p>
          {batches.length === 0 ? <p className="text-sm text-soft">No bank files yet.</p> : (
            <div className="divide-y divide-black/5">
              {batches.map(b => (
                <div key={b.batchId} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <div>
                    <p className="font-mono font-semibold">{b.fileName}.xls {b.status === 'cancelled' && <span className="ml-1 rounded-lg bg-red-100 px-2 py-0.5 font-sans text-[10px] font-bold uppercase text-red-700">Cancelled</span>}</p>
                    <p className="text-xs text-soft">{b.kind === 'renewal' ? 'Renewals' : 'New customers'} · {b.count} customers · {inr(b.total)} · {b.disbursed} of {b.count} marked disbursed{b.cancelReason ? ` · ${b.cancelReason}` : ''}</p>
                  </div>
                  <div className="flex gap-2">
                    {b.status === 'created' && <button onClick={() => download(b)} className="rounded-xl bg-ink px-3 py-1.5 text-xs font-semibold text-white">Download again</button>}
                    {b.status === 'created' && b.disbursed === 0 && <button onClick={() => { setCancelFor(b); setCancelReason('') }} className="rounded-xl border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600">Cancel file</button>}
                    {b.disbursed === 0 && <button onClick={() => setDeleteFor(b)} className="rounded-xl bg-red-600 px-3 py-1.5 text-xs font-semibold text-white">Delete</button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {renderColumn('Renewals', view.renewals, 'bg-green-500')}
        {renderColumn('New customers', view.newLeads, 'bg-blue-500')}
      </div>

      {bankFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm">
          <div className="my-6 w-full max-w-md rounded-[1.75rem] bg-white p-6 shadow-2xl">
            <p className="text-base font-semibold">Bank details · {bankFor.customerName}</p>
            <p className="mt-1 text-xs text-soft">{bankFor.isRenewal ? 'Saved on the customer from the last loan: call them and check each item before you verify.' : 'Entered by the agent at verification: call the customer and check each item.'} Wrong details here mean the money goes to the wrong account.</p>
            <div className="mt-4 space-y-3">
              <label className="block"><span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-soft">Account number</span><input value={bankForm.account} onChange={e => setBankForm(f => ({ ...f, account: e.target.value }))} inputMode="numeric" className={inputCls + ' font-mono'} /></label>
              <label className="block"><span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-soft">IFSC code</span><input value={bankForm.ifsc} onChange={e => setBankForm(f => ({ ...f, ifsc: e.target.value.toUpperCase() }))} maxLength={11} className={inputCls + ' font-mono'} /></label>
              <label className="block"><span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-soft">Name in the bank account (as in the passbook)</span><input value={bankForm.name} onChange={e => setBankForm(f => ({ ...f, name: e.target.value }))} className={inputCls} /></label>
              <div>
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-soft">Passbook photo</span>
                {bankFor.passbookUrl && !bankForm.passbook && <div className="mb-2 max-w-[220px]"><DriveImage url={bankFor.passbookUrl} label="Passbook" token={session.token} /></div>}
                {bankForm.passbook && <p className="mb-1 text-xs text-green-700">New photo added. It is saved with the details.</p>}
                <input type="file" accept="image/*" onChange={async e => { const f = e.target.files?.[0]; if (f) { const d = await fileToPayload(f); setBankForm(p => ({ ...p, passbook: d })) } }} className="w-full rounded-xl border border-line px-3 py-2 text-sm" />
              </div>
              <label className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm">
                <input type="checkbox" checked={bankForm.verified} onChange={e => setBankForm(f => ({ ...f, verified: e.target.checked }))} className="mt-0.5 h-4 w-4" />
                <span>I called the customer and checked the account number, IFSC and name{bankFor.passbookUrl || bankForm.passbook ? ' against the passbook photo' : ''}. They are correct.</span>
              </label>
              {bankErr && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{bankErr}</p>}
            </div>
            <div className="mt-5 flex gap-2">
              <button onClick={saveBank} disabled={busy} className="flex-1 rounded-2xl bg-ink px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : bankForm.verified ? 'Save and mark verified' : 'Save'}</button>
              <button onClick={() => setBankFor(null)} disabled={busy} className="rounded-2xl border border-line px-4 py-3 text-sm font-semibold">Close</button>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm">
          <div className="my-6 w-full max-w-5xl rounded-[1.75rem] bg-white p-6 shadow-2xl">
            <p className="text-base font-semibold">Check before the bank file is made</p>
            <p className="mt-1 text-sm text-soft">Read every row against the passbook. After this the file is saved with its reference numbers; they can never be reused.</p>
            {(['renewal', 'new'] as const).map(k => {
              const rows = chosen.filter(r => (k === 'renewal') === r.isRenewal)
              return rows.length ? (
                <div key={k} className="mt-4 overflow-x-auto rounded-2xl border border-line">
                  <p className="bg-panel px-3 py-2 text-xs font-bold uppercase tracking-wider text-soft">{k === 'renewal' ? 'Renewals file' : 'New customers file'} · {rows.length} · {inr(rows.reduce((s, r) => s + r.netDisbursed, 0))}</p>
                  {previewRows(rows)}
                </div>
              ) : null
            })}
            <label className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-soft">Reference numbers start at</span>
              <input value={refStart} onChange={e => setRefStart(e.target.value.replace(/\D/g, ''))} placeholder="next free" className="w-24 rounded-xl border border-line px-3 py-1.5 text-sm" inputMode="numeric" />
              <span className="text-xs text-soft">Leave empty. Fill it only if a file was made by hand today: type the number after the last one used.</span>
            </label>
            <div className="mt-5 flex gap-2">
              <button onClick={createFiles} disabled={busy} className="flex-1 rounded-2xl bg-green-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Making the files…' : 'Everything is correct: create and download'}</button>
              <button onClick={() => setPreview(false)} disabled={busy} className="rounded-2xl border border-line px-4 py-3 text-sm font-semibold">Back</button>
            </div>
          </div>
        </div>
      )}

      {deleteFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-[1.75rem] bg-white p-6 shadow-2xl">
            <p className="text-base font-semibold">Delete {deleteFor.fileName} for good?</p>
            <p className="mt-2 text-sm text-soft">This is for <b>test files</b>. The file is erased and its file number and reference numbers can be used again, so the next file starts again from the lowest free number.</p>
            <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-800"><b>Never delete a file that was uploaded to the bank.</b> A new file would reuse the same reference numbers and the bank payment can fail or be paid twice.</p>
            <div className="mt-4 flex gap-2">
              <button onClick={deleteBatch} disabled={busy} className="flex-1 rounded-2xl bg-red-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Deleting…' : 'Yes, delete this test file'}</button>
              <button onClick={() => setDeleteFor(null)} disabled={busy} className="rounded-2xl border border-line px-4 py-3 text-sm font-semibold">Keep it</button>
            </div>
          </div>
        </div>
      )}

      {cancelFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-[1.75rem] bg-white p-6 shadow-2xl">
            <p className="text-base font-semibold">Cancel {cancelFor.fileName}?</p>
            <p className="mt-2 text-sm text-soft">Only cancel a file that was <b>not</b> uploaded or paid at the bank. If it was paid, press Mark disbursed instead, or the customers could be paid twice.</p>
            <textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)} rows={3} placeholder="Reason (required)" className={inputCls + ' mt-3'} />
            <div className="mt-4 flex gap-2">
              <button onClick={cancelBatch} disabled={busy || cancelReason.trim().length < 3} className="flex-1 rounded-2xl bg-red-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Cancelling…' : 'Cancel the file'}</button>
              <button onClick={() => setCancelFor(null)} disabled={busy} className="rounded-2xl border border-line px-4 py-3 text-sm font-semibold">Keep it</button>
            </div>
          </div>
        </div>
      )}

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-[1.75rem] bg-white p-6 shadow-2xl">
            <p className="text-base font-semibold">Hand over the money?</p>
            <p className="mt-2 text-sm text-soft">Give <b className="text-ink">{inr(confirm.netDisbursed)}</b> to <b className="text-ink">{confirm.customerName}</b>. The loan starts now and the first {inr(confirm.weekly)} is due on {niceDate(confirm.firstPaymentDate)}.</p>
            {!confirm.inFile && <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">This customer is not in any bank file. Press Yes only if the money was paid another way.</p>}
            <div className="mt-5 flex gap-2">
              <button onClick={() => disburse(confirm)} disabled={busy} className="flex-1 rounded-2xl bg-green-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Creating loan…' : 'Yes, disbursed'}</button>
              <button onClick={() => setConfirm(null)} disabled={busy} className="rounded-2xl border border-line px-4 py-3 text-sm font-semibold">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
