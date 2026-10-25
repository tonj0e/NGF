'use client'
import { useEffect, useMemo, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Session } from '@/types'

interface Feature { key: string; label: string; group: string; holders: string[] }
const ROLES: { key: string; label: string }[] = [
  { key: 'manager', label: 'Manager' },
  { key: 'assistant_manager', label: 'Assistant Manager' },
  { key: 'accountant', label: 'Accountant' },
  { key: 'cashier', label: 'Cashier' },
  { key: 'agent', label: 'Agent' },
  { key: 'guarantor', label: 'Guarantor' },
]

// One table: what each branch role gets by default. Anything extra for one person is set when editing that person.
export function RoleDefaultsCard({ session, onSaved }: { session: Session; onSaved?: () => void }) {
  const [features, setFeatures] = useState<Feature[]>([])
  const [table, setTable] = useState<Record<string, string[]>>({})
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [open, setOpen] = useState(false)
  const headers = { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' }

  useEffect(() => {
    fetch('/api/branches', { headers }).then(r => r.json()).then(j => {
      if (!j.success) return
      setFeatures(j.data.features || [])
      setSaved(!!j.data.roleDefaults)
      setTable(j.data.roleDefaults || j.data.startingDefaults || {})
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const groups = useMemo(() => {
    const m = new Map<string, Feature[]>()
    for (const f of features) m.set(f.group, [...(m.get(f.group) || []), f])
    return Array.from(m.entries())
  }, [features])

  const toggle = (role: string, key: string) =>
    setTable(t => {
      const list = t[role] || []
      return { ...t, [role]: list.includes(key) ? list.filter(k => k !== key) : [...list, key] }
    })

  async function save() {
    setBusy(true); setMsg('')
    try {
      const r = await fetch('/api/branches', { method: 'POST', headers, body: JSON.stringify({ action: 'saveRoleDefaults', roleDefaults: table }) })
      const j = await r.json()
      if (!j.success) throw new Error(j.error || 'Could not save')
      setSaved(true); setMsg('Saved. Everyone in these roles now gets these features.'); onSaved?.()
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not save') }
    setBusy(false)
  }

  return (
    <div className="rounded-[1.75rem] border border-white/70 bg-white p-4 shadow-panel sm:p-5">
      <button type="button" onClick={() => setOpen(o => !o)} className="flex w-full items-center justify-between gap-3 text-left" aria-expanded={open}>
        <span>
          <span className="flex items-center gap-2 text-lg font-semibold text-gray-900"><ShieldCheck className="h-5 w-5" />Role defaults</span>
          <span className="mt-0.5 block text-sm text-gray-500">What each role gets automatically. {saved ? 'Saved.' : 'Not saved yet: nobody gets defaults until you save.'}</span>
        </span>
        <span className="text-sm font-semibold text-gray-500">{open ? 'Hide' : 'Open'}</span>
      </button>
      {open && (
        <div className="mt-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-gray-500">
                  <th className="py-2 pr-3">Feature</th>
                  {ROLES.map(r => <th key={r.key} className="px-2 py-2 text-center">{r.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {groups.map(([group, list]) => (
                  <FeatureRows key={group} group={group} list={list} table={table} toggle={toggle} />
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-gray-500">Extra access for one person: open that person from the branch and switch single features on or off there. A person can have several roles; they get all of them.</p>
          <div className="mt-3 flex items-center gap-3">
            <Button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save defaults'}</Button>
            {msg && <span className="text-sm text-gray-600">{msg}</span>}
          </div>
        </div>
      )}
    </div>
  )
}

function FeatureRows({ group, list, table, toggle }: { group: string; list: Feature[]; table: Record<string, string[]>; toggle: (role: string, key: string) => void }) {
  return (
    <>
      <tr><td colSpan={ROLES.length + 1} className="pt-3 text-xs font-bold uppercase tracking-wider text-gray-400">{group}</td></tr>
      {list.map(f => (
        <tr key={f.key} className="border-t border-gray-100">
          <td className="py-2 pr-3 text-gray-800">{f.label}</td>
          {ROLES.map(r => {
            const can = f.holders.includes(r.key === 'agent' ? 'agent' : r.key === 'guarantor' ? 'guarantor' : 'staff')
            return (
              <td key={r.key} className="px-2 py-2 text-center">
                {can
                  ? <input type="checkbox" className="h-4 w-4 accent-green-600" checked={(table[r.key] || []).includes(f.key)} onChange={() => toggle(r.key, f.key)} aria-label={`${f.label} for ${r.label}`} />
                  : <span className="text-gray-300">–</span>}
              </td>
            )
          })}
        </tr>
      ))}
    </>
  )
}
