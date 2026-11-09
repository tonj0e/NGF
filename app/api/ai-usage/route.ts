import { NextRequest } from 'next/server'
import { apiHandler, requireRole, ok, err } from '@/lib/api'
import { getSupabase, readTable, appendRow, updateById, findRecord, nowIso, invalidateCache } from '@/lib/supabase-db'
import { getTodayIST } from '@/lib/dateUtils'

// GET /api/ai-usage (Admin only): what the AI readers used, from the ai_usage log. Dates are India dates (YYYY-MM-DD).
//   ?view=activity&from=&to=   cards (with the change against the period before), per day, per model and per provider
//   ?view=logs&from=&to=&page=&pageSize=&provider=&model=&status=&guarantorId=&sort=date|cost|tokens&dir=asc|desc   one row per call
//   ?view=logs&...&all=1       up to 5000 rows for the Excel download
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))
const startOf = (d: string) => new Date(`${d}T00:00:00+05:30`).toISOString()
const endOf = (d: string) => new Date(new Date(`${d}T00:00:00+05:30`).getTime() + 86400_000).toISOString()
const istDay = (iso: string) => new Date(new Date(iso).getTime() + 5.5 * 3600_000).toISOString().slice(0, 10)
const shiftDay = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400_000).toISOString().slice(0, 10)

type Row = { id: string; created_at: string; provider: string; model: string; purpose: string; guarantor_id: string | null; message_id: string | null
  tokens_in: number; tokens_out: number; tokens_reasoning: number; tokens_cached: number; cost_usd: number; duration_ms: number; status: string; finish_reason: string | null; error: string | null }

async function fetchRows(from: string, to: string, filters: { provider?: string; model?: string; status?: string; guarantorId?: string; purpose?: string }, max = 20000): Promise<Row[]> {
  const sb = getSupabase()
  const out: Row[] = []
  for (let off = 0; off < max; off += 1000) {
    let q = sb.from('ai_usage').select('*').gte('created_at', startOf(from)).lt('created_at', endOf(to)).order('created_at', { ascending: false })
    if (filters.provider) q = q.eq('provider', filters.provider)
    if (filters.purpose) q = q.eq('purpose', filters.purpose)
    if (filters.model) q = q.eq('model', filters.model)
    if (filters.status) q = q.eq('status', filters.status)
    if (filters.guarantorId) q = q.eq('guarantor_id', filters.guarantorId)
    const { data, error } = await q.range(off, off + 999)
    if (error) throw new Error(`Could not read the AI log: ${error.message}`)
    out.push(...((data || []) as Row[]))
    if (!data || data.length < 1000) break
  }
  return out
}

function totals(rows: Row[]) {
  const okRows = rows.filter(r => r.status === 'ok')
  const spend = rows.reduce((t, r) => t + Number(r.cost_usd || 0), 0)
  const tin = rows.reduce((t, r) => t + (r.tokens_in || 0), 0), tout = rows.reduce((t, r) => t + (r.tokens_out || 0), 0)
  const cached = rows.reduce((t, r) => t + (r.tokens_cached || 0), 0)
  const tokens = tin + tout
  const paid = rows.filter(r => Number(r.cost_usd) > 0)   // blended price counts only calls that cost money (free NVIDIA tests would lower it)
  const paidTokens = paid.reduce((t, r) => t + (r.tokens_in || 0) + (r.tokens_out || 0), 0)
  return { spend, requests: rows.length, okRequests: okRows.length, errors: rows.length - okRows.length, tokensIn: tin, tokensOut: tout, tokens,
    cacheRate: tin ? cached / tin : 0, perRead: okRows.length ? spend / okRows.length : 0, perMillion: paidTokens ? spend / paidTokens * 1e6 : 0,
    cutOff: rows.filter(r => r.finish_reason === 'max_tokens' || r.finish_reason === 'length').length }
}

const RATE_KEY = 'ai:usdInr'
const DEFAULT_RATE = 90
async function usdInr() { const v = Number((await readTable('Settings')).find(r => r['Key'] === RATE_KEY)?.['Value']); return v > 0 ? v : DEFAULT_RATE }

// POST { usdInr: 88.5 }: the rupees per dollar used on the AI page
export const POST = apiHandler(async (req: NextRequest) => {
  await requireRole(req, ['Admin'])
  const { usdInr: v } = await req.json()
  const n = Number(v)
  if (!(n >= 1 && n <= 1000)) return err('Enter the rupees for one dollar, for example 88.50')
  const rows = await readTable('Settings')
  if (findRecord(rows, 'Key', RATE_KEY)) await updateById('Settings', RATE_KEY, { 'Value': String(n), 'Updated At': nowIso() })
  else await appendRow('Settings', { 'Key': RATE_KEY, 'Value': String(n), 'Updated At': nowIso() })
  invalidateCache('Settings')
  return ok({ usdInr: n })
})

export const GET = apiHandler(async (req: NextRequest) => {
  await requireRole(req, ['Admin'])
  const sp = new URL(req.url).searchParams
  const today = getTodayIST()
  const to = isDate(sp.get('to') || '') ? sp.get('to')! : today
  const from = isDate(sp.get('from') || '') ? sp.get('from')! : to.slice(0, 8) + '01'
  if (from > to) return err('The start date is after the end date')
  const view = sp.get('view') || 'activity'
  const filters = { provider: sp.get('provider') || '', model: sp.get('model') || '', status: sp.get('status') || '', guarantorId: sp.get('guarantorId') || '', purpose: sp.get('purpose') || '' }

  if (view === 'activity') {
    const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400_000) + 1
    const prevTo = shiftDay(from, -1), prevFrom = shiftDay(from, -days)
    const pf = { provider: filters.provider, purpose: filters.purpose }
    const [rows, prev] = await Promise.all([fetchRows(from, to, pf), fetchRows(prevFrom, prevTo, pf)])
    const byDay = new Map<string, { day: string; spend: number; requests: number; tokensIn: number; tokensOut: number; reasoning: number; cached: number; models: Record<string, number>; purposes: Record<string, number> }>()
    for (let i = 0; i < Math.min(days, 400); i++) { const d = shiftDay(from, i); byDay.set(d, { day: d, spend: 0, requests: 0, tokensIn: 0, tokensOut: 0, reasoning: 0, cached: 0, models: {}, purposes: {} }) }
    for (const r of rows) {
      const d = byDay.get(istDay(r.created_at)); if (!d) continue
      d.spend += Number(r.cost_usd || 0); d.requests++; d.tokensIn += r.tokens_in || 0; d.tokensOut += r.tokens_out || 0; d.reasoning += r.tokens_reasoning || 0; d.cached += r.tokens_cached || 0
      const mk = r.model || 'unknown'; d.models[mk] = (d.models[mk] || 0) + 1                     // requests per model that day
      d.purposes[r.purpose || 'slip'] = (d.purposes[r.purpose || 'slip'] || 0) + Number(r.cost_usd || 0)   // spend per category that day
    }
    const group = (key: (r: Row) => string) => {
      const m = new Map<string, { name: string; requests: number; spend: number; tokens: number }>()
      for (const r of rows) { const k = key(r) || 'unknown'; const g = m.get(k) || { name: k, requests: 0, spend: 0, tokens: 0 }; g.requests++; g.spend += Number(r.cost_usd || 0); g.tokens += (r.tokens_in || 0) + (r.tokens_out || 0); m.set(k, g) }
      return Array.from(m.values()).sort((a, b) => b.spend - a.spend || b.requests - a.requests)
    }
    return ok({ from, to, usdInr: await usdInr(), totals: totals(rows), previous: totals(prev), hasPrevious: prev.length > 0, byDay: Array.from(byDay.values()), byModel: group(r => `${r.provider} · ${r.model}`), byProvider: group(r => r.provider), byPurpose: group(r => r.purpose) })
  }

  if (view === 'logs') {
    const all = sp.get('all') === '1'
    const page = Math.max(1, Math.floor(Number(sp.get('page') || 1)) || 1)
    const pageSize = all ? 5000 : Math.min(200, Math.max(1, Math.floor(Number(sp.get('pageSize') || 50)) || 50))
    const sort = sp.get('sort') === 'cost' ? 'cost' : sp.get('sort') === 'tokens' ? 'tokens' : 'date'
    const dir = sp.get('dir') === 'asc' ? 1 : -1
    const rows = await fetchRows(from, to, filters)
    const key = (r: Row) => sort === 'cost' ? Number(r.cost_usd || 0) : sort === 'tokens' ? (r.tokens_in || 0) + (r.tokens_out || 0) : Date.parse(r.created_at)
    rows.sort((a, b) => (key(a) - key(b)) * dir)
    const slice = all ? rows.slice(0, 5000) : rows.slice((page - 1) * pageSize, page * pageSize)
    const gs = await readTable('Guarantors')
    const gname = new Map(gs.map(g => [g['Guarantor ID'], g['Name'] as string]))
    const models = Array.from(new Set(rows.map(r => r.model).filter(Boolean))).sort()
    return ok({
      usdInr: await usdInr(),
      from, to, total: rows.length, page, pageSize, totalPages: Math.max(1, Math.ceil(rows.length / pageSize)), models,
      guarantors: gs.filter(g => g['Status'] !== 'Inactive').map(g => ({ guarantorId: g['Guarantor ID'], name: g['Name'] })).sort((a, b) => String(a.name).localeCompare(String(b.name))),
      rows: slice.map(r => ({
        id: r.id, at: r.created_at, provider: r.provider, model: r.model, purpose: r.purpose, guarantor: r.guarantor_id ? (gname.get(r.guarantor_id) || r.guarantor_id) : '',
        tokensIn: r.tokens_in || 0, tokensOut: r.tokens_out || 0, reasoning: r.tokens_reasoning || 0, cached: r.tokens_cached || 0, costUsd: Number(r.cost_usd || 0),
        ms: r.duration_ms || 0, tokPerSec: r.duration_ms ? Math.round(((r.tokens_out || 0) / r.duration_ms) * 1000 * 10) / 10 : 0,
        status: r.status, finish: r.finish_reason || '', error: r.error || '',
      })),
    })
  }
  return err('Unknown view')
})
