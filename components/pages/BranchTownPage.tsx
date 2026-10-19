'use client'

// Admin-only 3D view of every branch office in a town. Data: /api/branches/org-hierarchy (people) + /api/agent/location (who is live).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { Building2, Moon, Sun, RotateCcw, X, Users, Shield, Bike, Radio } from 'lucide-react'
import type { Session } from '@/types'
import type { TownBranch, TownHover } from '@/components/town/TownScene'

const TownScene = dynamic(() => import('@/components/town/TownScene'), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center text-sm text-slate-500">Loading town…</div>,
})

const ROLE_ORDER: Array<{ key: string; label: string; dot: string }> = [
  { key: 'manager', label: 'Manager', dot: 'bg-blue-600' },
  { key: 'assistant_manager', label: 'Assistant Manager', dot: 'bg-sky-400' },
  { key: 'accountant', label: 'Accountant', dot: 'bg-green-600' },
  { key: 'cashier', label: 'Cashier', dot: 'bg-slate-900' },
]

const glass = 'bg-white/60 backdrop-blur-xl border border-white/60 shadow-[0_8px_32px_rgba(16,19,26,0.12)]'
const glassNight = 'bg-slate-900/55 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] text-white'

export default function BranchTownPage({ session }: { session: Session }) {
  const [branches, setBranches] = useState<TownBranch[]>([])
  const [live, setLive] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [night, setNight] = useState(false)
  const [resetKey, setResetKey] = useState(0)
  const [hover, setHover] = useState<TownHover | null>(null)
  const loadedOnce = useRef(false)

  const load = useCallback(async () => {
    if (!loadedOnce.current) setLoading(true)
    try {
      const headers = { Authorization: `Bearer ${session.token}` }
      const [o, l] = await Promise.all([
        fetch('/api/branches/org-hierarchy', { headers }).then(r => r.json()),
        fetch('/api/agent/location?activeOnly=true', { headers }).then(r => r.json()).catch(() => null),
      ])
      if (!o.success) throw new Error(o.error || 'Could not load branches')
      setBranches(o.data.branches || [])
      setLive(new Set<string>(((l?.data?.locations || []) as Array<{ userId: string }>).map(x => x.userId)))
      setError(''); loadedOnce.current = true
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load the town')
    } finally { setLoading(false) }
  }, [session.token])

  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t) }, [load])

  const sel = branches.find(b => b.branchId === selected) || null
  const totals = useMemo(() => ({
    branches: branches.length,
    staff: branches.reduce((s, b) => s + b.staff.length, 0),
    guarantors: branches.reduce((s, b) => s + b.guarantors.length, 0),
    live: live.size,
  }), [branches, live])

  if (session.role !== 'Admin') return <div className="p-6 text-sm text-slate-500">Admins only.</div>

  const card = night ? glassNight : glass
  const sub = night ? 'text-slate-300' : 'text-slate-500'

  return (
    <div className="relative -m-2 sm:m-0 h-[calc(100dvh-7.5rem)] min-h-[520px] overflow-hidden rounded-[1.75rem] bg-slate-100">
      <TownScene
        branches={branches} liveAgentIds={live} selectedId={selected} night={night} resetKey={resetKey}
        onSelect={setSelected} onHover={setHover}
      />

      {/* Title + controls */}
      <div className={`absolute left-3 top-3 right-3 sm:right-auto flex flex-wrap items-center gap-2 rounded-2xl px-3 py-2 ${card}`}>
        <Building2 className="h-5 w-5 text-green-600" />
        <div className="mr-2">
          <div className="text-sm font-semibold leading-tight">NGF Branch Town</div>
          <div className={`text-[11px] leading-tight ${sub}`}>Admin view · drag to rotate, click an office</div>
        </div>
        <button onClick={() => setNight(n => !n)} className={`rounded-xl p-2 ${night ? 'hover:bg-white/10' : 'hover:bg-white/70'}`} title="Day / night">
          {night ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <button onClick={() => { setSelected(null); setResetKey(k => k + 1) }} className={`rounded-xl p-2 ${night ? 'hover:bg-white/10' : 'hover:bg-white/70'}`} title="Back to town view">
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>

      {/* KPIs */}
      <div className="absolute left-3 bottom-3 right-3 sm:right-auto flex gap-2 overflow-x-auto [scrollbar-width:none]">
        {[
          { icon: Building2, label: 'Branches', v: totals.branches },
          { icon: Users, label: 'Staff', v: totals.staff },
          { icon: Shield, label: 'Guarantors', v: totals.guarantors },
          { icon: Radio, label: 'Agents live', v: totals.live },
        ].map(k => (
          <div key={k.label} className={`flex shrink-0 items-center gap-2 rounded-2xl px-3 py-2 ${card}`}>
            <k.icon className="h-4 w-4 text-blue-600" />
            <div><div className="text-base font-semibold leading-none">{k.v}</div><div className={`text-[10px] ${sub}`}>{k.label}</div></div>
          </div>
        ))}
      </div>

      {/* Branch list (desktop) */}
      {!sel && branches.length > 0 && (
        <div className={`absolute right-3 top-3 hidden max-h-[60%] w-60 overflow-y-auto rounded-2xl p-2 sm:block ${card}`}>
          <div className={`px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide ${sub}`}>Branches</div>
          {branches.map(b => (
            <button key={b.branchId} onClick={() => setSelected(b.branchId)} className={`flex w-full items-center justify-between rounded-xl px-2 py-2 text-left text-sm ${night ? 'hover:bg-white/10' : 'hover:bg-white/70'}`}>
              <span className="truncate font-medium">{b.name}</span>
              <span className={`text-[11px] ${sub}`}>{b.staff.length + b.guarantors.length}</span>
            </button>
          ))}
        </div>
      )}

      {/* Selected branch */}
      {sel && (
        <div className={`absolute inset-x-3 bottom-16 top-auto max-h-[36%] overflow-y-auto rounded-2xl p-4 sm:inset-x-auto sm:right-3 sm:top-3 sm:bottom-3 sm:max-h-none sm:w-80 ${card}`}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-base font-semibold">{sel.name}</div>
              <div className={`text-xs ${sub}`}>{sel.status} · {sel.staff.length} staff · {sel.guarantors.length} guarantors</div>
            </div>
            <button onClick={() => { setSelected(null); setResetKey(k => k + 1) }} className={`rounded-lg p-1.5 ${night ? 'hover:bg-white/10' : 'hover:bg-white/70'}`}><X className="h-4 w-4" /></button>
          </div>

          <div className={`mt-3 text-[11px] font-semibold uppercase tracking-wide ${sub}`}>Inside the office</div>
          <div className="mt-1 space-y-1.5">
            {ROLE_ORDER.map(r => {
              const people = sel.staff.filter(s => s.roleInBranch === r.key)
              return (
                <div key={r.key} className="flex items-start gap-2 text-sm">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${r.dot}`} />
                  <div className="min-w-0">
                    <div className={`text-[11px] ${sub}`}>{r.label} cabin</div>
                    <div className="truncate">{people.length ? people.map(p => p.name).join(', ') : <span className={sub}>Vacant</span>}</div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className={`mt-4 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide ${sub}`}><Bike className="h-3.5 w-3.5" /> Out in the field</div>
          <div className="mt-1 space-y-1">
            {sel.staff.filter(s => s.roleInBranch === 'collection_agent').map(a => (
              <div key={a.userId} className="flex items-center justify-between text-sm">
                <span className="truncate">{a.name} <span className={`text-[11px] ${sub}`}>agent</span></span>
                {live.has(a.userId) && <span className="rounded-full bg-green-600/90 px-2 py-0.5 text-[10px] font-semibold text-white">LIVE</span>}
              </div>
            ))}
            {sel.guarantors.map(g => (
              <div key={g.guarantorId} className="flex items-center justify-between text-sm">
                <span className="truncate">{g.name} <span className={`text-[11px] ${sub}`}>guarantor · {g.code}</span></span>
              </div>
            ))}
            {!sel.staff.some(s => s.roleInBranch === 'collection_agent') && sel.guarantors.length === 0 && <div className={`text-sm ${sub}`}>No one in the field yet.</div>}
          </div>
          <p className={`mt-4 text-[10px] leading-snug ${sub}`}>Movement in the town is illustrative. The green LIVE ring means that agent is tracking right now.</p>
        </div>
      )}

      {/* Hover tooltip */}
      {hover && (
        <div className={`pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-[130%] rounded-xl px-2.5 py-1.5 text-xs ${card}`} style={{ left: hover.x, top: hover.y }}>
          <div className="font-semibold">{hover.title}</div><div className={sub}>{hover.sub}</div>
        </div>
      )}

      {loading && <div className="absolute inset-0 grid place-items-center text-sm text-slate-500">Loading branches…</div>}
      {error && !loading && (
        <div className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl px-4 py-3 text-sm ${card}`}>
          {error} <button onClick={load} className="ml-2 font-semibold text-blue-600 underline">Retry</button>
        </div>
      )}
      {!loading && !error && branches.length === 0 && <div className="absolute inset-0 grid place-items-center text-sm text-slate-500">No branches yet. Add one in NGF Branches.</div>}
    </div>
  )
}
