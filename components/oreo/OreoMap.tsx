'use client'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { OreoFace, OreoStyles } from './Mascot'

// The live business flow. Left: how you reach Oreo (voice, typing, alerts). Middle: Oreo, the brain that decides, with the Obsidian notes feeding it knowledge.
// Right: the parts of the business. When you ask something the flow plays: your question goes in, Oreo reads its notes, then reaches the part it needs and the data flows back.
export type Overview = {
  status: 'calm' | 'attention' | 'urgent'; today: string
  map: {
    leads: { new: number; inProgress: number; returned: number }; verification: { inProgress: number; submitted: number }; approval: { waiting: number }
    disbursement: { waiting: number; files: number }; loans: { active: number; customers: number }
    collection: { dueSaturday: number; dueCount: number; paidWeek: number; overdue: number; nextSaturday: string }; payments: { needStaff: number }
  }
  groups?: { code: string; name: string; loans: number; overdue: number }[]
  oreo: { range: string; questions: number; actions: number; spendUsd: number; spentTodayUsd: number; dailyCapUsd: number; usdInr: number }
  needs: { id: string; level: 'urgent' | 'attention' | 'info'; title: string; detail: string; page: string; ask: string }[]
}
type Level = 'calm' | 'info' | 'attention' | 'urgent'
export type Activity = { seq: number; busy: boolean; question: string; tools: string[]; state?: string }
export type TNode = { id: string; label: string; value: string; sub: string; level: Level; bar: number }
export type Topic = { key: string; title: string; line: string; page: string; columns: { title: string; nodes: TNode[] }[]; links: [string, string][] }

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`
const RING: Record<Level, string> = { calm: 'border-line bg-white', info: 'border-sky-200 bg-sky-50/70', attention: 'border-amber-300 bg-amber-50', urgent: 'border-red-300 bg-red-50' }
const DOT: Record<Level, string> = { calm: 'bg-indigo-400', info: 'bg-sky-500', attention: 'bg-amber-500', urgent: 'bg-red-500' }
const BAR: Record<Level, string> = { calm: 'bg-indigo-400', info: 'bg-sky-500', attention: 'bg-amber-500', urgent: 'bg-red-500' }
const STROKE: Record<Level, string> = { calm: '#818cf8', info: '#38bdf8', attention: '#f59e0b', urgent: '#ef4444' }

type Part = { key: string; label: string; big: string; sub: string; level: Level; page: string; ask: string; bar: number }

// What each of Oreo's tools touches, so the right parts light up while it works
const TOOL_KEYS: Record<string, string[]> = {
  business_snapshot: ['leads', 'verification', 'approval', 'disbursement', 'loans', 'collection', 'payments'],
  find_customer: ['loans'], customer_detail: ['loans', 'collection'], find_leads: ['leads', 'verification', 'approval'],
  collection_report: ['collection'], overdue_customers: ['collection'], disbursement_queue: ['disbursement'],
  guarantor_overview: ['collection'], notify_guarantor: ['collection'], payments_overview: ['payments'], ai_spend: ['brain'],
  search_brain: ['brain'], read_doc: ['brain'], remember: ['brain'], agent_list: ['verification'], assign_agent: ['verification'],
  return_lead: ['leads'], approve_lead: ['approval'], reject_lead: ['approval'], create_bank_files: ['disbursement'], disburse_lead: ['disbursement'], cancel_bank_file: ['disbursement'],
}
const WORDS: [RegExp, string[]][] = [
  [/collect|saturday|overdue|due|paid|guarantor|group|ഓവർ|കളക്ഷൻ/i, ['collection']],
  [/lead|new customer|applicant|ലീഡ്/i, ['leads']], [/verif|agent|visit/i, ['verification']], [/approv/i, ['approval']],
  [/disburs|bank file|payout/i, ['disbursement']], [/loan|customer|book|ലോൺ/i, ['loans']], [/screenshot|payment|utr|upi/i, ['payments']],
  [/brain|rule|remember|doc|how do we/i, ['brain']],
]
const TOOL_LABEL: Record<string, string> = { business_snapshot: 'the whole business', find_customer: 'customers', customer_detail: 'a customer', find_leads: 'leads', collection_report: 'collection', overdue_customers: 'overdue', disbursement_queue: 'disbursement', guarantor_overview: 'guarantors', payments_overview: 'payments', ai_spend: 'AI spend', search_brain: 'its notes', read_doc: 'its notes', agent_list: 'agents' }
function keysFor(a: Activity): string[] {
  const out = new Set<string>()
  for (const t of a.tools) (TOOL_KEYS[t] || []).forEach(k => out.add(k))
  if (!out.size) for (const [re, ks] of WORDS) if (re.test(a.question)) ks.forEach(k => out.add(k))
  return [...out]
}

type Path = { k: string; d: string; r: string; kind: 'in' | 'brain' | 'part'; key: string }
const curve = (x1: number, y1: number, x2: number, y2: number, vertical = false) => {
  if (vertical) { const dy = (y2 - y1) / 2; return `M${x1} ${y1} C${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}` }
  const dx = (x2 - x1) / 2; return `M${x1} ${y1} C${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
}

export default function OreoMap({ data, onOpen, onAsk, active = true, activity, loadTopic }: { data: Overview | null; onOpen: (page: string) => void; onAsk: (q: string) => void; active?: boolean; activity?: Activity; loadTopic?: (key: string) => Promise<Topic | null> }) {
  const wrap = useRef<HTMLDivElement>(null), oreo = useRef<HTMLDivElement>(null), brain = useRef<HTMLDivElement>(null)
  const nodes = useRef<Record<string, HTMLElement | null>>({})
  const [paths, setPaths] = useState<Path[]>([])
  const [picked, setPicked] = useState<string | null>(null)
  const [hideSeq, setHideSeq] = useState(-1)
  const [phase, setPhase] = useState(0)   // 1 = your question goes in, 2 = Oreo reads its notes (until the first tool runs)
  const [reduce, setReduce] = useState(false)
  const m = data?.map
  const mx = Math.max(1, m ? m.loans.active : 1)

  const parts: Part[] = useMemo(() => m ? [
    { key: 'leads', label: 'Leads', big: String(m.leads.new + m.leads.inProgress), sub: `${m.leads.new} new · ${m.leads.inProgress} being verified${m.leads.returned ? ` · ${m.leads.returned} returned` : ''}`, level: m.leads.returned ? 'info' : 'calm', page: 'leads', ask: 'How are the leads? Anything stuck?', bar: (m.leads.new + m.leads.inProgress) / mx },
    { key: 'verification', label: 'Verification', big: String(m.verification.inProgress), sub: `${m.verification.submitted} submitted, waiting for a decision`, level: m.verification.submitted ? 'attention' : 'calm', page: 'routes', ask: 'What is happening with verification and the agent visits?', bar: m.verification.inProgress / mx },
    { key: 'approval', label: 'Approval', big: String(m.approval.waiting), sub: m.approval.waiting ? 'leads waiting for you' : 'nothing waiting', level: m.approval.waiting ? 'attention' : 'calm', page: 'leads', ask: 'Which leads are waiting for approval?', bar: m.approval.waiting / mx },
    { key: 'disbursement', label: 'Disbursement', big: String(m.disbursement.waiting), sub: `approved, to be paid · ${m.disbursement.files} bank files live`, level: m.disbursement.waiting ? 'attention' : 'calm', page: 'leads', ask: 'Show the disbursement queue and what is blocking it.', bar: m.disbursement.waiting / mx },
    { key: 'loans', label: 'Loans', big: String(m.loans.active), sub: `${m.loans.customers} customers`, level: 'calm', page: 'customers', ask: 'Give me the loan book summary.', bar: 1 },
    { key: 'collection', label: 'Collection', big: inr(m.collection.dueSaturday), sub: `${m.collection.dueCount} due ${m.collection.nextSaturday.slice(5)} · ${inr(m.collection.paidWeek)} paid this week${m.collection.overdue ? ` · ${inr(m.collection.overdue)} overdue` : ''}`, level: m.collection.overdue ? 'urgent' : 'calm', page: 'collection', ask: 'How is the collection this Saturday?', bar: m.collection.dueSaturday + m.collection.paidWeek > 0 ? m.collection.paidWeek / (m.collection.dueSaturday + m.collection.paidWeek) : 0 },
    { key: 'payments', label: 'Payments', big: String(m.payments.needStaff), sub: m.payments.needStaff ? 'screenshots need staff' : 'all matched', level: m.payments.needStaff ? 'urgent' : 'calm', page: 'payments', ask: 'Which payment screenshots need staff and why?', bar: m.payments.needStaff ? 1 : 0 },
  ] : [], [m, mx])

  // what is lit, and which step of the flow we are in
  const live = !!activity && activity.seq > 0 && activity.seq !== hideSeq
  const focus = useMemo(() => {
    const out = new Set<string>()
    // the parts only light up once Oreo has finished reading its notes and starts checking the data (or the answer is done)
    if (live && activity && (activity.tools.length > 0 || !activity.busy)) keysFor(activity).forEach(k => out.add(k))
    if (picked) out.add(picked)
    return out
  }, [live, activity, picked])
  const busy = !!activity?.busy && live
  const toolsRan = (activity?.tools.length || 0) > 0
  const step: 'idle' | 'input' | 'notes' | 'data' | 'done' = !live ? 'idle' : busy ? (toolsRan ? 'data' : phase === 1 ? 'input' : 'notes') : 'done'
  const readingNotes = step === 'notes' || (busy && !!activity?.tools.some(t => t === 'search_brain' || t === 'read_doc')) || focus.has('brain')
  const dim = (focus.size > 0 && step !== 'idle') || !!picked
  const lastTool = activity?.tools[activity.tools.length - 1]
  const status = step === 'input' ? 'hearing you…' : step === 'notes' ? 'reading its notes…' : step === 'data' ? `checking ${(lastTool && TOOL_LABEL[lastTool]) || 'the data'}…` : step === 'done' ? 'answered' : 'your assistant'

  const seq = activity?.seq || 0
  useEffect(() => {
    if (seq <= 0) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhase(1); setPicked(null)
    const t = setTimeout(() => setPhase(2), 1000)
    return () => clearTimeout(t)
  }, [seq])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setReduce(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false) }, [])

  // the part Oreo is working on opens as its own page (one or two parts; the whole business stays on the overview)
  const partKeys = parts.map(p => p.key).filter(k => focus.has(k))
  const topicKey = picked && picked !== 'brain' ? picked : (step === 'data' || step === 'done') && partKeys.length > 0 && partKeys.length <= 2 ? partKeys[0] : null
  const [topic, setTopic] = useState<Topic | null>(null)
  const cache = useRef<Record<string, { t: number; v: Topic }>>({})
  useEffect(() => {
    if (!topicKey || !loadTopic) { setTopic(null); return }   // eslint-disable-line react-hooks/set-state-in-effect
    const c = cache.current[topicKey]
    if (c && Date.now() - c.t < 45_000) { setTopic(c.v); return }
    setTopic(null)
    let off = false
    loadTopic(topicKey).then(v => { if (!off && v) { cache.current[topicKey] = { t: Date.now(), v }; setTopic(v) } })
    return () => { off = true }
  }, [topicKey, loadTopic, seq])
  const detail = picked || [...focus].find(k => k !== 'brain') || (focus.has('brain') ? 'brain' : null)
  const det = !topicKey && detail && data ? buildDetail(detail, data) : null

  useLayoutEffect(() => {
    const calc = () => {
      const w = wrap.current, o = oreo.current, br = brain.current
      if (!w || !o || w.clientWidth < 640) { setPaths([]); return }
      const wb = w.getBoundingClientRect(), ob = o.getBoundingClientRect(), out: Path[] = []
      const ox = ob.left - wb.left, oy = ob.top + ob.height / 2 - wb.top
      for (const [k, el] of Object.entries(nodes.current)) {
        if (!el) continue
        const b = el.getBoundingClientRect()
        if (k.startsWith('in-')) { const x1 = b.right - wb.left, y1 = b.top + b.height / 2 - wb.top; out.push({ k, d: curve(x1, y1, ox, oy), r: curve(ox, oy, x1, y1), kind: 'in', key: k }) }
        else { const x2 = b.left - wb.left, y2 = b.top + b.height / 2 - wb.top, x1 = ob.right - wb.left; out.push({ k, d: curve(x1, oy, x2, y2), r: curve(x2, y2, x1, oy), kind: 'part', key: k }) }
      }
      if (br) { const bb = br.getBoundingClientRect(), x = bb.left + bb.width / 2 - wb.left; out.push({ k: 'brain', d: curve(x, bb.bottom - wb.top, ob.left + ob.width / 2 - wb.left, ob.top - wb.top, true), r: '', kind: 'brain', key: 'brain' }) }
      setPaths(out)
    }
    calc()
    const ro = new ResizeObserver(calc); if (wrap.current) ro.observe(wrap.current); if (oreo.current) ro.observe(oreo.current)
    window.addEventListener('resize', calc)
    return () => { ro.disconnect(); window.removeEventListener('resize', calc) }
  }, [data, det?.key, parts.length])

  const fade = `transition-all duration-500 ${topicKey ? 'pointer-events-none scale-[0.96] opacity-0' : ''}`
  const lines = paths.map(p => {
    const lit = p.kind === 'part' ? focus.has(p.key) : p.kind === 'brain' ? readingNotes : p.key === 'in-Typing' && step === 'input'
    const part = p.kind === 'part' ? parts.find(x => x.key === p.key) : null
    const color = p.kind === 'brain' ? '#6366f1' : p.kind === 'in' ? '#94a3b8' : STROKE[part?.level || 'calm']
    return { ...p, lit, color, faded: dim && !lit }
  })

  return (
    <div ref={wrap} className="relative flex h-full min-h-[560px] flex-col rounded-[1.75rem] border border-white/70 bg-white p-4 shadow-panel sm:p-5">
      <OreoStyles />
      <div className={`mb-3 flex items-center justify-between ${fade}`}>
        <p className="text-xs font-semibold uppercase tracking-wider text-soft">Your business, live</p>
        {(picked || (live && !busy && focus.size > 0)) && <button onClick={() => { setPicked(null); setHideSeq(activity?.seq ?? -1) }} className="rounded-lg border border-line bg-white px-2.5 py-1 text-[11px] font-semibold hover:bg-mist">Show everything</button>}
      </div>
      <svg className={`pointer-events-none absolute inset-0 hidden h-full w-full sm:block ${fade}`}>
        <defs><filter id="ore-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3" /></filter></defs>
        {lines.map(l => <path key={`r${l.k}`} id={`pr-${l.k}`} d={l.r || l.d} fill="none" stroke="none" />)}
        {lines.map(l => <path key={`f${l.k}`} id={`pf-${l.k}`} d={l.d} fill="none" stroke={l.lit ? l.color : '#cbd5e1'} strokeWidth={l.lit ? 2.6 : 1.5} strokeLinecap="round" opacity={l.faded ? 0.25 : l.lit ? 1 : 0.8} />)}
        {!reduce && active && lines.map((l, i) => {
          const n = l.lit ? 3 : 1, dur = l.lit ? 1.5 : 4.5 + (i % 3)
          const dots: React.ReactNode[] = []
          // calm: tiny dots drift from each source toward Oreo (data feeding it). lit: faster dots both ways, so you see Oreo asking and the data returning.
          for (let j = 0; j < n; j++) {
            const outward = l.kind === 'part' && l.lit && j % 2 === 0   // Oreo asking the part
            const ref = l.kind === 'part' ? (outward ? `#pf-${l.k}` : `#pr-${l.k}`) : `#pf-${l.k}`
            dots.push(
              <circle key={`${l.k}${j}`} r={l.lit ? 4 : 2.6} fill={outward ? '#0ea5e9' : l.color} opacity={l.faded ? 0.25 : 0.95}>
                <animateMotion dur={`${dur}s`} begin={`${-(j * dur) / n - (i * 0.37)}s`} repeatCount="indefinite"><mpath href={ref} /></animateMotion>
              </circle>
            )
          }
          return <g key={`d${l.k}`}>{l.lit && <path d={l.d} fill="none" stroke={l.color} strokeWidth={7} opacity={0.18} filter="url(#ore-glow)" />}{dots}</g>
        })}
      </svg>
      {!data ? <div className="flex flex-1 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-ink border-t-transparent" /></div> : (
        <div className={`relative grid flex-1 items-stretch gap-4 ${fade} sm:grid-cols-[96px_minmax(190px,240px)_minmax(0,1fr)] sm:gap-x-14 lg:grid-cols-[110px_minmax(200px,250px)_minmax(0,1fr)] lg:gap-x-20`}>
          <div className="hidden flex-col justify-center gap-4 sm:flex">
            {['Voice', 'Typing', 'Alerts'].map(x => (
              <div key={x} ref={el => { nodes.current[`in-${x}`] = el }} className={`rounded-xl border px-3 py-2.5 text-center text-xs font-semibold transition ${x === 'Typing' && step === 'input' ? 'border-indigo-300 bg-indigo-50 text-indigo-700 shadow-md' : 'border-line bg-mist text-soft'}`}>{x}</div>
            ))}
          </div>
          <div className="flex flex-col items-stretch justify-center gap-7">
            <div ref={brain} className={`rounded-2xl border px-4 py-3 text-center transition ${readingNotes ? 'border-indigo-300 bg-indigo-50 shadow-md' : 'border-line bg-mist'}`}>
              <div className="flex items-center justify-center gap-2">
                <svg width="22" height="22" viewBox="-14 -14 28 28" fill="none" stroke="#4f46e5" strokeWidth="1.6" strokeLinecap="round"><path d="M-9 -3 Q-9 -11 -1 -10 Q3 -14 8 -9 Q13 -6 9 -1 Q12 5 5 6 Q1 11 -4 8 Q-11 8 -9 -3Z" /><path d="M-1 -10 V8 M-8 0 H8" opacity=".55" /></svg>
                <p className="text-sm font-semibold text-indigo-700">Brain</p>
              </div>
              <p className="mt-0.5 text-[11px] text-soft">{readingNotes && busy ? 'Oreo is reading the notes…' : 'Obsidian notes · rules, how NGF works'}</p>
            </div>
            <div ref={oreo} className={`rounded-2xl bg-[#1e1b4b] p-4 text-white shadow-lg transition ${busy ? 'ring-4 ring-indigo-200' : ''}`}>
              <div className="flex items-center gap-3">
                <OreoFace size={52} state={busy ? 'thinking' : 'idle'} />
                <div><p className="text-lg font-semibold leading-tight">Oreo</p><p className="text-xs text-indigo-200">{status}</p></div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-indigo-100/90">The brain: decides what to check, reads the data, and acts when you ask.</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                <div className="rounded-lg bg-white/10 py-2"><p className="text-xl font-semibold leading-none">{data.oreo.questions}</p><p className="mt-1 text-[10px] text-indigo-100">questions</p></div>
                <div className="rounded-lg bg-white/10 py-2"><p className="text-xl font-semibold leading-none">{data.oreo.actions}</p><p className="mt-1 text-[10px] text-indigo-100">actions done</p></div>
              </div>
            </div>
            {det && (
              <div className="rounded-2xl border border-line bg-white p-3 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600">{det.title}</p>
                <p className="text-xs text-soft">{det.line}</p>
                <div key={det.key} className="mt-2 space-y-1.5">
                  {det.rows.slice(0, 5).map((r, i) => (
                    <div key={r.label} className="ore-rise" style={{ animationDelay: `${i * 90}ms` }}>
                      <div className="flex justify-between text-[11px]"><span className="truncate text-soft">{r.label}</span><span className="ml-2 shrink-0 font-semibold">{r.value}</span></div>
                      <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-black/5"><div className="h-full rounded-full transition-all duration-1000" style={{ width: `${Math.max(r.frac > 0 ? 4 : 0, Math.min(100, r.frac * 100))}%`, background: STROKE[r.level] }} /></div>
                    </div>
                  ))}
                </div>
                <div className="mt-2.5 flex gap-1.5">
                  {det.ask && <button onClick={() => onAsk(det.ask)} className="rounded-lg bg-ink px-2.5 py-1 text-[11px] font-semibold text-white">Ask Oreo</button>}
                  {det.page && <button onClick={() => onOpen(det.page)} className="rounded-lg border border-line bg-white px-2.5 py-1 text-[11px] font-semibold">Open page</button>}
                </div>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2.5">
            {parts.map(p => {
              const lit = focus.has(p.key), faded = dim && !lit
              return (
                <div key={p.key} ref={el => { nodes.current[p.key] = el }} onClick={() => { setPicked(p.key); setHideSeq(activity?.seq ?? -1) }}
                  className={`flex min-h-[64px] flex-1 cursor-pointer flex-col justify-center rounded-xl border px-3.5 py-2 transition ${RING[p.level]} ${lit ? 'scale-[1.015] shadow-md ring-2 ring-indigo-300' : ''} ${faded ? 'opacity-40' : ''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1 text-left">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-soft"><span className={`h-2 w-2 rounded-full ${DOT[p.level]} ${lit && busy ? 'animate-ping' : ''}`} />{p.label}</p>
                        <p className="text-xl font-semibold leading-none">{p.big}</p>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/5"><div className={`h-full rounded-full ${BAR[p.level]} transition-all duration-700`} style={{ width: `${p.bar > 0 ? Math.max(4, Math.min(100, p.bar * 100)) : 0}%` }} /></div>
                      <p className="mt-1 truncate text-[11px] text-soft">{p.sub}</p>
                    </div>
                    <button onClick={e => { e.stopPropagation(); onAsk(p.ask) }} title="Ask Oreo about this" className="shrink-0 rounded-lg border border-line bg-white px-2 py-1 text-[11px] font-semibold text-ink hover:bg-mist">Ask</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
      {topicKey && <TopicView key={topicKey} k={topicKey} topic={topic} part={parts.find(p => p.key === topicKey)} speaking={activity?.state === 'speaking'} busy={busy} status={status}
        onBack={() => { setPicked(null); setHideSeq(activity?.seq ?? -1) }} onOpen={onOpen} onAsk={onAsk} active={active && !reduce} />}
      <style>{`@keyframes ore-rise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}.ore-rise{animation:ore-rise .5s both}@keyframes ore-open{from{opacity:0;transform:scale(1.04)}to{opacity:1;transform:none}}.ore-open{animation:ore-open .5s both}`}</style>
    </div>
  )
}

// The page that opens for one part of the business: Oreo on the left (speaking), then the columns of how that part works, joined by lines.
function TopicView({ k, topic, part, speaking, busy, status, onBack, onOpen, onAsk, active }: { k: string; topic: Topic | null; part?: Part; speaking: boolean; busy: boolean; status: string; onBack: () => void; onOpen: (p: string) => void; onAsk: (q: string) => void; active: boolean }) {
  const box = useRef<HTMLDivElement>(null), oreo = useRef<HTMLDivElement>(null), tn = useRef<Record<string, HTMLElement | null>>({})
  const [lines, setLines] = useState<{ k: string; d: string; r: string; level: Level; core: boolean }[]>([])
  const [show, setShow] = useState(false)
  useEffect(() => { const t = setTimeout(() => setShow(true), 900); return () => clearTimeout(t) }, [])   // lines draw in after the boxes have appeared
  useLayoutEffect(() => {
    const calc = () => {
      const b = box.current, o = oreo.current
      if (!b || !o || !topic || b.clientWidth < 640) { setLines([]); return }
      const bb = b.getBoundingClientRect(), ob = o.getBoundingClientRect(), out: typeof lines = []
      const ox = ob.right - bb.left, oy = ob.top + ob.height / 2 - bb.top
      const pos = (id: string) => { const e = tn.current[id]; if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left - bb.left, r: r.right - bb.left, y: r.top + r.height / 2 - bb.top } }
      for (const n of topic.columns[0]?.nodes || []) { const p = pos(n.id); if (p) out.push({ k: `o-${n.id}`, d: curve(ox, oy, p.l, p.y), r: curve(p.l, p.y, ox, oy), level: 'calm', core: true }) }
      for (const [a, c] of topic.links) { const pa = pos(a), pc = pos(c); if (pa && pc) out.push({ k: `${a}>${c}`, d: curve(pa.r, pa.y, pc.l, pc.y), r: curve(pc.l, pc.y, pa.r, pa.y), level: 'calm', core: false }) }
      setLines(out)
    }
    calc()
    const t = setTimeout(calc, 800)
    const ro = new ResizeObserver(calc); if (box.current) ro.observe(box.current)
    return () => { clearTimeout(t); ro.disconnect() }
  }, [topic])
  const n = topic?.columns.length || 3
  return (
    <div ref={box} className="ore-open absolute inset-0 z-20 flex flex-col rounded-[1.75rem] bg-white p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="rounded-lg border border-line bg-white px-2.5 py-1 text-[11px] font-semibold hover:bg-mist">← Whole business</button>
          <div><p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">{topic?.title || part?.label || k}</p><p className="text-sm text-soft">{topic?.line || 'Oreo is opening this…'}</p></div>
        </div>
        <div className="flex gap-1.5">
          {part?.ask && <button onClick={() => onAsk(part.ask)} className="rounded-lg bg-ink px-2.5 py-1 text-[11px] font-semibold text-white">Ask Oreo</button>}
          {(topic?.page || part?.page) && <button onClick={() => onOpen(topic?.page || part!.page)} className="rounded-lg border border-line bg-white px-2.5 py-1 text-[11px] font-semibold">Open page</button>}
        </div>
      </div>
      <svg className="pointer-events-none absolute inset-0 hidden h-full w-full sm:block">
        <defs><filter id="ore-glow2" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3" /></filter></defs>
        {lines.map(l => <path key={`r${l.k}`} id={`tr-${l.k}`} d={l.r} fill="none" stroke="none" />)}
        {lines.map(l => <path key={`f${l.k}`} id={`tf-${l.k}`} d={l.d} fill="none" stroke={l.core ? '#6366f1' : '#a5b4fc'} strokeWidth={l.core ? 2.2 : 1.8} strokeLinecap="round" opacity={show ? 0.9 : 0} style={{ transition: 'opacity .8s' }} />)}
        {show && active && lines.map((l, i) => (
          <g key={`d${l.k}`}>
            {l.core && <path d={l.d} fill="none" stroke="#6366f1" strokeWidth={7} opacity={0.12} filter="url(#ore-glow2)" />}
            {[0, 1].map(j => (
              <circle key={j} r={l.core ? 3.6 : 3} fill={l.core ? '#0ea5e9' : '#6366f1'} opacity={0.95}>
                <animateMotion dur={`${l.core ? 1.6 : 2.6}s`} begin={`${-(j * 1.3) - i * 0.31}s`} repeatCount="indefinite"><mpath href={l.core ? `#tf-${l.k}` : `#tr-${l.k}`} /></animateMotion>
              </circle>
            ))}
          </g>
        ))}
      </svg>
      <div className="relative grid flex-1 items-stretch gap-4 sm:gap-x-9" style={{ gridTemplateColumns: `minmax(150px,180px) repeat(${n}, minmax(0,1fr))` }}>
        <div className="flex items-center">
          <div ref={oreo} className={`w-full rounded-2xl bg-[#1e1b4b] p-4 text-white shadow-lg ${speaking ? 'ring-4 ring-indigo-200' : ''}`}>
            <div className="flex items-center gap-3">
              <OreoFace size={52} state={speaking ? 'speaking' : busy ? 'thinking' : 'idle'} />
              <div><p className="text-lg font-semibold leading-tight">Oreo</p><p className="text-xs text-indigo-200">{speaking ? 'explaining…' : status}</p></div>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-indigo-100/90">{topic ? `Showing how ${topic.title.toLowerCase()} works right now.` : 'Opening it…'}</p>
          </div>
        </div>
        {!topic ? <div className="col-span-full flex items-center justify-center sm:col-span-3"><div className="h-6 w-6 animate-spin rounded-full border-2 border-ink border-t-transparent" /></div> : topic.columns.map((c, ci) => (
          <div key={c.title} className="flex min-w-0 flex-col justify-center gap-2.5">
            <p className="ore-rise text-[11px] font-semibold uppercase tracking-wider text-soft" style={{ animationDelay: `${ci * 220}ms` }}>{c.title}</p>
            {c.nodes.length === 0 && <p className="ore-rise rounded-xl border border-dashed border-line px-3 py-3 text-xs text-soft" style={{ animationDelay: `${ci * 220}ms` }}>Nothing here right now</p>}
            {c.nodes.map((nd, ni) => (
              <div key={nd.id} ref={el => { tn.current[nd.id] = el }} className={`ore-rise rounded-xl border px-3 py-2 ${RING[nd.level]}`} style={{ animationDelay: `${ci * 220 + ni * 90}ms` }}>
                <p className="truncate text-xs font-semibold">{nd.label}</p>
                <p className="mt-0.5 text-lg font-semibold leading-tight">{nd.value}</p>
                {nd.bar > 0 && <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-black/5"><div className={`h-full rounded-full ${BAR[nd.level]} transition-all duration-1000`} style={{ width: `${Math.max(4, nd.bar * 100)}%` }} /></div>}
                <p className="mt-0.5 text-[11px] leading-snug text-soft">{nd.sub}</p>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

type Row = { label: string; value: string; frac: number; level: Level }
function buildDetail(key: string, d: Overview): { key: string; title: string; line: string; rows: Row[]; ask: string; page: string } | null {
  const m = d.map
  const loans = Math.max(1, m.loans.active)
  const funnel = (hi: string): Row[] => [
    { label: 'New leads', value: String(m.leads.new), frac: m.leads.new / loans, level: hi === 'leads' ? 'info' : 'calm' },
    { label: 'Being verified', value: String(m.verification.inProgress), frac: m.verification.inProgress / loans, level: hi === 'verification' ? 'info' : 'calm' },
    { label: 'Waiting for approval', value: String(m.approval.waiting), frac: m.approval.waiting / loans, level: m.approval.waiting ? 'attention' : 'calm' },
    { label: 'Approved, to be paid', value: String(m.disbursement.waiting), frac: m.disbursement.waiting / loans, level: m.disbursement.waiting ? 'attention' : 'calm' },
    { label: 'Active loans', value: String(m.loans.active), frac: 1, level: 'calm' },
  ]
  if (key === 'leads' || key === 'verification' || key === 'approval' || key === 'disbursement') {
    const t = { leads: 'Leads', verification: 'Verification', approval: 'Approval', disbursement: 'Disbursement' }[key]!
    const line = key === 'disbursement' ? `${m.disbursement.waiting} approved, ${m.disbursement.files} bank files live` : key === 'approval' ? (m.approval.waiting ? `${m.approval.waiting} waiting for you` : 'Nothing waiting for you') : key === 'verification' ? `${m.verification.submitted} submitted for a decision` : `${m.leads.returned} returned to guarantors`
    return { key, title: `${t} · leads to loans`, line, rows: funnel(key), ask: { leads: 'How are the leads? Anything stuck?', verification: 'What is happening with verification and the agent visits?', approval: 'Which leads are waiting for approval?', disbursement: 'Show the disbursement queue and what is blocking it.' }[key]!, page: key === 'verification' ? 'routes' : 'leads' }
  }
  if (key === 'loans') return { key, title: 'Loans', line: `${m.loans.customers} customers, ${m.loans.active} active loans`, rows: [{ label: 'Active loans', value: String(m.loans.active), frac: 1, level: 'calm' }, { label: 'Customers', value: String(m.loans.customers), frac: 1, level: 'info' }], ask: 'Give me the loan book summary.', page: 'customers' }
  if (key === 'collection') {
    const tot = Math.max(1, m.collection.dueSaturday + m.collection.paidWeek + m.collection.overdue)
    const gr = (d.groups || []).slice(0, 3).map(g => ({ label: `${g.code} · ${g.loans} loans`, value: g.overdue ? `${inr(g.overdue)} overdue` : 'on time', frac: g.overdue / Math.max(1, m.collection.overdue), level: (g.overdue ? 'attention' : 'calm') as Level }))
    return { key, title: 'Collection', line: `${m.collection.dueCount} due ${m.collection.nextSaturday.slice(5)}`, rows: [
      { label: `Due ${m.collection.nextSaturday.slice(5)}`, value: inr(m.collection.dueSaturday), frac: m.collection.dueSaturday / tot, level: 'info' },
      { label: 'Paid this week', value: inr(m.collection.paidWeek), frac: m.collection.paidWeek / tot, level: 'calm' },
      { label: 'Overdue', value: inr(m.collection.overdue), frac: m.collection.overdue / tot, level: m.collection.overdue ? 'urgent' : 'calm' }, ...gr,
    ], ask: 'How is the collection this Saturday?', page: 'collection' }
  }
  if (key === 'payments') return { key, title: 'Payments', line: m.payments.needStaff ? `${m.payments.needStaff} screenshots need staff` : 'All payment screenshots are matched', rows: [{ label: 'Need staff', value: String(m.payments.needStaff), frac: m.payments.needStaff ? 1 : 0, level: m.payments.needStaff ? 'urgent' : 'calm' }], ask: 'Which payment screenshots need staff and why?', page: 'payments' }
  if (key === 'brain') return { key, title: 'Brain', line: "Oreo's rules, facts and the NGF notes", rows: [{ label: 'Spent today', value: `$${d.oreo.spentTodayUsd.toFixed(3)}`, frac: d.oreo.spentTodayUsd / d.oreo.dailyCapUsd, level: 'info' }, { label: 'Questions answered', value: String(d.oreo.questions), frac: Math.min(1, d.oreo.questions / 50), level: 'calm' }, { label: 'Actions done', value: String(d.oreo.actions), frac: Math.min(1, d.oreo.actions / 20), level: 'calm' }], ask: 'What is in your brain? Show me the rules you follow.', page: 'brain' }
  return null
}
