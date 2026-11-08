'use client'
import { useCallback, useEffect, useState } from 'react'
import { Session } from '@/types'
import { downloadTallyExcel, downloadTallyPdf, type TallyData, type TallyRow, type TallyWhich } from '@/lib/tallyExport'

// Summary for the accountant to enter in Tally: recorded payments of one Saturday, per guarantor, with the transaction id and the
// name the bank statement shows. Two statements kept apart (Transaction ID, Cash); downloadable as Excel or PDF.
type Api = TallyData & { guarantors: { guarantorId: string; name: string; code: string }[]; hasBankStatement: boolean }
const money = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN')}`

function saturdayOnOrBefore(d: Date) {   // the collection Saturday of this week (Monday to Sunday), in India time
  const t = new Date(d.getTime() + 5.5 * 3600_000)
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7) + 5)
  return t.toISOString().slice(0, 10)
}
const shift = (ymd: string, days: number) => { const t = new Date(`${ymd}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + days); return t.toISOString().slice(0, 10) }
const checkTone = (s: string) => s === 'Matched' ? 'bg-green-100 text-green-700' : s === 'Amount differs' ? 'bg-amber-100 text-amber-700' : s === 'Not in statement' ? 'bg-red-100 text-red-700' : 'bg-mist text-soft'

export default function TallyReport({ session }: { session: Session }) {
  const [date, setDate] = useState(() => saturdayOnOrBefore(new Date()))
  const [guarantorId, setGuarantorId] = useState('')
  const [data, setData] = useState<Api | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [which, setWhich] = useState<TallyWhich>('both')
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const r = await fetch(`/api/reports/tally?date=${date}${guarantorId ? `&guarantorId=${encodeURIComponent(guarantorId)}` : ''}`, { headers: { Authorization: `Bearer ${session.token}` } })
      const j = await r.json()
      if (!j.success) throw new Error(j.error || 'Could not load')
      setData(j.data)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load') }
    setLoading(false)
  }, [date, guarantorId, session.token])
  useEffect(() => { load() }, [load])

  const tag = guarantorId ? `-${data?.guarantors.find(g => g.guarantorId === guarantorId)?.code || 'guarantor'}` : ''
  async function download(kind: 'excel' | 'pdf') {
    if (!data || busy) return
    const nothing = (which === 'upi' && !data.upi.length) || (which === 'cash' && !data.cash.length) || (which === 'both' && !data.upi.length && !data.cash.length)
    if (nothing) { alert('There are no recorded payments to download for this Saturday.'); return }
    setBusy(kind)
    try {
      const note = kind === 'excel' ? await downloadTallyExcel(data, which, tag) : await downloadTallyPdf(data, which, tag)
      if (note) alert(note)
    } catch { alert('Something went wrong creating the file.') }
    setBusy('')
  }

  const th = 'px-3 py-2 text-left text-xs font-semibold text-soft whitespace-nowrap'
  const td = 'px-3 py-2 text-sm whitespace-nowrap'
  const who = (r: TallyRow) => `${r.guarantor}${r.guarantorCode ? ` (${r.guarantorCode})` : ''}`

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-line bg-white p-4 space-y-3">
        <p className="text-sm text-soft">Recorded payments for one collection Saturday, ready to enter in Tally. The bank name comes from the bank statement uploaded in Payments → Bank check.</p>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setDate(shift(date, -7))} className="rounded-xl border border-line bg-white px-3 py-2 text-sm">‹</button>
          <span className="rounded-xl border border-line bg-mist px-3 py-2 text-sm font-semibold">Saturday {date}</span>
          <button onClick={() => setDate(shift(date, 7))} className="rounded-xl border border-line bg-white px-3 py-2 text-sm">›</button>
          <select value={guarantorId} onChange={e => setGuarantorId(e.target.value)} className="rounded-xl border border-line bg-white px-3 py-2 text-sm">
            <option value="">All guarantors</option>
            {(data?.guarantors || []).map(g => <option key={g.guarantorId} value={g.guarantorId}>{g.name}{g.code ? ` (${g.code})` : ''}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {([['both', 'Both statements'], ['upi', 'Transaction ID only'], ['cash', 'Cash only']] as [TallyWhich, string][]).map(([k, l]) => (
            <button key={k} onClick={() => setWhich(k)} className={`rounded-2xl px-3 py-2 text-sm font-medium ${which === k ? 'bg-ink text-white' : 'border border-line bg-white text-soft'}`}>{l}</button>
          ))}
          <button onClick={() => download('excel')} disabled={!!busy || loading} className="rounded-2xl bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{busy === 'excel' ? 'Preparing…' : 'Download Excel'}</button>
          <button onClick={() => download('pdf')} disabled={!!busy || loading} className="rounded-2xl bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{busy === 'pdf' ? 'Preparing…' : 'Download PDF'}</button>
        </div>
        {data && !data.hasBankStatement && <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">No bank statement has been uploaded yet, so the bank name and check columns will be empty. Upload it in Payments → Bank check.</p>}
      </div>

      {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {loading && <div className="flex h-24 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-ink border-t-transparent" /></div>}

      {!loading && data && (
        <>
          <div className="rounded-2xl border border-line bg-white">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="font-semibold">Transaction ID statement</p>
              <p className="text-sm text-soft">{data.upi.length} payment{data.upi.length === 1 ? '' : 's'} · <span className="font-semibold text-ink">{money(data.totals.upi)}</span></p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead><tr className="bg-mist"><th className={th}>Guarantor</th><th className={th}>Customer</th><th className={th}>Code</th><th className={th}>Amount</th><th className={th}>Mode</th><th className={th}>Transaction ID</th><th className={th}>Paid date</th><th className={th}>Bank statement name</th><th className={th}>Bank check</th></tr></thead>
                <tbody>
                  {data.upi.map((r, i) => (
                    <tr key={i} className="border-t border-line/60">
                      <td className={td}>{who(r)}</td><td className={td}>{r.customer}</td><td className={td}>{r.code}</td><td className={`${td} font-semibold`}>{money(r.amount)}</td>
                      <td className={td}>{r.mode}</td><td className={`${td} font-mono text-xs`}>{r.utr}</td><td className={td}>{r.paidDate}</td><td className={td}>{r.bankName || '—'}</td>
                      <td className={td}><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${checkTone(r.bankCheck)}`}>{r.bankCheck}</span></td>
                    </tr>
                  ))}
                  {!data.upi.length && <tr><td className="px-4 py-6 text-center text-sm text-soft" colSpan={9}>No transaction-ID payments recorded for this Saturday.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-white">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="font-semibold">Cash statement</p>
              <p className="text-sm text-soft">{data.cash.length} payment{data.cash.length === 1 ? '' : 's'} · <span className="font-semibold text-ink">{money(data.totals.cash)}</span></p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead><tr className="bg-mist"><th className={th}>Guarantor</th><th className={th}>Customer</th><th className={th}>Code</th><th className={th}>Amount</th><th className={th}>Mode</th><th className={th}>Paid date</th><th className={th}>Recorded by</th></tr></thead>
                <tbody>
                  {data.cash.map((r, i) => (
                    <tr key={i} className="border-t border-line/60">
                      <td className={td}>{who(r)}</td><td className={td}>{r.customer}</td><td className={td}>{r.code}</td><td className={`${td} font-semibold`}>{money(r.amount)}</td>
                      <td className={td}>{r.mode}</td><td className={td}>{r.paidDate}</td><td className={td}>{r.markedBy}</td>
                    </tr>
                  ))}
                  {!data.cash.length && <tr><td className="px-4 py-6 text-center text-sm text-soft" colSpan={7}>No cash payments recorded for this Saturday.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
