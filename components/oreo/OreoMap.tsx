'use client'
import { useLayoutEffect, useRef, useState } from 'react'
import { OreoFace, OreoStyles } from './Mascot'

// The live business map: you on the left, Oreo in the middle, the parts of the business in one column on the right with their numbers right now.
// The lines run in the open space between Oreo and the boxes. Click a part to open its page, or press Ask to talk about it with Oreo.
export type Overview = {
  status: 'calm' | 'attention' | 'urgent'; today: string
  map: {
    leads: { new: number; inProgress: number; returned: number }; verification: { inProgress: number; submitted: number }; approval: { waiting: number }
    disbursement: { waiting: number; files: number }; loans: { active: number; customers: number }
    collection: { dueSaturday: number; dueCount: number; paidWeek: number; overdue: number; nextSaturday: string }; payments: { needStaff: number }
  }
  oreo: { range: string; questions: number; actions: number; spendUsd: number; spentTodayUsd: number; dailyCapUsd: number; usdInr: number }
  needs: { id: string; level: 'urgent' | 'attention' | 'info'; title: string; detail: string; page: string; ask: string }[]
}
type Level = 'calm' | 'info' | 'attention' | 'urgent'
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`
const TONE: Record<Level, string> = {
  calm: 'border-line bg-white', info: 'border-sky-200 bg-sky-50/60', attention: 'border-amber-300 bg-amber-50', urgent: 'border-red-300 bg-red-50',
}
const DOT: Record<Level, string> = { calm: 'bg-emerald-500', info: 'bg-sky-500', attention: 'bg-amber-500', urgent: 'bg-red-500' }
const BAR: Record<Level, string> = { calm: 'bg-emerald-500', info: 'bg-sky-500', attention: 'bg-amber-500', urgent: 'bg-red-500' }
const STROKE: Record<Level, string> = { calm: '#94a3b8', info: '#38bdf8', attention: '#f59e0b', urgent: '#ef4444' }

type Part = { key: string; label: string; big: string; sub: string; level: Level; page: string; ask: string; bar: number }

export default function OreoMap({ data, onOpen, onAsk }: { data: Overview | null; onOpen: (page: string) => void; onAsk: (q: string) => void }) {
  const wrap = useRef<HTMLDivElement>(null), oreo = useRef<HTMLDivElement>(null)
  const nodes = useRef<Record<string, HTMLElement | null>>({})
  const [paths, setPaths] = useState<{ k: string; d: string; level: Level }[]>([])
  const m = data?.map
  const mx = Math.max(1, m ? m.loans.active : 1)

  const parts: Part[] = m ? [
    { key: 'leads', label: 'Leads', big: String(m.leads.new + m.leads.inProgress), sub: `${m.leads.new} new · ${m.leads.inProgress} being verified${m.leads.returned ? ` · ${m.leads.returned} returned` : ''}`, level: m.leads.returned ? 'info' : 'calm', page: 'leads', ask: 'How are the leads? Anything stuck?', bar: (m.leads.new + m.leads.inProgress) / mx },
    { key: 'verification', label: 'Verification', big: String(m.verification.inProgress), sub: `${m.verification.submitted} submitted, waiting for a decision`, level: m.verification.submitted ? 'attention' : 'calm', page: 'routes', ask: 'What is happening with verification and the agent visits?', bar: m.verification.inProgress / mx },
    { key: 'approval', label: 'Approval', big: String(m.approval.waiting), sub: m.approval.waiting ? 'leads waiting for you' : 'nothing waiting', level: m.approval.waiting ? 'attention' : 'calm', page: 'leads', ask: 'Which leads are waiting for approval?', bar: m.approval.waiting / mx },
    { key: 'disbursement', label: 'Disbursement', big: String(m.disbursement.waiting), sub: `approved, to be paid · ${m.disbursement.files} bank files live`, level: m.disbursement.waiting ? 'attention' : 'calm', page: 'leads', ask: 'Show the disbursement queue and what is blocking it.', bar: m.disbursement.waiting / mx },
    { key: 'loans', label: 'Loans', big: String(m.loans.active), sub: `${m.loans.customers} customers`, level: 'calm', page: 'customers', ask: 'Give me the loan book summary.', bar: 1 },
    { key: 'collection', label: 'Collection', big: inr(m.collection.dueSaturday), sub: `${m.collection.dueCount} due ${m.collection.nextSaturday.slice(5)} · ${inr(m.collection.paidWeek)} paid this week${m.collection.overdue ? ` · ${inr(m.collection.overdue)} overdue` : ''}`, level: m.collection.overdue ? 'urgent' : 'calm', page: 'collection', ask: 'How is the collection this Saturday?', bar: m.collection.dueSaturday + m.collection.paidWeek > 0 ? m.collection.paidWeek / (m.collection.dueSaturday + m.collection.paidWeek) : 0 },
    { key: 'payments', label: 'Payments', big: String(m.payments.needStaff), sub: m.payments.needStaff ? 'screenshots need staff' : 'all matched', level: m.payments.needStaff ? 'urgent' : 'calm', page: 'payments', ask: 'Which payment screenshots need staff and why?', bar: m.payments.needStaff ? 1 : 0 },
  ] : []

  useLayoutEffect(() => {
    const calc = () => {
      const w = wrap.current, o = oreo.current
      if (!w || !o || w.clientWidth < 640) { setPaths([]); return }
      const wb = w.getBoundingClientRect(), ob = o.getBoundingClientRect()
      const out: { k: string; d: string; level: Level }[] = []
      for (const [k, el] of Object.entries(nodes.current)) {
        if (!el) continue
        const b = el.getBoundingClientRect()
        if (k.startsWith('in-')) {
          const x1 = b.right - wb.left, y1 = b.top + b.height / 2 - wb.top, x2 = ob.left - wb.left, y2 = ob.top + ob.height / 2 - wb.top, dx = (x2 - x1) / 2
          out.push({ k, d: `M${x1} ${y1} C${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`, level: 'calm' })
        } else {
          const x1 = ob.right - wb.left, y1 = ob.top + ob.height / 2 - wb.top, x2 = b.left - wb.left, y2 = b.top + b.height / 2 - wb.top, dx = (x2 - x1) / 2
          out.push({ k, d: `M${x1} ${y1} C${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`, level: (parts.find(p => p.key === k)?.level || 'calm') as Level })
        }
      }
      setPaths(out)
    }
    calc()
    const ro = new ResizeObserver(calc); if (wrap.current) ro.observe(wrap.current)
    window.addEventListener('resize', calc)
    return () => { ro.disconnect(); window.removeEventListener('resize', calc) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  return (
    <div ref={wrap} className="relative flex h-full min-h-[560px] flex-col rounded-[1.75rem] border border-white/70 bg-white p-4 shadow-panel sm:p-5">
      <OreoStyles />
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-soft">Your business, live</p>
      <svg className="pointer-events-none absolute inset-0 hidden h-full w-full sm:block">
        {paths.map(p => <path key={p.k} d={p.d} fill="none" stroke={STROKE[p.level]} strokeWidth={p.level === 'calm' ? 1.6 : 2.2} strokeLinecap="round" className="ore-flow" opacity={p.level === 'calm' ? 0.55 : 0.95} />)}
      </svg>
      {!data ? <div className="flex flex-1 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-ink border-t-transparent" /></div> : (
        <div className="relative grid flex-1 items-stretch gap-4 sm:grid-cols-[96px_minmax(180px,230px)_minmax(0,1fr)] sm:gap-x-14 lg:grid-cols-[110px_minmax(190px,240px)_minmax(0,1fr)] lg:gap-x-20">
          <div className="hidden flex-col justify-center gap-4 sm:flex">
            {['Voice', 'Typing', 'Alerts'].map(x => <div key={x} ref={el => { nodes.current[`in-${x}`] = el }} className="rounded-xl border border-line bg-mist px-3 py-2.5 text-center text-xs font-semibold text-soft">{x}</div>)}
          </div>
          <div className="flex items-center">
            <div ref={oreo} className="w-full rounded-2xl bg-[#0f2a24] p-5 text-white shadow-lg">
              <div className="flex items-center gap-3">
                <OreoFace size={52} state="idle" />
                <div><p className="text-lg font-semibold leading-tight">Oreo</p><p className="text-xs text-emerald-200">your assistant</p></div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-emerald-100/90">Knows the business, checks the data, and acts when you ask.</p>
              <div className="mt-4 grid grid-cols-2 gap-2 text-center">
                <div className="rounded-lg bg-white/10 py-2"><p className="text-xl font-semibold leading-none">{data.oreo.questions}</p><p className="mt-1 text-[10px] text-emerald-100">questions</p></div>
                <div className="rounded-lg bg-white/10 py-2"><p className="text-xl font-semibold leading-none">{data.oreo.actions}</p><p className="mt-1 text-[10px] text-emerald-100">actions done</p></div>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2.5">
            {parts.map(p => (
              <div key={p.key} ref={el => { nodes.current[p.key] = el }} className={`flex min-h-[64px] flex-1 flex-col justify-center rounded-xl border px-3.5 py-2 transition ${TONE[p.level]}`}>
                <div className="flex items-center justify-between gap-2">
                  <button onClick={() => onOpen(p.page)} className="min-w-0 flex-1 text-left">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-soft"><span className={`h-2 w-2 rounded-full ${DOT[p.level]}`} />{p.label}</p>
                      <p className="text-xl font-semibold leading-none">{p.big}</p>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/5"><div className={`h-full rounded-full ${BAR[p.level]} transition-all duration-700`} style={{ width: `${p.bar > 0 ? Math.max(4, Math.min(100, p.bar * 100)) : 0}%` }} /></div>
                    <p className="mt-1 truncate text-[11px] text-soft">{p.sub}</p>
                  </button>
                  <button onClick={() => onAsk(p.ask)} title="Ask Oreo about this" className="shrink-0 rounded-lg border border-line bg-white px-2 py-1 text-[11px] font-semibold text-ink hover:bg-mist">Ask</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
