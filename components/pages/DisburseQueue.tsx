'use client'
// Approved leads waiting for the money to be handed over. Left: renewals. Right: new customers. Filter by guarantor.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Session } from '@/types'
import { apiGet, apiSend } from '@/lib/clientApi'

type Row = {
  leadId: string; isRenewal: boolean; customerName: string; phone: string; place: string
  guarantorId: string; guarantorCode: string; guarantorName: string; branchName: string
  principal: number; netDisbursed: number; weekly: number; weeks: number; productLabel: string
  approvedAt: string | null; approvedBy: string; otpVerified: boolean; otpOverrideReason: string
  firstPaymentDate: string; canDisburse: boolean
}
type Data = { firstPaymentDate: string; guarantors: { guarantorId: string; code: string; name: string; renewals: number; newLeads: number }[]; renewals: Row[]; newLeads: Row[] }

const inr = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
const niceDate = (ymd: string) => { const d = new Date(ymd + 'T00:00:00'); return isNaN(d.getTime()) ? ymd : d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }) }

export default function DisburseQueue({ session }: { session: Session }) {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')
  const [guarantor, setGuarantor] = useState('')
  const [confirm, setConfirm] = useState<Row | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const loaded = useRef(false)

  const load = useCallback(async () => {
    const r = await apiGet<Data>(session.token, '/api/disbursements')
    if (r.ok) { setData(r.data!); setError(''); loaded.current = true } else setError(r.error || 'Could not load the list')
  }, [session.token])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); const t = setInterval(() => { if (!confirm) load() }, 20000); return () => clearInterval(t) }, [load, confirm])

  async function disburse(row: Row) {
    setBusy(true)
    const r = await apiSend(session.token, 'PATCH', `/api/leads/${row.leadId}`, { action: 'disburse' })
    setBusy(false)
    if (!r.ok) { setToast(r.error || 'Could not disburse'); setTimeout(() => setToast(''), 4000); return }
    setConfirm(null); setToast(`${row.customerName}: disbursed. First payment ${niceDate(r.data.firstPayment)}.`); setTimeout(() => setToast(''), 5000); load()
  }

  const view = useMemo(() => {
    const keep = (r: Row) => !guarantor || r.guarantorId === guarantor
    return { renewals: (data?.renewals || []).filter(keep), newLeads: (data?.newLeads || []).filter(keep) }
  }, [data, guarantor])

  if (!data && !error) return <div className="flex h-32 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-ink border-t-transparent" /></div>
  if (error && !data) return <p className="rounded-2xl bg-red-50 p-4 text-sm text-red-600">{error} <button onClick={load} className="font-semibold underline">Retry</button></p>

  const group = (rows: Row[]) => {
    const m = new Map<string, Row[]>(); rows.forEach(r => m.set(r.guarantorId, [...(m.get(r.guarantorId) || []), r])); return [...m.entries()]
  }
  const renderColumn = (title: string, rows: Row[], accent: string) => (
    <div className="overflow-hidden rounded-[1.75rem] border border-white/70 bg-white shadow-panel">
      <div className="flex items-center justify-between border-b border-black/5 px-5 py-4">
        <div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${accent}`} /><p className="text-sm font-semibold">{title}</p><span className="rounded-full bg-mist px-2 py-0.5 text-xs font-semibold text-soft">{rows.length}</span></div>
        <p className="text-sm font-semibold">{inr(rows.reduce((s, r) => s + r.netDisbursed, 0))} <span className="text-xs font-normal text-soft">to hand over</span></p>
      </div>
      {rows.length === 0 ? <p className="p-6 text-center text-sm text-soft">Nothing waiting.</p> : group(rows).map(([gid, list]) => (
        <div key={gid}>
          {!guarantor && <p className="bg-panel px-5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-soft">{list[0].guarantorCode} · {list[0].guarantorName}</p>}
          <div className="divide-y divide-black/5">
            {list.map(r => (
              <div key={r.leadId} className="px-5 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{r.customerName}</p>
                    <p className="text-xs text-soft">{r.phone}{r.place ? ` · ${r.place}` : ''}{session.role === 'Admin' && r.branchName ? ` · ${r.branchName}` : ''}</p>
                    <p className="mt-1 text-xs text-ink">{r.weeks ? <>{inr(r.principal)} loan · pays out <b>{inr(r.netDisbursed)}</b> · {inr(r.weekly)} × {r.weeks} weeks</> : r.productLabel}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {r.otpVerified && <span className="rounded-lg bg-green-100 px-2 py-0.5 text-[10px] font-bold uppercase text-green-700">OTP verified</span>}
                      {!r.otpVerified && r.otpOverrideReason && <span title={r.otpOverrideReason} className="rounded-lg bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">Without OTP: {r.otpOverrideReason.slice(0, 50)}</span>}
                      {r.approvedBy && <span className="text-[11px] text-soft">approved by {r.approvedBy}</span>}
                    </div>
                  </div>
                  <button onClick={() => setConfirm(r)} disabled={!r.canDisburse} title={r.canDisburse ? '' : 'Only the branch manager, assistant manager or accountant can disburse'}
                    className="shrink-0 rounded-xl bg-ink px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Mark disbursed</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div className="space-y-4">
      {toast && <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-2xl bg-ink px-5 py-3 text-sm font-medium text-white shadow-lg">{toast}</div>}
      <div className="flex flex-wrap items-center gap-3">
        <select value={guarantor} onChange={e => setGuarantor(e.target.value)} className="rounded-2xl border border-line bg-white px-4 py-2.5 text-sm font-medium">
          <option value="">All guarantors</option>
          {data!.guarantors.map(g => <option key={g.guarantorId} value={g.guarantorId}>{g.code} · {g.name} ({g.renewals} renewal, {g.newLeads} new)</option>)}
        </select>
        <p className="text-xs text-soft">A loan handed over today starts paying on <b className="text-ink">{niceDate(data!.firstPaymentDate)}</b>.</p>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {renderColumn('Renewals', view.renewals, 'bg-green-500')}
        {renderColumn('New customers', view.newLeads, 'bg-blue-500')}
      </div>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-[1.75rem] bg-white p-6 shadow-2xl">
            <p className="text-base font-semibold">Hand over the money?</p>
            <p className="mt-2 text-sm text-soft">Give <b className="text-ink">{inr(confirm.netDisbursed)}</b> to <b className="text-ink">{confirm.customerName}</b>. The loan starts now and the first {inr(confirm.weekly)} is due on <b className="text-ink">{niceDate(confirm.firstPaymentDate)}</b>.</p>
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
