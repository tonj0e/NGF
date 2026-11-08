'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Session } from '@/types'
import { downloadSheetXlsx } from '@/lib/tallyExport'

// AI usage (Admin): what the AI readers used, laid out like the OpenRouter dashboard. NGF (the workspace) > Activity | Logs.
// Data: /api/ai-usage, from the ai_usage log (every screenshot read, whichever provider answered).
type Totals = { spend: number; requests: number; okRequests: number; errors: number; tokensIn: number; tokensOut: number; tokens: number; cacheRate: number; perRead: number; perMillion: number; cutOff: number }
type Day = { day: string; spend: number; requests: number; tokensIn: number; tokensOut: number; reasoning: number; cached: number }
type Group = { name: string; requests: number; spend: number; tokens: number }
type Activity = { from: string; to: string; totals: Totals; previous: Totals; hasPrevious: boolean; byDay: Day[]; byModel: Group[]; byProvider: Group[]; byPurpose: Group[] }
type LogRow = { id: string; at: string; provider: string; model: string; purpose: string; guarantor: string; tokensIn: number; tokensOut: number; reasoning: number; cached: number; costUsd: number; ms: number; tokPerSec: number; status: string; finish: string; error: string }
type Logs = { total: number; page: number; totalPages: number; models: string[]; guarantors: { guarantorId: string; name: string }[]; rows: LogRow[] }

const usd = (n: number, d = 4) => `$${Number(n || 0).toFixed(d)}`
const num = (n: number) => Number(n || 0).toLocaleString('en-IN')
const short = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(Math.round(n))
const todayIst = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)
const shift = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400_000).toISOString().slice(0, 10)
const monday = (d: string) => shift(d, -((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7))
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })

type Preset = 'today' | 'yesterday' | 'week' | 'last7' | 'month' | 'last30' | 'prevMonth' | 'custom'
const PRESETS: { key: Preset; label: string }[] = [
  { key: 'today', label: 'Today' }, { key: 'yesterday', label: 'Yesterday' }, { key: 'week', label: 'This week' }, { key: 'last7', label: 'Past 7 days' },
  { key: 'month', label: 'This month' }, { key: 'last30', label: 'Past 30 days' }, { key: 'prevMonth', label: 'Previous month' }, { key: 'custom', label: 'Custom range' },
]
function rangeOf(p: Preset, customFrom: string, customTo: string): { from: string; to: string } {
  const t = todayIst()
  if (p === 'today') return { from: t, to: t }
  if (p === 'yesterday') return { from: shift(t, -1), to: shift(t, -1) }
  if (p === 'week') return { from: monday(t), to: t }
  if (p === 'last7') return { from: shift(t, -6), to: t }
  if (p === 'last30') return { from: shift(t, -29), to: t }
  if (p === 'prevMonth') { const first = `${t.slice(0, 8)}01`; const last = shift(first, -1); return { from: `${last.slice(0, 8)}01`, to: last } }
  if (p === 'custom') return { from: customFrom || t, to: customTo || t }
  return { from: `${t.slice(0, 8)}01`, to: t }
}

// A small bar chart: one bar per day (or stacked), with a tooltip on every bar
function Bars({ days, parts, fmt }: { days: Day[]; parts: { key: keyof Day; label: string; color: string }[]; fmt: (n: number) => string }) {
  const totalOf = (d: Day) => parts.reduce((t, p) => t + Number(d[p.key] || 0), 0)
  const max = Math.max(...days.map(totalOf), 0)
  return (
    <div>
      <div className="flex h-40 items-end gap-1">
        {days.map(d => (
          <div key={d.day} className="flex h-full min-w-[6px] flex-1 flex-col justify-end" title={`${d.day}\n${parts.map(p => `${p.label}: ${fmt(Number(d[p.key] || 0))}`).join('\n')}`}>
            {parts.slice().reverse().map(p => {
              const v = Number(d[p.key] || 0)
              return v > 0 && max > 0 ? <div key={String(p.key)} style={{ height: `${(v / max) * 100}%`, background: p.color, minHeight: 2 }} /> : null
            })}
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-soft"><span>{days[0]?.day.slice(5)}</span><span>{days[days.length - 1]?.day.slice(5)}</span></div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-soft">{parts.map(p => <span key={String(p.key)} className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />{p.label}</span>)}</div>
    </div>
  )
}

function Change({ now, before, show }: { now: number; before: number; show: boolean }) {
  if (!show || !before) return <p className="mt-1 text-xs text-soft">No prior data</p>
  const pct = ((now - before) / before) * 100
  return <p className={`mt-1 text-xs ${pct > 0 ? 'text-amber-600' : 'text-green-600'}`}>{pct > 0 ? '↑' : '↓'} {Math.abs(pct).toFixed(1)}% <span className="text-soft">vs previous period</span></p>
}

export default function AIPage({ session }: { session: Session }) {
  const [tab, setTab] = useState<'activity' | 'logs'>('activity')
  const [preset, setPreset] = useState<Preset>('month')
  const [cFrom, setCFrom] = useState(todayIst())
  const [cTo, setCTo] = useState(todayIst())
  const range = useMemo(() => rangeOf(preset, cFrom, cTo), [preset, cFrom, cTo])
  const [act, setAct] = useState<Activity | null>(null)
  const [logs, setLogs] = useState<Logs | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [provider, setProvider] = useState(''), [model, setModel] = useState(''), [status, setStatus] = useState(''), [guarantorId, setGuarantorId] = useState('')
  const [sort, setSort] = useState<'date' | 'cost' | 'tokens'>('date'), [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const [busy, setBusy] = useState(false)

  const call = useCallback(async (qs: string) => {
    const r = await fetch(`/api/ai-usage?${qs}`, { headers: { Authorization: `Bearer ${session.token}` } })
    const j = await r.json()
    if (!j.success) throw new Error(j.error || 'Could not load')
    return j.data
  }, [session.token])

  useEffect(() => {
    let off = false
    setLoading(true); setError('')
    const base = `from=${range.from}&to=${range.to}`
    const run = tab === 'activity'
      ? call(`view=activity&${base}`).then(d => { if (!off) setAct(d) })
      : call(`view=logs&${base}&page=${page}&sort=${sort}&dir=${dir}&provider=${provider}&model=${encodeURIComponent(model)}&status=${status}&guarantorId=${guarantorId}`).then(d => { if (!off) setLogs(d) })
    run.catch(e => { if (!off) setError(e instanceof Error ? e.message : 'Could not load') }).finally(() => { if (!off) setLoading(false) })
    return () => { off = true }
  }, [tab, range.from, range.to, page, sort, dir, provider, model, status, guarantorId, call])
  useEffect(() => { setPage(1) }, [range.from, range.to, provider, model, status, guarantorId, sort, dir])

  async function exportXlsx() {
    setBusy(true)
    try {
      const d: Logs = await call(`view=logs&from=${range.from}&to=${range.to}&all=1&sort=${sort}&dir=${dir}&provider=${provider}&model=${encodeURIComponent(model)}&status=${status}&guarantorId=${guarantorId}`)
      if (!d.rows.length) { alert('There are no calls in this range.'); return }
      const head = ['Date (IST)', 'Provider', 'Model', 'Purpose', 'Guarantor', 'Input tokens', 'Output tokens', 'Thinking tokens', 'Cached tokens', 'Cost (USD)', 'Time (ms)', 'Tokens/sec', 'Status', 'Finish', 'Error']
      const rows = d.rows.map(r => [when(r.at), r.provider, r.model, r.purpose, r.guarantor, r.tokensIn, r.tokensOut, r.reasoning, r.cached, r.costUsd, r.ms, r.tokPerSec, r.status, r.finish, r.error])
      const note = await downloadSheetXlsx(`ai-usage-${range.from}-to-${range.to}.xlsx`, 'AI usage', head, rows)
      if (note) alert(note)
    } catch (e) { alert(e instanceof Error ? e.message : 'Could not create the file') }
    setBusy(false)
  }

  const sortBtn = (k: 'date' | 'cost' | 'tokens', label: string) => (
    <button onClick={() => { if (sort === k) setDir(dir === 'desc' ? 'asc' : 'desc'); else { setSort(k); setDir('desc') } }} className="font-semibold hover:text-ink">
      {label}{sort === k ? (dir === 'desc' ? ' ↓' : ' ↑') : ''}
    </button>
  )
  const th = 'px-3 py-2 text-left text-xs font-semibold text-soft whitespace-nowrap'
  const td = 'px-3 py-2 text-sm whitespace-nowrap'
  const sel = 'rounded-xl border border-line bg-white px-3 py-2 text-sm'

  const t = act?.totals, p = act?.previous
  const cards = t && p ? [
    { label: 'Total spend', value: usd(t.spend, 4), now: t.spend, before: p.spend },
    { label: 'Requests', value: num(t.requests), now: t.requests, before: p.requests },
    { label: 'Token volume', value: short(t.tokens), now: t.tokens, before: p.tokens },
    { label: 'Cache hit rate', value: `${(t.cacheRate * 100).toFixed(1)}%`, now: 0, before: 0 },
    { label: 'Average per read', value: usd(t.perRead, 5), now: t.perRead, before: p.perRead },
    { label: 'Blended $/1M tokens', value: usd(t.perMillion, 2), now: t.perMillion, before: p.perMillion },
  ] : []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-soft">NGF</p>
          <h1 className="text-2xl font-semibold">{tab === 'activity' ? 'Activity' : 'Logs'}</h1>
          <p className="text-sm text-soft">{tab === 'activity' ? 'What the AI readers used, across providers and models.' : 'One row for every AI call.'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={preset} onChange={e => setPreset(e.target.value as Preset)} className={sel}>{PRESETS.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}</select>
          {preset === 'custom' && <>
            <input type="date" value={cFrom} onChange={e => setCFrom(e.target.value)} className={sel} />
            <input type="date" value={cTo} onChange={e => setCTo(e.target.value)} className={sel} />
          </>}
        </div>
      </div>

      <div className="flex gap-2 border-b border-line">
        {(['activity', 'logs'] as const).map(k => (
          <button key={k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === k ? 'border-ink text-ink' : 'border-transparent text-soft hover:text-ink'}`}>{k === 'activity' ? 'Activity' : 'Logs'}</button>
        ))}
      </div>
      <p className="text-xs text-soft">{range.from === range.to ? range.from : `${range.from} to ${range.to}`} (India time)</p>

      {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {loading && <div className="flex h-24 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-ink border-t-transparent" /></div>}

      {!loading && tab === 'activity' && act && t && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map(c => (
              <div key={c.label} className="rounded-2xl border border-line bg-white p-4">
                <p className="text-xs text-soft">{c.label}</p>
                <p className="mt-1 text-2xl font-semibold">{c.value}</p>
                {c.label === 'Cache hit rate' ? <p className="mt-1 text-xs text-soft">share of input tokens served from cache</p> : <Change now={c.now} before={c.before} show={act.hasPrevious} />}
              </div>
            ))}
          </div>
          {(t.errors > 0 || t.cutOff > 0) && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {t.errors > 0 && `${t.errors} call${t.errors === 1 ? '' : 's'} failed. `}{t.cutOff > 0 && `${t.cutOff} call${t.cutOff === 1 ? ' was' : 's were'} cut off at the answer limit.`} See Logs, filter Status.
            </p>
          )}
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-2xl border border-line bg-white p-4"><p className="mb-3 font-semibold">Spend by day</p><Bars days={act.byDay} parts={[{ key: 'spend', label: 'Spend (USD)', color: '#3b82f6' }]} fmt={n => usd(n, 5)} /></div>
            <div className="rounded-2xl border border-line bg-white p-4"><p className="mb-3 font-semibold">Requests by day</p><Bars days={act.byDay} parts={[{ key: 'requests', label: 'Requests', color: '#3b82f6' }]} fmt={n => String(n)} /></div>
            <div className="rounded-2xl border border-line bg-white p-4"><p className="mb-3 font-semibold">Token breakdown</p><Bars days={act.byDay} parts={[{ key: 'tokensIn', label: 'Prompt', color: '#3b82f6' }, { key: 'tokensOut', label: 'Completion (incl. thinking)', color: '#a855f7' }]} fmt={n => num(n)} /></div>
            <div className="rounded-2xl border border-line bg-white p-4"><p className="mb-3 font-semibold">Thinking tokens</p><Bars days={act.byDay} parts={[{ key: 'reasoning', label: 'Thinking', color: '#ef4444' }]} fmt={n => num(n)} /></div>
          </div>
          <div className="rounded-2xl border border-line bg-white">
            <p className="border-b border-line px-4 py-3 font-semibold">Usage by model</p>
            <div className="overflow-x-auto"><table className="min-w-full">
              <thead><tr className="bg-mist"><th className={th}>Provider · model</th><th className={th}>Requests</th><th className={th}>Tokens</th><th className={th}>Spend</th></tr></thead>
              <tbody>
                {act.byModel.map(g => <tr key={g.name} className="border-t border-line/60"><td className={td}>{g.name}</td><td className={td}>{num(g.requests)}</td><td className={td}>{short(g.tokens)}</td><td className={`${td} font-semibold`}>{usd(g.spend, 5)}</td></tr>)}
                {!act.byModel.length && <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-soft">No AI calls in this range.</td></tr>}
              </tbody>
            </table></div>
          </div>
        </>
      )}

      {!loading && tab === 'logs' && logs && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <select value={provider} onChange={e => setProvider(e.target.value)} className={sel}><option value="">All providers</option><option value="claude">Claude (Anthropic)</option><option value="openrouter">OpenRouter</option><option value="nvidia">NVIDIA</option></select>
            <select value={model} onChange={e => setModel(e.target.value)} className={sel}><option value="">All models</option>{logs.models.map(m => <option key={m} value={m}>{m}</option>)}</select>
            <select value={status} onChange={e => setStatus(e.target.value)} className={sel}><option value="">All results</option><option value="ok">Succeeded</option><option value="error">Failed</option></select>
            <select value={guarantorId} onChange={e => setGuarantorId(e.target.value)} className={sel}><option value="">All guarantors</option>{logs.guarantors.map(g => <option key={g.guarantorId} value={g.guarantorId}>{g.name}</option>)}</select>
            <button onClick={exportXlsx} disabled={busy} className="ml-auto rounded-2xl bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{busy ? 'Preparing…' : 'Download Excel'}</button>
          </div>
          <div className="rounded-2xl border border-line bg-white">
            <div className="flex items-center justify-between border-b border-line px-4 py-3 text-sm"><span className="font-semibold">{num(logs.total)} call{logs.total === 1 ? '' : 's'}</span><span className="text-soft">Sort by: {sortBtn('date', 'Date')} · {sortBtn('tokens', 'Tokens')} · {sortBtn('cost', 'Cost')}</span></div>
            <div className="overflow-x-auto"><table className="min-w-full">
              <thead><tr className="bg-mist"><th className={th}>Date</th><th className={th}>Model</th><th className={th}>Provider</th><th className={th}>For</th><th className={th}>Guarantor</th><th className={th}>Input</th><th className={th}>Output</th><th className={th}>Thinking</th><th className={th}>Cost</th><th className={th}>Speed</th><th className={th}>Result</th></tr></thead>
              <tbody>
                {logs.rows.map(r => (
                  <tr key={r.id} className="border-t border-line/60">
                    <td className={td}>{when(r.at)}</td><td className={td}>{r.model || '—'}</td><td className={td}>{r.provider}</td><td className={td}>{r.purpose === 'test' ? 'Test' : 'Screenshot'}</td><td className={td}>{r.guarantor || '—'}</td>
                    <td className={td}>{num(r.tokensIn)} tok</td><td className={td}>{num(r.tokensOut)} tok</td><td className={td}>{r.reasoning ? `${num(r.reasoning)} tok` : '—'}</td>
                    <td className={`${td} font-semibold`}>{usd(r.costUsd, 6)}</td><td className={td}>{r.tokPerSec ? `${r.tokPerSec} tok/s · ` : ''}{(r.ms / 1000).toFixed(1)} s</td>
                    <td className={td}>{r.status === 'error'
                      ? <span title={r.error} className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Failed</span>
                      : r.finish === 'max_tokens' || r.finish === 'length'
                        ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">Cut off</span>
                        : <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">OK</span>}</td>
                  </tr>
                ))}
                {!logs.rows.length && <tr><td colSpan={11} className="px-4 py-6 text-center text-sm text-soft">No AI calls in this range.</td></tr>}
              </tbody>
            </table></div>
            <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-xl border border-line px-3 py-1.5 disabled:opacity-40">Previous</button>
              <span className="text-soft">Page {logs.page} of {logs.totalPages}</span>
              <button disabled={page >= logs.totalPages} onClick={() => setPage(page + 1)} className="rounded-xl border border-line px-3 py-1.5 disabled:opacity-40">Next</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
