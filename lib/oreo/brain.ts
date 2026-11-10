import fs from 'node:fs'
import path from 'node:path'
import { getSupabase } from '@/lib/supabase-db'

// Oreo's own brain: rules, facts, preferences and playbooks the owner can read and edit, plus read-only search of the NGF docs vault.
export type BrainKind = 'rule' | 'fact' | 'preference' | 'playbook'
export type BrainRow = { id: string; kind: BrainKind; title: string; body: string; pinned: boolean; status: 'active' | 'pending' | 'archived'; source: 'owner' | 'oreo'; tags: string[]; created_by: string | null; created_at: string; updated_at: string }
const COLS = 'id, kind, title, body, pinned, status, source, tags, created_by, created_at, updated_at'
export const KINDS: BrainKind[] = ['rule', 'fact', 'preference', 'playbook']

export async function pinnedBrain(): Promise<BrainRow[]> {
  const { data } = await getSupabase().from('oreo_brain').select(COLS).eq('status', 'active').eq('pinned', true).order('created_at')
  return (data || []) as BrainRow[]
}

/** Active notes that match the words of a question (full text, then a plain match as a back-up). */
export async function searchBrain(q: string, limit = 6): Promise<BrainRow[]> {
  const text = String(q || '').trim().slice(0, 200)
  if (!text) return []
  const sb = getSupabase()
  const { data } = await sb.from('oreo_brain').select(COLS).eq('status', 'active').textSearch('search', text.split(/\s+/).filter(w => w.length > 2).join(' | ') || text, { config: 'simple' }).limit(limit)
  const rows = (data || []) as BrainRow[]
  if (rows.length >= 2) return rows
  const words = text.split(/\s+/).filter(w => w.length > 3).slice(0, 4).map(w => w.replace(/[%,()]/g, ''))
  if (!words.length) return rows
  const { data: more } = await sb.from('oreo_brain').select(COLS).eq('status', 'active').or(words.map(w => `title.ilike.%${w}%,body.ilike.%${w}%`).join(',')).limit(limit)
  const seen = new Set(rows.map(r => r.id))
  return [...rows, ...((more || []) as BrainRow[]).filter(r => !seen.has(r.id))].slice(0, limit)
}

export async function listBrain(opts: { kind?: string; status?: string; q?: string } = {}): Promise<BrainRow[]> {
  let qb = getSupabase().from('oreo_brain').select(COLS).order('pinned', { ascending: false }).order('updated_at', { ascending: false }).limit(500)
  if (opts.kind && KINDS.includes(opts.kind as BrainKind)) qb = qb.eq('kind', opts.kind)
  qb = qb.eq('status', opts.status && ['active', 'pending', 'archived'].includes(opts.status) ? opts.status : 'active')
  if (opts.q) { const w = opts.q.replace(/[%,()]/g, '').slice(0, 60); qb = qb.or(`title.ilike.%${w}%,body.ilike.%${w}%`) }
  const { data } = await qb
  return (data || []) as BrainRow[]
}

// Never keep secrets or full bank/Aadhaar numbers in the brain
const SECRET = /(\b\d{12}\b)|(\b\d{9,18}\b)|(password|passcode|secret|api[_ -]?key|token)\s*[:=]/i
export function brainTextIssue(s: string): string | null { return SECRET.test(s.replace(/\b[6-9]\d{9}\b/g, '')) ? 'The note looks like it has a password, key, or a full account or Aadhaar number. Keep only the last 4 digits or a customer number.' : null }

async function snapshot(id: string, by: string) {
  const sb = getSupabase()
  const { data } = await sb.from('oreo_brain').select('kind, title, body, status, pinned').eq('id', id).maybeSingle()
  if (data) await sb.from('oreo_brain_versions').insert({ brain_id: id, ...data, changed_by: by })
}

export async function addBrain(input: { kind: BrainKind; title: string; body: string; pinned?: boolean; status?: 'active' | 'pending'; source: 'owner' | 'oreo'; tags?: string[]; by: string }): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!KINDS.includes(input.kind)) return { ok: false, error: 'Unknown kind' }
  const title = input.title.trim().slice(0, 120), body = input.body.trim().slice(0, 4000)
  if (title.length < 3 || body.length < 3) return { ok: false, error: 'Write a title and some text' }
  const issue = brainTextIssue(`${title} ${body}`); if (issue) return { ok: false, error: issue }
  const { data, error } = await getSupabase().from('oreo_brain').insert({
    kind: input.kind, title, body, pinned: !!input.pinned, status: input.status || 'active', source: input.source, tags: (input.tags || []).slice(0, 8).map(t => t.slice(0, 30)), created_by: input.by,
  }).select('id').single()
  if (error || !data) return { ok: false, error: 'Could not save' }
  return { ok: true, id: data.id }
}

export async function updateBrain(id: string, patch: { title?: string; body?: string; pinned?: boolean; status?: 'active' | 'pending' | 'archived'; kind?: BrainKind; tags?: string[] }, by: string): Promise<{ ok: boolean; error?: string }> {
  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.title !== undefined) upd.title = patch.title.trim().slice(0, 120)
  if (patch.body !== undefined) upd.body = patch.body.trim().slice(0, 4000)
  if (patch.pinned !== undefined) upd.pinned = !!patch.pinned
  if (patch.status) upd.status = patch.status
  if (patch.kind && KINDS.includes(patch.kind)) upd.kind = patch.kind
  if (patch.tags) upd.tags = patch.tags.slice(0, 8)
  const issue = brainTextIssue(`${upd.title || ''} ${upd.body || ''}`); if (issue) return { ok: false, error: issue }
  await snapshot(id, by)   // every edit keeps the old version so it can be undone
  const { error } = await getSupabase().from('oreo_brain').update(upd).eq('id', id)
  return error ? { ok: false, error: 'Could not save' } : { ok: true }
}

export async function brainVersions(id: string) {
  const { data } = await getSupabase().from('oreo_brain_versions').select('id, kind, title, body, status, pinned, changed_by, changed_at').eq('brain_id', id).order('changed_at', { ascending: false }).limit(20)
  return data || []
}
export async function restoreBrainVersion(versionId: string, by: string): Promise<boolean> {
  const sb = getSupabase()
  const { data: v } = await sb.from('oreo_brain_versions').select('brain_id, kind, title, body, status, pinned').eq('id', versionId).maybeSingle()
  if (!v) return false
  await snapshot(v.brain_id, by)
  await sb.from('oreo_brain').update({ kind: v.kind, title: v.title, body: v.body, status: v.status, pinned: v.pinned, updated_at: new Date().toISOString() }).eq('id', v.brain_id)
  return true
}

// ── the NGF docs vault (read only): markdown files in docs/
// the folder is read at run time only; the comments keep Turbopack from tracing the whole project as a file pattern
const DOCS = path.join(/* turbopackIgnore: true */ process.cwd(), /* turbopackIgnore: true */ 'docs')
let docIndex: { at: number; files: { rel: string; title: string; text: string }[] } | null = null
function walk(dir: string, out: string[] = []): string[] {
  let ents: fs.Dirent[] = []
  try { ents = fs.readdirSync(/* turbopackIgnore: true */ dir, { withFileTypes: true }) } catch { return out }
  for (const e of ents) {
    if (e.name.startsWith('.') || e.name === 'Templates' || e.name === 'superpowers' || e.name === '10 Daily Log') continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out); else if (e.name.endsWith('.md') && !/PASSWORD/i.test(e.name)) out.push(p)
  }
  return out
}
function docs() {
  if (docIndex && Date.now() - docIndex.at < 5 * 60_000) return docIndex.files
  const files = walk(DOCS).slice(0, 400).map(p => { let text = ''; try { text = fs.readFileSync(/* turbopackIgnore: true */ p, 'utf8').slice(0, 60_000) } catch { /* skip */ } return { rel: path.relative(DOCS, p), title: path.basename(p, '.md'), text } })
  docIndex = { at: Date.now(), files }
  return files
}
export function searchDocs(q: string, limit = 3): { path: string; title: string; snippet: string }[] {
  const words = String(q || '').toLowerCase().split(/[^a-z0-9₹]+/).filter(w => w.length > 2).slice(0, 8)
  if (!words.length) return []
  const scored = docs().map(d => {
    const hay = d.text.toLowerCase(), t = d.title.toLowerCase()
    let score = 0; for (const w of words) { if (t.includes(w)) score += 5; const n = hay.split(w).length - 1; score += Math.min(n, 6) }
    return { d, score }
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, limit)
  return scored.map(({ d }) => {
    const hay = d.text.toLowerCase(); const i = Math.max(0, ...words.map(w => hay.indexOf(w)).filter(x => x >= 0).slice(0, 1))
    return { path: d.rel, title: d.title, snippet: d.text.slice(Math.max(0, i - 80), i + 500).replace(/\s+/g, ' ').trim() }
  })
}
export function readDoc(rel: string): string | null {
  const full = path.resolve(/* turbopackIgnore: true */ DOCS, rel)
  if (!full.startsWith(DOCS + path.sep) || !full.endsWith('.md') || /PASSWORD/i.test(full)) return null
  try { return fs.readFileSync(/* turbopackIgnore: true */ full, 'utf8').slice(0, 8000) } catch { return null }
}
