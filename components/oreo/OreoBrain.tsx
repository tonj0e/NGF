'use client'
import { useCallback, useEffect, useState } from 'react'
import { Session } from '@/types'
import { apiGet, apiSend } from '@/lib/clientApi'

type Note = { id: string; kind: Kind; title: string; body: string; pinned: boolean; status: 'active' | 'pending' | 'archived'; source: 'owner' | 'oreo'; updated_at: string }
type Kind = 'rule' | 'fact' | 'preference' | 'playbook'
type Ver = { id: string; title: string; body: string; changed_at: string; changed_by: string }
type Act = { id: string; tool: string; risk: string; summary: string; status: string; result: string | null; via: string | null; created_at: string }
type Tab = Kind | 'pending' | 'history' | 'docs' | 'settings'
const TABS: { key: Tab; label: string; hint: string }[] = [
  { key: 'rule', label: 'Rules', hint: 'Always-on instructions Oreo obeys first. They can only make Oreo stricter: the confirm step on money actions can never be removed.' },
  { key: 'fact', label: 'Facts', hint: 'Things about NGF that no table holds: how a branch works, a guarantor habit, a decision you made.' },
  { key: 'preference', label: 'Preferences', hint: 'How you like answers: language, tone, report style, your usual routine.' },
  { key: 'playbook', label: 'Playbooks', hint: 'Step-by-step ways of doing a job, so Oreo can guide you or prepare it.' },
  { key: 'pending', label: 'To approve', hint: 'New rules Oreo wants to remember. They count only after you approve.' },
  { key: 'history', label: 'What Oreo did', hint: 'Every action Oreo prepared or ran, and who confirmed it.' },
  { key: 'docs', label: 'NGF notes', hint: 'The NGF documentation Oreo can read (read only). Search it here to see what Oreo sees.' },
  { key: 'settings', label: 'Limits', hint: 'Oreo\'s daily spending limit.' },
]
const inputCls = 'w-full rounded-xl border border-line bg-mist px-3 py-2 text-sm outline-none focus:border-ink focus:bg-white'

export default function OreoBrain({ session, onClose, onChanged }: { session: Session; onClose: () => void; onChanged: () => void }) {
  const [tab, setTab] = useState<Tab>('rule')
  const [notes, setNotes] = useState<Note[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [q, setQ] = useState('')
  const [info, setInfo] = useState({ dailyCapUsd: 2, spentTodayUsd: 0, usdInr: 90 })
  const [acts, setActs] = useState<Act[]>([])
  const [docs, setDocs] = useState<{ path: string; title: string; snippet: string }[]>([])
  const [editing, setEditing] = useState<Note | 'new' | null>(null)
  const [form, setForm] = useState({ title: '', body: '', pinned: false, kind: 'fact' as Kind })
  const [versions, setVersions] = useState<{ id: string; list: Ver[] } | null>(null)
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const [cap, setCap] = useState('')

  const load = useCallback(async () => {
    if (tab === 'history') { const r = await apiGet<{ actions: Act[] }>(session.token, '/api/oreo/brain?history=1'); if (r.ok) setActs(r.data!.actions); return }
    if (tab === 'docs') { const r = await apiGet<{ docs: typeof docs }>(session.token, `/api/oreo/brain?docs=${encodeURIComponent(q || 'bank file payment loan')}`); if (r.ok) setDocs(r.data!.docs); return }
    const status = tab === 'pending' ? 'pending' : 'active'
    const kind = ['rule', 'fact', 'preference', 'playbook'].includes(tab) ? `&kind=${tab}` : ''
    const r = await apiGet<{ notes: Note[]; pendingCount: number; dailyCapUsd: number; spentTodayUsd: number; usdInr: number }>(session.token, `/api/oreo/brain?status=${status}${kind}&q=${encodeURIComponent(q)}`)
    if (r.ok) { setNotes(r.data!.notes); setPendingCount(r.data!.pendingCount); setInfo({ dailyCapUsd: r.data!.dailyCapUsd, spentTodayUsd: r.data!.spentTodayUsd, usdInr: r.data!.usdInr }); setCap(String(r.data!.dailyCapUsd)) }
  }, [session.token, tab, q])
  useEffect(() => { const t = setTimeout(load, q ? 250 : 0); return () => clearTimeout(t) }, [load, q])

  async function post(body: Record<string, unknown>) {
    setBusy(true); setErr('')
    const r = await apiSend(session.token, 'POST', '/api/oreo/brain', body)
    setBusy(false)
    if (!r.ok) { setErr(r.error || 'Could not save'); return false }
    await load(); onChanged(); return true
  }
  async function saveForm() {
    const ok = editing === 'new' ? await post({ action: 'add', kind: form.kind, title: form.title, body: form.body, pinned: form.pinned }) : await post({ action: 'update', id: (editing as Note).id, title: form.title, body: form.body, pinned: form.pinned, kind: form.kind })
    if (ok) setEditing(null)
  }
  const edit = (n: Note | 'new') => { setEditing(n); setErr(''); setForm(n === 'new' ? { title: '', body: '', pinned: false, kind: ['rule', 'fact', 'preference', 'playbook'].includes(tab) ? tab as Kind : 'fact' } : { title: n.title, body: n.body, pinned: n.pinned, kind: n.kind }) }
  async function showVersions(id: string) { const r = await apiGet<{ versions: Ver[] }>(session.token, `/api/oreo/brain?versions=${id}`); if (r.ok) setVersions({ id, list: r.data!.versions }) }
  const hint = TABS.find(t => t.key === tab)?.hint

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><p className="text-xs font-semibold uppercase tracking-wide text-soft">Oreo</p><h1 className="text-2xl font-semibold">Oreo&apos;s brain</h1><p className="text-sm text-soft">What Oreo knows, remembers and has done. Everything here is yours to read, edit and undo.</p></div>
        <button onClick={onClose} className="rounded-2xl border border-line bg-white px-4 py-2 text-sm font-semibold">Back to Oreo</button>
      </div>
      <div className="flex flex-wrap gap-1.5 border-b border-line pb-2">
        {TABS.map(t => <button key={t.key} onClick={() => { setTab(t.key); setEditing(null) }} className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${tab === t.key ? 'bg-ink text-white' : 'bg-white text-soft hover:text-ink border border-line'}`}>{t.label}{t.key === 'pending' && pendingCount > 0 && <span className="ml-1.5 rounded-full bg-amber-400 px-1.5 text-xs font-bold text-ink">{pendingCount}</span>}</button>)}
      </div>
      {hint && <p className="text-sm text-soft">{hint}</p>}
      {err && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

      {['rule', 'fact', 'preference', 'playbook', 'pending', 'docs'].includes(tab) && (
        <div className="flex flex-wrap gap-2">
          <input data-no-upper value={q} onChange={e => setQ(e.target.value)} placeholder="Search" className={inputCls + ' max-w-xs'} />
          {['rule', 'fact', 'preference', 'playbook'].includes(tab) && <button onClick={() => edit('new')} className="rounded-xl bg-gold px-4 py-2 text-sm font-semibold text-[#1a1400]">+ Add</button>}
        </div>
      )}

      {editing && (
        <div className="rounded-2xl border border-line bg-white p-4 shadow-panel">
          <p className="mb-2 text-sm font-semibold">{editing === 'new' ? 'New note' : 'Edit note'}</p>
          <div className="grid gap-2">
            <select value={form.kind} onChange={e => setForm(f => ({ ...f, kind: e.target.value as Kind }))} className={inputCls}><option value="rule">Rule</option><option value="fact">Fact</option><option value="preference">Preference</option><option value="playbook">Playbook</option></select>
            <input data-no-upper value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Short title" className={inputCls} />
            <textarea data-no-upper value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} rows={5} placeholder="Write it clearly, as you would tell a new assistant. No passwords or full account numbers." className={inputCls} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.pinned} onChange={e => setForm(f => ({ ...f, pinned: e.target.checked }))} /> Pinned: Oreo reads this before every answer</label>
          </div>
          <div className="mt-3 flex gap-2"><button onClick={saveForm} disabled={busy} className="rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Save</button><button onClick={() => setEditing(null)} className="rounded-xl border border-line px-4 py-2 text-sm font-semibold">Cancel</button></div>
        </div>
      )}

      {['rule', 'fact', 'preference', 'playbook', 'pending'].includes(tab) && (
        <div className="space-y-2">
          {notes.length === 0 && <p className="rounded-2xl bg-white p-6 text-center text-sm text-soft shadow-panel">{tab === 'pending' ? 'Nothing waiting for your approval.' : 'Nothing here yet.'}</p>}
          {notes.map(n => (
            <div key={n.id} className="rounded-2xl border border-white/70 bg-white p-4 shadow-panel">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">{n.pinned && <span title="Pinned" className="text-amber-500">★</span>}{n.title}
                    <span className="rounded-full bg-mist px-2 py-0.5 text-[10px] font-bold uppercase text-soft">{n.kind}</span>
                    {n.source === 'oreo' && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase text-violet-700">learned by Oreo</span>}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-soft">{n.body}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  {n.status === 'pending' && <button onClick={() => post({ action: 'approve', id: n.id })} className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white">Approve</button>}
                  <button onClick={() => edit(n)} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold">Edit</button>
                  <button onClick={() => post({ action: 'update', id: n.id, pinned: !n.pinned })} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold">{n.pinned ? 'Unpin' : 'Pin'}</button>
                  <button onClick={() => showVersions(n.id)} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold">Versions</button>
                  <button onClick={() => { if (confirm('Remove this note from Oreo\'s brain? You can bring it back from Versions.')) post({ action: 'archive', id: n.id }) }} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600">Remove</button>
                </div>
              </div>
              {versions?.id === n.id && (
                <div className="mt-3 rounded-xl bg-mist p-3 text-xs">
                  {versions.list.length === 0 ? <p className="text-soft">No earlier versions.</p> : versions.list.map(v => (
                    <div key={v.id} className="mb-2 flex items-start justify-between gap-2 border-b border-line/60 pb-2 last:mb-0 last:border-0 last:pb-0"><div><p className="font-semibold">{v.title} <span className="font-normal text-soft">· {new Date(v.changed_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span></p><p className="whitespace-pre-wrap text-soft">{v.body}</p></div><button onClick={() => post({ action: 'restore', versionId: v.id })} className="shrink-0 rounded-lg border border-line bg-white px-2 py-1 font-semibold">Restore</button></div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'history' && (
        <div className="overflow-hidden rounded-2xl border border-white/70 bg-white shadow-panel">
          {acts.length === 0 ? <p className="p-6 text-center text-sm text-soft">Oreo has not done anything yet.</p> : acts.map(a => (
            <div key={a.id} className="flex flex-wrap items-start justify-between gap-2 border-b border-line/60 px-4 py-3 last:border-0">
              <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{a.summary}</p>{a.result && <p className="text-xs text-soft">{a.result}</p>}<p className="text-[11px] text-soft">{new Date(a.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}{a.via ? ` · confirmed by ${a.via}` : ''}</p></div>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${a.status === 'done' ? 'bg-green-100 text-green-700' : a.status === 'pending' ? 'bg-amber-100 text-amber-700' : a.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-mist text-soft'}`}>{a.risk === 'money' ? 'money · ' : ''}{a.status}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'docs' && (
        <div className="space-y-2">{docs.length === 0 ? <p className="rounded-2xl bg-white p-6 text-center text-sm text-soft shadow-panel">No notes match.</p> : docs.map(d => <div key={d.path} className="rounded-2xl border border-white/70 bg-white p-4 shadow-panel"><p className="text-sm font-semibold">{d.title} <span className="font-mono text-xs font-normal text-soft">{d.path}</span></p><p className="mt-1 text-xs text-soft">{d.snippet}</p></div>)}</div>
      )}

      {tab === 'settings' && (
        <div className="max-w-md rounded-2xl border border-white/70 bg-white p-5 shadow-panel">
          <p className="text-sm font-semibold">Daily spending limit</p>
          <p className="mt-1 text-xs text-soft">Oreo stops answering for the day when its AI cost (chat and voice) reaches this. Today: ${info.spentTodayUsd.toFixed(3)} (₹{(info.spentTodayUsd * info.usdInr).toFixed(2)}) of ${info.dailyCapUsd.toFixed(2)} (₹{(info.dailyCapUsd * info.usdInr).toFixed(0)}).</p>
          <div className="mt-3 flex items-center gap-2"><span className="text-sm">$</span><input data-no-upper value={cap} onChange={e => setCap(e.target.value)} inputMode="decimal" className={inputCls + ' max-w-[120px]'} /><button onClick={() => post({ action: 'setCap', dailyCapUsd: Number(cap) })} disabled={busy} className="rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Save</button></div>
        </div>
      )}
    </div>
  )
}
