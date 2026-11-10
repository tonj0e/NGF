'use client'
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Session } from '@/types'
import { downloadSheetXlsx } from '@/lib/tallyExport'
import { ANTHROPIC_PRICES, PRICING_NOTES, type ModelPrice } from '@/lib/aiPricing'
import { apiSend } from '@/lib/clientApi'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

// AI usage (Admin): what the AI readers used, laid out like the OpenRouter dashboard. NGF (the workspace) > Activity | Logs.
// Data: /api/ai-usage, from the ai_usage log (every screenshot read, whichever provider answered).
type Totals = { spend: number; requests: number; okRequests: number; errors: number; tokensIn: number; tokensOut: number; tokens: number; cacheRate: number; perRead: number; perMillion: number; cutOff: number }
type Day = { day: string; spend: number; requests: number; tokensIn: number; tokensOut: number; reasoning: number; cached: number; models: Record<string, number>; purposes: Record<string, number> }
type Group = { name: string; requests: number; spend: number; tokens: number }
const purposeLabel = (p: string) => p === 'aadhaar' ? 'Aadhaar reading' : p === 'oreo' ? 'Oreo (chat)' : p === 'oreo_voice' ? 'Oreo (voice)' : p === 'test' ? 'Test' : 'Payment screenshot'
type Activity = { usdInr: number; from: string; to: string; totals: Totals; previous: Totals; hasPrevious: boolean; byDay: Day[]; byModel: Group[]; byProvider: Group[]; byPurpose: Group[] }
type LogRow = { id: string; at: string; provider: string; model: string; purpose: string; guarantor: string; tokensIn: number; tokensOut: number; reasoning: number; cached: number; costUsd: number; ms: number; tokPerSec: number; status: string; finish: string; error: string }
type Logs = { usdInr: number; total: number; page: number; totalPages: number; models: string[]; guarantors: { guarantorId: string; name: string }[]; rows: LogRow[] }

const usd = (n: number, d = 4) => `$${Number(n || 0).toFixed(d)}`
// rupees from dollars at the saved rate: more decimals for tiny amounts
const inr = (n: number, rate: number) => { const v = Number(n || 0) * rate; return `₹${v >= 100 ? v.toFixed(0) : v >= 1 ? v.toFixed(2) : v.toFixed(4)}` }
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

// Charts (recharts): axes, grid lines, hover tooltip and legend, in the style of the OpenRouter dashboard
const PALETTE = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#06b6d4', '#ec4899']
const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { timeZone: 'UTC', month: 'short', day: 'numeric' })
type Series = { key: string; label: string; color: string }
function Chart({ title, total, data, series, kind, fmt, empty }: { title: string; total?: string; data: Record<string, number | string>[]; series: Series[]; kind: 'bar' | 'area'; fmt: (n: number) => string; empty?: boolean }) {
  const interval = Math.max(0, Math.ceil(data.length / 8) - 1)
  const axis = { tick: { fontSize: 11, fill: '#8a93a6' }, axisLine: false, tickLine: false } as const
  const common = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="#e8ebf2" vertical={false} />
      <XAxis dataKey="day" tickFormatter={dayLabel} interval={interval} {...axis} />
      <YAxis width={52} tickFormatter={v => fmt(Number(v))} {...axis} />
      <Tooltip
        cursor={kind === 'bar' ? { fill: 'rgba(59,130,246,0.06)' } : { stroke: '#cbd2e0' }}
        content={({ active, payload, label }) => !active || !payload?.length ? null : (
          <div className="rounded-xl border border-line bg-white px-3 py-2 text-xs shadow-panel">
            <p className="mb-1 font-semibold">{dayLabel(String(label))}</p>
            {payload.slice().reverse().map(p => <p key={String(p.dataKey)} className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: p.color }} /><span className="text-soft">{series.find(x => x.key === p.dataKey)?.label}</span><span className="ml-auto pl-4 font-semibold">{fmt(Number(p.value || 0))}</span></p>)}
          </div>
        )} />
    </>
  )
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2"><p className="font-semibold">{title}</p>{total && <p className="text-sm font-semibold text-ink">{total}</p>}</div>
      <div className="h-56">
        {empty ? <div className="flex h-full items-center justify-center text-sm text-soft">No AI calls in this range.</div> : (
          <ResponsiveContainer width="100%" height="100%">
            {kind === 'bar' ? (
              <BarChart data={data} margin={{ top: 4, right: 22, left: 0, bottom: 0 }}>
                {common}
                {series.map((sr, i) => <Bar key={sr.key} dataKey={sr.key} stackId="a" fill={sr.color} radius={i === series.length - 1 ? [4, 4, 0, 0] : 0} maxBarSize={36} />)}
              </BarChart>
            ) : (
              <AreaChart data={data} margin={{ top: 4, right: 22, left: 0, bottom: 0 }}>
                <defs>{series.map(sr => <linearGradient key={sr.key} id={`g-${sr.key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={sr.color} stopOpacity={0.45} /><stop offset="100%" stopColor={sr.color} stopOpacity={0.03} /></linearGradient>)}</defs>
                {common}
                {series.map(sr => <Area key={sr.key} type="monotone" dataKey={sr.key} stackId="a" stroke={sr.color} strokeWidth={2} fill={`url(#g-${sr.key})`} />)}
              </AreaChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-soft">{series.map(sr => <span key={sr.key} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: sr.color }} />{sr.label}</span>)}</div>
    </div>
  )
}

function Change({ now, before, show }: { now: number; before: number; show: boolean }) {
  if (!show || !before) return <p className="mt-1 text-xs text-soft">No prior data</p>
  const pct = ((now - before) / before) * 100
  return <p className={`mt-1 text-xs ${pct > 0 ? 'text-amber-600' : 'text-green-600'}`}>{pct > 0 ? '↑' : '↓'} {Math.abs(pct).toFixed(1)}% <span className="text-soft">vs previous period</span></p>
}

export default function AIPage({ session, onBack }: { session: Session; onBack?: () => void }) {
  const [tab, setTab] = useState<'activity' | 'logs' | 'pricing'>('activity')
  const [rate, setRate] = useState(90)           // rupees for one dollar (saved in Settings)
  const [rateText, setRateText] = useState('90')
  const [actProvider, setActProvider] = useState('')
  const [purpose, setPurpose] = useState('')   // '' all | slip (payment screenshots) | aadhaar | test
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
    const setR = (d: { usdInr?: number }) => { if (d.usdInr && d.usdInr > 0) { setRate(d.usdInr); setRateText(String(d.usdInr)) } }
    const run = tab === 'pricing'
      ? call(`view=activity&from=${range.to}&to=${range.to}`).then(d => { if (!off) setR(d) })
      : tab === 'activity'
      ? call(`view=activity&${base}&provider=${actProvider}&purpose=${purpose}`).then(d => { if (!off) { setAct(d); setR(d) } })
      : call(`view=logs&${base}&page=${page}&sort=${sort}&dir=${dir}&provider=${provider}&model=${encodeURIComponent(model)}&status=${status}&guarantorId=${guarantorId}&purpose=${purpose}`).then(d => { if (!off) { setLogs(d); setR(d) } })
    run.catch(e => { if (!off) setError(e instanceof Error ? e.message : 'Could not load') }).finally(() => { if (!off) setLoading(false) })
    return () => { off = true }
  }, [tab, range.from, range.to, page, sort, dir, provider, model, status, guarantorId, actProvider, purpose, call])
  useEffect(() => { setPage(1) }, [range.from, range.to, provider, model, status, guarantorId, purpose, sort, dir])

  async function saveRate() {
    const n = Number(rateText)
    if (!(n >= 1 && n <= 1000)) { alert('Enter the rupees for one dollar, for example 88.50'); setRateText(String(rate)); return }
    const r = await apiSend(session.token, 'POST', '/api/ai-usage', { usdInr: n })
    if (r.ok) setRate(n); else { alert(r.error || 'Could not save the rate'); setRateText(String(rate)) }
  }

  async function exportXlsx() {
    setBusy(true)
    try {
      const d: Logs = await call(`view=logs&from=${range.from}&to=${range.to}&all=1&sort=${sort}&dir=${dir}&provider=${provider}&model=${encodeURIComponent(model)}&status=${status}&guarantorId=${guarantorId}&purpose=${purpose}`)
      if (!d.rows.length) { alert('There are no calls in this range.'); return }
      const head = ['Date (IST)', 'Provider', 'Model', 'Purpose', 'Guarantor', 'Input tokens', 'Output tokens', 'Thinking tokens', 'Cached tokens', 'Cost (USD)', 'Cost (INR)', 'Time (ms)', 'Tokens/sec', 'Status', 'Finish', 'Error']
      const rows = d.rows.map(r => [when(r.at), r.provider, r.model, purposeLabel(r.purpose), r.guarantor, r.tokensIn, r.tokensOut, r.reasoning, r.cached, r.costUsd, Number((r.costUsd * (d.usdInr || rate)).toFixed(6)), r.ms, r.tokPerSec, r.status, r.finish, r.error])
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
    { label: 'Total spend', value: usd(t.spend, 4), sub: inr(t.spend, rate), now: t.spend, before: p.spend },
    { label: 'Requests', value: num(t.requests), now: t.requests, before: p.requests },
    { label: 'Token volume', value: short(t.tokens), now: t.tokens, before: p.tokens },
    { label: 'Cache hit rate', value: `${(t.cacheRate * 100).toFixed(1)}%`, now: 0, before: 0 },
    { label: 'Average per read', value: usd(t.perRead, 5), sub: inr(t.perRead, rate), now: t.perRead, before: p.perRead },
    { label: 'Blended price per 1M tokens', value: usd(t.perMillion, 2), sub: inr(t.perMillion, rate), now: t.perMillion, before: p.perMillion },
  ] : []

  return (
    <div className="space-y-4">
      {onBack && <button onClick={onBack} className="rounded-2xl border border-line bg-white px-4 py-2 text-sm font-semibold">← Back to Oreo</button>}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-soft">NGF</p>
          <h1 className="text-2xl font-semibold">{tab === 'activity' ? 'Activity' : tab === 'logs' ? 'Logs' : 'Pricing'}</h1>
          <p className="text-sm text-soft">{tab === 'activity' ? 'What the AI readers used, across providers and models.' : tab === 'logs' ? 'One row for every AI call.' : 'Anthropic prices per million tokens, in dollars and rupees.'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {tab !== 'pricing' && <select value={purpose} onChange={e => setPurpose(e.target.value)} className={sel}><option value="">All categories</option><option value="slip">Payment screenshots</option><option value="aadhaar">Aadhaar reading</option><option value="oreo">Oreo (chat)</option><option value="oreo_voice">Oreo (voice)</option><option value="test">Tests</option></select>}
          {tab === 'activity' && <select value={actProvider} onChange={e => setActProvider(e.target.value)} className={sel}><option value="">All providers</option><option value="openrouter">OpenRouter</option><option value="claude">Claude (Anthropic)</option><option value="nvidia">NVIDIA</option></select>}
          <label className="flex items-center gap-1 rounded-xl border border-line bg-white px-3 py-2 text-sm">₹ per $1
            <input value={rateText} onChange={e => setRateText(e.target.value)} onBlur={saveRate} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} inputMode="decimal" className="w-14 bg-transparent text-right font-semibold outline-none" />
          </label>
          {tab !== 'pricing' && <select value={preset} onChange={e => setPreset(e.target.value as Preset)} className={sel}>{PRESETS.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}</select>}
          {tab !== 'pricing' && preset === 'custom' && <>
            <input type="date" value={cFrom} onChange={e => setCFrom(e.target.value)} className={sel} />
            <input type="date" value={cTo} onChange={e => setCTo(e.target.value)} className={sel} />
          </>}
        </div>
      </div>

      <div className="flex gap-2 border-b border-line">
        {(['activity', 'logs', 'pricing'] as const).map(k => (
          <button key={k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === k ? 'border-ink text-ink' : 'border-transparent text-soft hover:text-ink'}`}>{k === 'activity' ? 'Activity' : k === 'logs' ? 'Logs' : 'Pricing'}</button>
        ))}
      </div>
      {tab !== 'pricing' && <p className="text-xs text-soft">{range.from === range.to ? range.from : `${range.from} to ${range.to}`} (India time)</p>}

      {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {loading && <div className="flex h-24 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-ink border-t-transparent" /></div>}

      {!loading && tab === 'activity' && act && t && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map(c => (
              <div key={c.label} className="rounded-2xl border border-line bg-white p-4">
                <p className="text-xs text-soft">{c.label}</p>
                <p className="mt-1 text-2xl font-semibold">{c.value}{'sub' in c && c.sub && <span className="ml-2 text-base font-medium text-soft">{c.sub}</span>}</p>
                {c.label === 'Cache hit rate' ? <p className="mt-1 text-xs text-soft">share of input tokens served from cache</p> : c.label === 'Token volume' ? <p className="mt-1 text-xs text-soft">input {short(t.tokensIn)} + output {short(t.tokensOut)}</p> : c.label.startsWith('Blended') ? <p className="mt-1 text-xs text-soft">paid calls only (free tests left out)</p> : <Change now={c.now} before={c.before} show={act.hasPrevious} />}
              </div>
            ))}
          </div>
          {(t.errors > 0 || t.cutOff > 0) && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {t.errors > 0 && `${t.errors} call${t.errors === 1 ? '' : 's'} failed. `}{t.cutOff > 0 && `${t.cutOff} call${t.cutOff === 1 ? ' was' : 's were'} cut off at the answer limit.`} See Logs, filter Status.
            </p>
          )}
          <div className="grid gap-3 lg:grid-cols-2">
            <Chart title="Spend by day" total={`${usd(t.spend, 4)} · ${inr(t.spend, rate)}`} kind="area" fmt={n => usd(n, n < 0.01 ? 4 : 3)} empty={!t.requests}
              data={act.byDay.map(d => ({ day: d.day, spend: d.spend }))} series={[{ key: 'spend', label: 'Spend (USD)', color: PALETTE[0] }]} />
            <Chart title="Spend by category" kind="area" fmt={n => usd(n, n < 0.01 ? 4 : 3)} empty={!t.requests}
              data={act.byDay.map(d => ({ day: d.day, ...d.purposes }))} series={act.byPurpose.map((g, i) => ({ key: g.name, label: purposeLabel(g.name), color: PALETTE[i % PALETTE.length] }))} />
            <Chart title="Requests by model" total={`${num(t.requests)} requests`} kind="bar" fmt={n => num(n)} empty={!t.requests}
              data={act.byDay.map(d => ({ day: d.day, ...d.models }))} series={act.byModel.map((g, i) => ({ key: g.name.split(' · ').slice(1).join(' · ') || 'unknown', label: g.name, color: PALETTE[i % PALETTE.length] }))} />
            <Chart title="Token breakdown" total={`${short(t.tokens)} tokens`} kind="bar" fmt={n => short(n)} empty={!t.requests}
              data={act.byDay.map(d => ({ day: d.day, prompt: d.tokensIn, completion: Math.max(0, d.tokensOut - d.reasoning), reasoning: d.reasoning }))}
              series={[{ key: 'prompt', label: 'Prompt', color: PALETTE[0] }, { key: 'completion', label: 'Completion', color: PALETTE[1] }, { key: 'reasoning', label: 'Reasoning (thinking)', color: PALETTE[4] }]} />
            <Chart title="Prompt token caching" total={`${(t.cacheRate * 100).toFixed(1)}% cached`} kind="bar" fmt={n => short(n)} empty={!t.requests}
              data={act.byDay.map(d => ({ day: d.day, uncached: Math.max(0, d.tokensIn - d.cached), cached: d.cached }))}
              series={[{ key: 'uncached', label: 'Uncached', color: '#94a3b8' }, { key: 'cached', label: 'Cached', color: PALETTE[2] }]} />
          </div>
          <div className="rounded-2xl border border-line bg-white">
            <p className="border-b border-line px-4 py-3 font-semibold">Usage by category</p>
            <div className="overflow-x-auto"><table className="min-w-full">
              <thead><tr className="bg-mist"><th className={th}>Category</th><th className={th}>Requests</th><th className={th}>Tokens</th><th className={th}>Spend</th></tr></thead>
              <tbody>
                {act.byPurpose.map(g => <tr key={g.name} className="border-t border-line/60"><td className={td}>{purposeLabel(g.name)}</td><td className={td}>{num(g.requests)}</td><td className={td}>{short(g.tokens)}</td><td className={`${td} font-semibold`}>{usd(g.spend, 5)} <span className="font-normal text-soft">· {inr(g.spend, rate)}</span></td></tr>)}
                {!act.byPurpose.length && <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-soft">No AI calls in this range.</td></tr>}
              </tbody>
            </table></div>
          </div>
          <div className="rounded-2xl border border-line bg-white">
            <p className="border-b border-line px-4 py-3 font-semibold">Usage by model</p>
            <div className="overflow-x-auto"><table className="min-w-full">
              <thead><tr className="bg-mist"><th className={th}>Provider · model</th><th className={th}>Requests</th><th className={th}>Tokens</th><th className={th}>Spend</th></tr></thead>
              <tbody>
                {act.byModel.map(g => <tr key={g.name} className="border-t border-line/60"><td className={td}>{g.name}</td><td className={td}>{num(g.requests)}</td><td className={td}>{short(g.tokens)}</td><td className={`${td} font-semibold`}>{usd(g.spend, 5)} <span className="font-normal text-soft">· {inr(g.spend, rate)}</span></td></tr>)}
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
                    <td className={td}>{when(r.at)}</td><td className={td}>{r.model || '—'}</td><td className={td}>{r.provider}</td><td className={td}>{purposeLabel(r.purpose)}</td><td className={td}>{r.guarantor || '—'}</td>
                    <td className={td}>{num(r.tokensIn)} tok</td><td className={td}>{num(r.tokensOut)} tok</td><td className={td}>{r.reasoning ? `${num(r.reasoning)} tok` : '—'}</td>
                    <td className={`${td} font-semibold`}>{usd(r.costUsd, 6)} <span className="font-normal text-soft">· {inr(r.costUsd, rate)}</span></td><td className={td}>{r.tokPerSec ? `${r.tokPerSec} tok/s · ` : ''}{(r.ms / 1000).toFixed(1)} s</td>
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

      {!loading && tab === 'pricing' && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-line bg-white">
            <div className="overflow-x-auto"><table className="min-w-full">
              <thead><tr className="bg-mist"><th className={th}>Model</th><th className={th}>Input</th><th className={th}>Output</th><th className={th}>Cache write 5 min</th><th className={th}>Cache write 1 hour</th><th className={th}>Cache hit</th><th className={th}>Batch in / out</th></tr></thead>
              <tbody>
                {ANTHROPIC_PRICES.map((m: ModelPrice) => {
                  const cell = (v: number) => <td className={td}><span className="font-semibold">${v}</span> <span className="text-xs text-soft">{inr(v, rate)}</span></td>
                  return (
                    <Fragment key={m.id}>
                      <tr className={`border-t border-line/60 ${m.id === 'claude-haiku-5-5' ? 'bg-green-50/60' : ''}`}>
                        <td className={td}><span className="font-semibold">{m.name}</span>{m.id === 'claude-haiku-5-5' && <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">used by the reader</span>}<br /><span className="font-mono text-xs text-soft">{m.id}</span>{m.longInput && <span className="ml-2 text-xs text-soft">prompts up to 100K tokens</span>}</td>
                        {cell(m.input)}{cell(m.output)}{cell(m.write5m)}{cell(m.write1h)}{cell(m.cacheRead)}<td className={td}>${m.batchIn} / ${m.batchOut}</td>
                      </tr>
                      {m.longInput && (
                        <tr className="border-t border-line/40 bg-green-50/30">
                          <td className={`${td} pl-6 text-xs text-soft`}>{m.name}, prompts over 100K tokens</td>
                          {cell(m.longInput)}{cell(m.longOutput!)}{cell(m.longWrite5m!)}{cell(m.longWrite1h!)}{cell(m.longCacheRead!)}<td className={td}>${m.longBatchIn} / ${m.longBatchOut}</td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table></div>
          </div>
          <div className="rounded-2xl border border-line bg-white p-4">
            <p className="mb-2 font-semibold">Good to know</p>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-soft">{PRICING_NOTES.map(n => <li key={n}>{n}</li>)}</ul>
            <p className="mt-3 text-xs text-soft">Source: Anthropic pricing page, copied 9 Nov 2026. Rupees use the rate at the top of this page. OpenRouter adds its own provider prices; its dashboard shows the exact cost of each call.</p>
          </div>
        </div>
      )}
    </div>
  )
}
