'use client'
// Shows and edits the integration settings of one group (sms / whatsapp / gateway). Secret values are never shown, only "Saved ····1234".
// Every change asks for the admin's password again.
import { useCallback, useEffect, useState } from 'react'
import { Session } from '@/types'
import { apiGet, apiSend } from '@/lib/clientApi'

type F = { name: string; group: string; label: string; secret: boolean; hint?: string; options?: string[]; placeholder?: string; source: 'panel' | 'server' | 'none'; last4: string; value: string }

export default function IntegrationFields({ session, group, onChanged }: { session: Session; group: 'sms' | 'whatsapp' | 'gateway' | 'ai'; onChanged?: () => void }) {
  const [fields, setFields] = useState<F[]>([])
  const [edit, setEdit] = useState<string | null>(null)
  const [value, setValue] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => { const r = await apiGet<{ fields: F[] }>(session.token, '/api/integrations'); if (r.ok) setFields(r.data!.fields.filter(f => f.group === group)) }, [session.token, group])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  async function save(name: string, action: 'set' | 'clear') {
    setBusy(true); setMsg(null)
    const r = await apiSend<{ fields: F[] }>(session.token, 'POST', '/api/integrations', { action, name, value, password })
    setBusy(false)
    if (!r.ok) { setMsg({ ok: false, text: r.error || 'Could not save' }); return }
    setFields(r.data!.fields.filter(f => f.group === group)); setEdit(null); setValue(''); setPassword('')
    setMsg({ ok: true, text: action === 'set' ? 'Saved. It is used straight away.' : 'Removed.' }); onChanged?.()
  }

  const badge = (f: F) => f.source === 'panel' ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">Saved{f.secret ? ` ····${f.last4}` : ''}</span>
    : f.source === 'server' ? <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">From server settings{f.secret && f.last4 ? ` ····${f.last4}` : ''}</span>
    : <span className="rounded-full bg-[#e5e7eb] px-2 py-0.5 text-[10px] font-bold text-[#697586]">Not set</span>

  return (
    <div className="space-y-2">
      {msg && <p className={`rounded-xl px-3 py-2 text-xs ${msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>{msg.text}</p>}
      {fields.map(f => (
        <div key={f.name} className="rounded-2xl border border-[#e5e7eb] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold">{f.label} {badge(f)}</p>
              {!f.secret && f.value && <p className="mt-0.5 break-all font-mono text-xs text-[#697586]">{f.value}</p>}
              {f.hint && <p className="mt-0.5 text-[11px] text-[#697586]">{f.hint}</p>}
            </div>
            {edit !== f.name && (
              <div className="flex gap-2">
                <button onClick={() => { setEdit(f.name); setValue(''); setPassword(''); setMsg(null) }} className="rounded-xl border border-[#e5e7eb] px-3 py-1.5 text-xs font-semibold">{f.source === 'none' ? 'Set' : 'Change'}</button>
              </div>
            )}
          </div>
          {edit === f.name && (
            <div className="mt-2 space-y-2">
              {f.options
                ? <select value={value} onChange={e => setValue(e.target.value)} className="w-full rounded-xl border border-[#e5e7eb] bg-white px-3 py-2 text-sm"><option value="">Choose…</option>{f.options.map(o => <option key={o} value={o}>{o}</option>)}</select>
                : <input value={value} onChange={e => setValue(e.target.value)} type={f.secret ? 'password' : 'text'} autoComplete="off" data-no-upper placeholder={f.secret ? 'Paste the key (it will not be shown again)' : f.placeholder || ''} className="w-full rounded-xl border border-[#e5e7eb] bg-[#f4f5f7] px-3 py-2 text-sm outline-none focus:border-[#1a1a2e] focus:bg-white" />}
              <input value={password} onChange={e => setPassword(e.target.value)} type="password" autoComplete="current-password" data-no-upper placeholder="Your admin password to confirm" className="w-full rounded-xl border border-[#e5e7eb] bg-[#f4f5f7] px-3 py-2 text-sm outline-none focus:border-[#1a1a2e] focus:bg-white" />
              <div className="flex flex-wrap gap-2">
                <button onClick={() => save(f.name, 'set')} disabled={busy || !value || !password} className="rounded-xl bg-[#1a1a2e] px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">{busy ? 'Saving…' : 'Save'}</button>
                {f.source === 'panel' && <button onClick={() => save(f.name, 'clear')} disabled={busy || !password} className="rounded-xl border border-red-200 px-4 py-2 text-xs font-semibold text-red-600 disabled:opacity-40">Remove</button>}
                <button onClick={() => setEdit(null)} className="rounded-xl border border-[#e5e7eb] px-3 py-2 text-xs font-semibold">Cancel</button>
              </div>
            </div>
          )}
        </div>
      ))}
      <p className="text-[11px] text-[#697586]">Keys are stored encrypted and cannot be read back, here or anywhere. Changing one needs your password and alerts the other admins.</p>
    </div>
  )
}
