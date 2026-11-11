'use client'
import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { Session } from '@/types'
import { apiGet } from '@/lib/clientApi'
import OreoMap, { Overview } from '@/components/oreo/OreoMap'
import OreoChat from '@/components/oreo/OreoChat'
import { OreoStyles } from '@/components/oreo/Mascot'

const AIPage = dynamic(() => import('./AIPage'))
const OreoBrain = dynamic(() => import('@/components/oreo/OreoBrain'))

// The Admin "AI" page: Oreo, the owner's assistant. Activity (usage, logs, pricing) sits behind the button at the top right.
type View = 'oreo' | 'brain' | 'activity'
const RANGES: { key: string; label: string }[] = [{ key: 'today', label: 'Today' }, { key: 'week', label: 'This week' }, { key: '30d', label: 'Last 30 days' }, { key: '90d', label: 'Last 90 days' }, { key: '6m', label: 'Last 6 months' }, { key: 'all', label: 'All time' }]
const LEVEL: Record<string, string> = { urgent: 'border-red-200 bg-red-50', attention: 'border-amber-200 bg-amber-50', info: 'border-sky-200 bg-sky-50' }
const DOT: Record<string, string> = { urgent: 'bg-red-500', attention: 'bg-amber-500', info: 'bg-sky-500' }

export default function OreoPage({ session, active = true }: { session: Session; active?: boolean }) {
  const [view, setView] = useState<View>('oreo')
  const [data, setData] = useState<Overview | null>(null)
  const [range, setRange] = useState('today')
  const [prefill, setPrefill] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const r = await apiGet<Overview>(session.token, `/api/oreo/overview?range=${range}`)
    if (r.ok) { setData(r.data!); setError('') } else setError(r.error || 'Could not load')
  }, [session.token, range])
  useEffect(() => {
    if (view !== 'oreo') return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()   // once when the page is preloaded, again when the range changes
  }, [load, view])
  useEffect(() => {
    if (view !== 'oreo' || !active) return
    const t = setInterval(() => { if (!document.hidden) load() }, 30_000)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()   // fresh numbers each time you come back to this page
    return () => clearInterval(t)
  }, [load, view, active])

  const go = (page: string) => {
    if (page === 'brain') { setView('brain'); return }
    if (page === 'activity') { setView('activity'); return }
    if (page === 'ai') return
    try { window.history.pushState(null, '', `#${page}`); window.dispatchEvent(new PopStateEvent('popstate')) } catch { /* stay */ }
  }

  if (view === 'activity') return <AIPage session={session} onBack={() => setView('oreo')} />
  if (view === 'brain') return <OreoBrain session={session} onClose={() => { setView('oreo'); load() }} onChanged={load} />

  const urgent = data?.needs.filter(n => n.level === 'urgent').length || 0
  const total = data?.needs.length || 0
  const rate = data?.oreo.usdInr || 90
  return (
    <div className="space-y-4">
      <OreoStyles />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-wide text-soft">NGF</p><h1 className="text-2xl font-semibold">Oreo</h1></div>
          {data && (
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${data.status === 'calm' ? 'bg-emerald-100 text-emerald-700' : data.status === 'urgent' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>
              {data.status === 'calm' ? 'All calm' : `${total} need${total === 1 ? 's' : ''} you${urgent ? ` · ${urgent} urgent` : ''}`}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setView('brain')} className="rounded-2xl border border-line bg-white px-4 py-2 text-sm font-semibold">Brain</button>
          <button onClick={() => setView('activity')} className="rounded-2xl border border-line bg-white px-4 py-2 text-sm font-semibold">Activity</button>
        </div>
      </div>
      {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px] xl:h-[calc(100vh-11rem)] xl:min-h-[640px]">
        <div className="min-h-0 xl:h-full"><OreoMap data={data} onOpen={go} onAsk={setPrefill} /></div>
        <div className="order-first min-h-0 xl:order-none xl:h-full">
          <OreoChat session={session} usdInr={rate} prefill={prefill} onPrefillUsed={() => setPrefill('')} onChanged={load} active={active} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[1.75rem] border border-white/70 bg-white p-4 shadow-panel sm:p-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-soft">Needs you{total ? ` · ${total}` : ''}</p>
          {!data ? null : total === 0 ? <p className="rounded-xl bg-emerald-50 px-3 py-3 text-sm text-emerald-800">All calm. Nothing is waiting for you right now.</p> : (
            <div className="space-y-2">
              {data.needs.map(n => (
                <div key={n.id} className={`rounded-xl border px-3 py-2.5 ${LEVEL[n.level]}`}>
                  <p className="flex items-center gap-1.5 text-sm font-semibold"><span className={`h-2 w-2 rounded-full ${DOT[n.level]}`} />{n.title}</p>
                  <p className="text-xs text-soft">{n.detail}</p>
                  <div className="mt-1.5 flex gap-1.5">
                    {n.ask && <button onClick={() => setPrefill(n.ask)} className="rounded-lg bg-ink px-2.5 py-1 text-[11px] font-semibold text-white">Ask Oreo</button>}
                    <button onClick={() => go(n.page)} className="rounded-lg border border-line bg-white px-2.5 py-1 text-[11px] font-semibold">Open</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-[1.75rem] border border-white/70 bg-white p-4 shadow-panel sm:p-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-soft">Oreo&apos;s work</p>
          <p className="text-lg font-semibold leading-snug">{data ? <>{data.oreo.questions} question{data.oreo.questions === 1 ? '' : 's'} asked, {data.oreo.actions} action{data.oreo.actions === 1 ? '' : 's'} done.</> : '…'}</p>
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {RANGES.map(r => <button key={r.key} onClick={() => setRange(r.key)} className={`rounded-xl px-2 py-1.5 text-xs font-semibold ${range === r.key ? 'bg-ink text-white' : 'bg-mist text-soft hover:text-ink'}`}>{r.label}</button>)}
          </div>
          {data && (
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-soft">Spend in this period</span><span className="font-semibold">${data.oreo.spendUsd.toFixed(4)} · ₹{(data.oreo.spendUsd * rate).toFixed(2)}</span></div>
              <div>
                <div className="flex justify-between text-xs"><span className="text-soft">Today against the daily limit</span><span className="font-semibold">${data.oreo.spentTodayUsd.toFixed(3)} of ${data.oreo.dailyCapUsd.toFixed(2)}</span></div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-mist"><div className={`h-full rounded-full ${data.oreo.spentTodayUsd / data.oreo.dailyCapUsd > 0.8 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, (data.oreo.spentTodayUsd / data.oreo.dailyCapUsd) * 100)}%` }} /></div>
              </div>
              <button onClick={() => setView('activity')} className="text-xs font-semibold text-soft underline">Full usage, logs and prices</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
