'use client'
import { useEffect, useState } from 'react'
import { Session } from '@/types'
import { apiGet } from '@/lib/clientApi'

// The first thing the owner sees: this Saturday's collection. One square for each weekly payment due that day;
// a square turns blue when that payment is recorded. Beside it, the few things waiting for the owner.
type Data = {
  needs: { id: string; level: 'urgent' | 'attention' | 'info'; title: string; detail: string; page: string }[]
  map: { collection: { dueSaturday: number; dueCount: number; paidSatCount?: number; paidSatAmount?: number; overdue: number; nextSaturday: string } }
}
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`
const go = (page: string) => { try { window.history.pushState(null, '', `#${page}`); window.dispatchEvent(new PopStateEvent('popstate')) } catch { /* stay */ } }
const CHIP: Record<string, string> = { urgent: 'bg-red-100 text-red-800', attention: 'bg-red-50 text-red-800', info: 'bg-blue-100 text-blue-900' }

export default function SaturdayCard({ session }: { session: Session }) {
  const [d, setD] = useState<Data | null>(null)
  useEffect(() => {
    let off = false
    const load = async () => { const r = await apiGet<Data>(session.token, '/api/oreo/overview?range=today'); if (!off && r.ok) setD(r.data!) }
    load()
    const t = setInterval(() => { if (!document.hidden) load() }, 60_000)
    return () => { off = true; clearInterval(t) }
  }, [session.token])
  if (!d) return <div className="h-56 animate-pulse rounded-[1.75rem] border border-white/70 bg-white shadow-panel" />

  const c = d.map.collection
  const paidN = c.paidSatCount || 0, paidAmt = c.paidSatAmount || 0, total = c.dueCount + paidN
  const day = new Date(`${c.nextSaturday}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })
  const needs = d.needs.filter(n => n.page !== 'ai' && n.page !== 'brain' && n.page !== 'activity').slice(0, 3)
  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <section className="rounded-[1.75rem] border border-white/70 bg-white p-5 shadow-panel sm:p-6 lg:col-span-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-soft">Due this Saturday, {day}</p>
            <p className="mt-1 text-5xl font-extrabold leading-none tracking-tight">{inr(c.dueSaturday + paidAmt)}</p>
          </div>
          <button onClick={() => go('collection')} className="min-h-11 rounded-xl bg-ink px-4 text-sm font-bold text-white">Open collection</button>
        </div>
        {total > 0 && total <= 72 ? (
          <div className="mt-5 flex flex-wrap gap-1.5" role="img" aria-label={`${paidN} of ${total} payments recorded`}>
            {Array.from({ length: total }, (_, i) => <span key={i} className={`h-7 w-7 rounded-lg border ${i < paidN ? 'border-brand bg-brand' : 'border-brand/30 bg-white'}`} />)}
          </div>
        ) : total > 0 ? (
          <div className="mt-5 h-3 overflow-hidden rounded-full bg-black/5" role="img" aria-label={`${paidN} of ${total} payments recorded`}><div className="h-full rounded-full bg-brand" style={{ width: `${(paidN / total) * 100}%` }} /></div>
        ) : null}
        <p className="mt-3 text-sm text-soft">{total === 0 ? 'No weekly payments fall on this Saturday.' : total <= 72 ? `One square for each of the ${total} weekly payments. ${paidN} recorded, ${c.dueCount} still to come.` : `${paidN} of ${total} weekly payments recorded.`}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-white/85 px-4 py-3"><p className="text-xs text-soft">Paid so far</p><p className="text-xl font-bold">{inr(paidAmt)}</p></div>
          <div className="rounded-2xl bg-white/85 px-4 py-3"><p className="text-xs text-soft">Still to collect</p><p className="text-xl font-bold">{inr(c.dueSaturday)}</p></div>
          <div className={`rounded-2xl px-4 py-3 ${c.overdue ? 'bg-red-50' : 'bg-white/85'}`}><p className="text-xs text-soft">Overdue from earlier weeks</p><p className={`text-xl font-bold ${c.overdue ? 'text-red-700' : ''}`}>{inr(c.overdue)}</p></div>
        </div>
      </section>
      <section className="rounded-[1.75rem] border border-white/70 bg-white p-5 shadow-panel sm:p-6 lg:col-span-2">
        <h2 className="text-lg font-bold">Waiting for you</h2>
        {needs.length === 0 ? <p className="mt-3 rounded-2xl bg-white/85 px-4 py-4 text-sm text-soft">Nothing is waiting for you right now.</p> : (
          <div className="mt-3 space-y-2.5">
            {needs.map(n => (
              <button key={n.id} onClick={() => go(n.page)} className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-white/85 px-3.5 py-2 text-left transition hover:bg-white">
                <span className={`flex h-10 min-w-10 items-center justify-center rounded-xl px-2 text-sm font-extrabold ${CHIP[n.level]}`}>{n.title.match(/^\d+/)?.[0] || '!'}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{n.title.replace(/^\d+\s*/, '').replace(/^./, x => x.toUpperCase())}</span><span className="block truncate text-xs text-soft">{n.detail}</span></span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
