'use client'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Session } from '@/types'

type Stats = { collectionDay: string; due: number; recorded: number; remaining: number; wrongUsed: number; wrongAllowed: number; wrongLeft: number; manualMode: boolean }
type Me = {
  today: string; saturday: string
  access: { canMark: boolean; canChat: boolean; canHistory: boolean; canBank: boolean; canOverride: boolean; isGuarantor: boolean; isAdmin: boolean; guarantorId: string }
  guarantors: { guarantorId: string; name: string; code: string }[]
}
type Line = { repaymentId: string; customerId: string; name: string; payCode: string; amount: number }
type Msg = {
  messageId: string; guarantorId: string; kind: 'slip' | 'note'; mode: string; status: string; problem: string; lines: Line[]; note: string
  utr: string; amountRead: number | null; txnDate: string; txnTime: string; payee: string; payApp: string; imageUrl: string
  createdByName: string; createdBy: string; createdAt: string; needsFix: boolean; manual: boolean; reader: string; readMs: number; costUsd: number; earlier: Earlier[]
}
type Earlier = { messageId: string; at: string; status: string; problem: string; utr: string; amountRead: number | null; txnDate: string; txnTime: string; imageUrl: string; reader: string; readMs: number; costUsd: number; payApp: string }
type SheetRow = { repaymentId: string; customerId: string; name: string; phone: string; payCode: string; weekNo: number | null; dueDate: string; amount: number; status: string; overdue: boolean; payment: unknown | null }
type Settings = { enabled: boolean; dailyCap: number; guarantorCap: number; payee: string; keyPresent: boolean; model: string; provider: string; keys: { claude: boolean; openrouter: boolean; nvidia: boolean }; nvidiaModel: string; openrouterModel: string }
type TestResult = { ok: boolean; provider: string; model: string; ms: number; reading: Record<string, unknown> | null; inTokens: number; outTokens: number; costUsd: number; error: string }
type Recent = { id: string; at: string; guarantor: string; status: string; utr: string; amount: number | null; reader: string; ms: number; usd: number; customers: string }
type Usage = { today: { reads: number; usd: number }; week: { reads: number; usd: number }; month: { reads: number; usd: number }; recent?: Recent[] }

const money = (n: number) => `₹${Number(n).toLocaleString('en-IN')}`
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
const INR_PER_USD = 88

async function api(session: Session, path: string, body?: unknown) {
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${session.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({ success: false, error: 'Unexpected server response' }))
  if (!json.success) throw new Error(json.error || 'Something went wrong')
  return json.data
}

// Shrink a phone photo before sending: long side 1600 px, JPEG. Smaller upload, same readable text.
async function prepareImage(file: File): Promise<{ mimeType: string; base64Data: string; preview: string }> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  const dataUrl = c.toDataURL('image/jpeg', 0.88)
  return { mimeType: 'image/jpeg', base64Data: dataUrl.split(',')[1], preview: dataUrl }
}

const TONE: Record<string, string> = {
  Recorded: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  'Pending Staff': 'bg-amber-50 text-amber-700 ring-amber-200',
  'Needs Retake': 'bg-red-50 text-red-700 ring-red-200', Duplicate: 'bg-red-50 text-red-700 ring-red-200', 'Amount Mismatch': 'bg-red-50 text-red-700 ring-red-200',
  'Wrong Payee': 'bg-red-50 text-red-700 ring-red-200', 'Not Successful': 'bg-red-50 text-red-700 ring-red-200', Resubmit: 'bg-red-50 text-red-700 ring-red-200',
}
const LABEL: Record<string, string> = { Recorded: 'Recorded ✓', 'Pending Staff': 'With the office', 'Needs Retake': 'Send a clearer screenshot', Duplicate: 'Already used', 'Amount Mismatch': 'Amount does not match', 'Wrong Payee': 'Wrong receiver', 'Not Successful': 'Payment not successful', Resubmit: 'Send again (office asked)', Cancelled: 'Cancelled by the office' }

function StatsStrip({ stats, onOpenHistory }: { stats: Stats; onOpenHistory?: () => void }) {
  const pct = stats.due ? Math.round(stats.recorded / stats.due * 100) : 0
  const day = new Date(`${stats.collectionDay}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' })
  const tone = stats.manualMode ? 'bg-red-500/20 text-red-100 ring-red-300/30' : stats.wrongLeft <= 3 ? 'bg-amber-400/20 text-amber-100 ring-amber-300/30' : 'bg-white/10 text-white/80 ring-white/15'
  return (
    <div className="relative overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-[#14142b] via-[#1f1d4d] to-[#35286e] p-4 text-white">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/55">Collection Saturday {day}</p>
          <p className="mt-1 text-3xl font-extrabold leading-none">{stats.recorded}<span className="text-xl font-bold text-white/45"> / {stats.due}</span></p>
          <p className="mt-1 text-xs text-white/65">{stats.due === 0 ? 'No collections due that day' : `recorded · ${stats.remaining} remaining`}</p>
        </div>
        {onOpenHistory && <button onClick={onOpenHistory} className="shrink-0 rounded-full bg-white/10 px-3.5 py-2 text-xs font-semibold ring-1 ring-white/20 hover:bg-white/20">Payment history →</button>}
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-lime-300 transition-all" style={{ width: `${pct}%` }} /></div>
      <p className={`mt-3 inline-flex rounded-full px-3 py-1 text-[11px] font-semibold ring-1 ${tone}`}>
        {stats.manualMode ? `All ${stats.wrongAllowed} wrong tries used. Type the transaction ID with each screenshot` : `Wrong screenshots left: ${stats.wrongLeft} of ${stats.wrongAllowed}`}
      </p>
    </div>
  )
}

function Thumb({ session, url, compact }: { session: Session; url: string; compact?: boolean }) {
  const [src, setSrc] = useState('')
  const [big, setBig] = useState(false)
  useEffect(() => {
    if (!url) return
    let dead = false, obj = ''
    const fid = url.match(/[?&]id=([^&]+)/)?.[1]
    fetch(fid ? `/api/drive/${fid}` : url, { headers: { Authorization: `Bearer ${session.token}` } }).then(r => { if (!r.ok) throw new Error(); return r.blob() })
      .then(b => { obj = URL.createObjectURL(b); if (!dead) setSrc(obj) }).catch(() => { if (!dead) setSrc('error') })
    return () => { dead = true; if (obj) URL.revokeObjectURL(obj) }
  }, [url, session.token])
  if (!url) return null
  if (src === 'error') return <p className="text-xs text-red-600">Could not load the picture</p>
  if (!src) return <div className={`h-40 animate-pulse rounded-xl bg-black/10 ${compact ? 'w-full' : 'w-28'}`} />
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="Payment screenshot" onClick={() => setBig(true)} className={compact ? 'max-h-48 w-full cursor-zoom-in rounded-lg border border-black/10 bg-white object-contain' : 'max-h-56 w-auto cursor-zoom-in rounded-xl border border-line object-contain'} />
      {big && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4" onClick={() => setBig(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="Payment screenshot" className="max-h-full max-w-full rounded-xl" />
        </div>
      )}
    </>
  )
}

// "openrouter:anthropic/claude-haiku-5.5" -> "Claude via OpenRouter · anthropic/claude-haiku-5.5"
function readerName(reader: string) {
  if (!reader) return ''
  const [prov, ...rest] = reader.split(':')
  const model = rest.join(':')
  const who = prov === 'openrouter' ? 'Claude via OpenRouter' : prov === 'claude' ? 'Claude (own key)' : prov === 'nvidia' ? 'NVIDIA' : prov
  return model ? `${who} · ${model}` : who
}
const secs = (ms: number) => (ms ? ` · ${(ms / 1000).toFixed(1)} s` : '')

// Who read this payment (office view only): the AI reader and how long it took, or that no AI was used
function ReadBy({ m, admin }: { m: Msg; admin: boolean }) {
  const cash = m.payApp === 'Cash'
  const txt = m.reader
    ? `Read by ${readerName(m.reader)}${secs(m.readMs)}${admin && m.costUsd ? ` · about ₹${(m.costUsd * INR_PER_USD).toFixed(2)}` : ''}`
    : cash ? 'Cash: no screenshot to read' : m.manual ? 'Transaction ID typed by the guarantor (not read by AI)' : m.status === 'Recorded' ? 'Confirmed by the office (not read by AI)' : ''
  if (!txt) return null
  return <p className={`rounded-lg px-2 py-1 text-[11px] font-medium ${m.reader ? 'bg-indigo-50 text-indigo-800' : 'bg-gray-100 text-gray-600'}`}>{txt}</p>
}

// Earlier tries of this message: what was sent before, so staff can compare it with the current screenshot
function EarlierList({ m, session, showReader, wa }: { m: Msg; session: Session; showReader: boolean; wa?: boolean }) {
  const [open, setOpen] = useState(false)
  if (!m.earlier.length) return null
  const n = m.earlier.length + 1
  return (
    <div className={wa ? 'mt-1.5' : ''}>
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between rounded-lg bg-violet-50 px-2.5 py-1.5 text-left text-xs font-semibold text-violet-800">
        <span>Sent again · this is try {n} · {open ? 'hide' : 'see'} earlier {m.earlier.length === 1 ? 'try' : 'tries'}</span><span>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-1.5 space-y-2">
          {m.earlier.map((e, i) => (
            <div key={e.messageId} className="flex gap-2.5 rounded-lg border border-violet-100 bg-white p-2">
              {e.imageUrl && <div className="w-20 shrink-0"><Thumb session={session} url={e.imageUrl} compact /></div>}
              <div className="min-w-0 flex-1 space-y-0.5 text-[11px] leading-snug text-[#54656f]">
                <p className="font-bold text-ink">Try {i + 1} · {when(e.at)}</p>
                <p><b>{LABEL[e.status] || e.status || 'Sent'}</b></p>
                {e.amountRead != null && <p>Amount <b className="text-ink">{money(e.amountRead)}</b></p>}
                {e.utr && <p>UTR <b className="break-all font-mono text-ink">{e.utr}</b></p>}
                {(e.txnDate || e.payApp) && <p>{txnWhen(e.txnDate, e.txnTime)}{e.payApp ? ` · ${e.payApp}` : ''}</p>}
                {e.problem && <p className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-800">{e.problem}</p>}
                {showReader && e.reader && <p className="text-indigo-800">Read by {readerName(e.reader)}{secs(e.readMs)}</p>}
              </div>
            </div>
          ))}
          {m.utr && m.earlier.some(e => e.utr && e.utr !== m.utr) && <p className="rounded-lg bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-800">The transaction ID is different now: <b className="font-mono">{m.utr}</b></p>}
        </div>
      )}
    </div>
  )
}

function Bubble({ m, session, me, onFix, onApprove, onResubmit, busy }: { m: Msg; session: Session; me: Me; onFix: (m: Msg, mode: 'image' | 'customer') => void; onApprove: (m: Msg, utr: string) => void; onResubmit: (m: Msg, reason: string) => Promise<boolean>; busy: boolean }) {
  const mine = m.createdBy === session.userId
  const [utr, setUtr] = useState(m.utr)
  const [askOpen, setAskOpen] = useState(false)
  const [reason, setReason] = useState('')
  const staffView = !me.access.isGuarantor
  if (m.kind === 'note') {
    return (
      <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
        <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${mine ? 'bg-ink text-white' : 'bg-white ring-1 ring-black/5'}`}>
          <p className={`text-[10px] font-semibold ${mine ? 'text-white/60' : 'text-soft'}`}>{m.createdByName} · {when(m.createdAt)}</p>
          <p className="mt-0.5 whitespace-pre-wrap">{m.note}</p>
        </div>
      </div>
    )
  }
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className="w-full max-w-[92%] space-y-2 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-black/5 sm:max-w-md">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold text-soft">{m.createdByName} · {when(m.createdAt)} · {m.mode === 'multi' ? 'Multi payment' : 'Single payment'}</p>
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ${TONE[m.status] || 'bg-gray-50 text-gray-600 ring-gray-200'}`}>{LABEL[m.status] || m.status}</span>
        </div>
        <Thumb session={session} url={m.imageUrl} />
        <div className="space-y-1">
          {m.lines.map(l => (
            <div key={l.repaymentId} className="flex items-center justify-between gap-2 rounded-xl bg-mist px-3 py-1.5 text-sm">
              <span><b className="font-mono">{l.payCode}</b> · {l.name}</span><span className="font-semibold">{money(l.amount)}</span>
            </div>
          ))}
        </div>
        {(m.utr || m.amountRead != null) && (
          <p className="text-xs text-soft">
            {m.manual ? 'Typed by the guarantor' : m.amountRead != null ? 'Read from screenshot' : 'Confirmed by the office'}: {m.amountRead != null && <b className="text-ink">{money(m.amountRead)}</b>}{m.utr && <> · UTR <b className="font-mono text-ink">{m.utr}</b></>}{m.txnDate && <> · {m.txnDate}{m.txnTime ? ` ${m.txnTime}` : ''}</>}{m.payApp && <> · {m.payApp}</>}
          </p>
        )}
        {me.access.isAdmin && <ReadBy m={m} admin />}
        {m.problem && <p className={`rounded-xl px-3 py-2 text-sm ${m.needsFix ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}>{m.problem}</p>}
        <EarlierList m={m} session={session} showReader={me.access.isAdmin} />
        {m.needsFix && mine && (
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => onFix(m, 'image')} className="rounded-xl bg-ink px-3 py-2 text-xs font-semibold text-white">Send a new screenshot</button>
            <button onClick={() => onFix(m, 'customer')} className="rounded-xl border border-line px-3 py-2 text-xs font-semibold">Change customer</button>
          </div>
        )}
        {m.status === 'Pending Staff' && staffView && me.access.canChat && (
          <div className="flex gap-2">
            <input value={utr} onChange={e => setUtr(e.target.value)} placeholder="Transaction ID from the screenshot" className="min-w-0 flex-1 rounded-xl border border-line px-3 py-2 text-xs font-mono" />
            <button disabled={busy || !utr.trim()} onClick={() => onApprove(m, utr)} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Record</button>
          </div>
        )}
        {m.status === 'Pending Staff' && staffView && me.access.canChat && (
          <button onClick={() => onFix(m, 'image')} className="w-full rounded-xl border border-line px-3 py-2 text-xs font-semibold">Resubmit screenshot</button>
        )}
        {staffView && me.access.canChat && me.access.canMark && !m.needsFix && m.status !== 'Cancelled' && m.status !== 'Processing' && (
          askOpen ? (
            <div className="space-y-2 rounded-xl bg-red-50 p-2.5">
              <p className="text-xs font-semibold text-red-800">Ask the guarantor to send this payment again{m.status === 'Recorded' ? '. The recorded payment will be UNDONE (the customer goes back to unpaid)' : ''}.</p>
              <input data-no-upper value={reason} onChange={e => setReason(e.target.value)} maxLength={300} placeholder="What is wrong? The guarantor will read this" className="w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-xs" />
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => { setAskOpen(false); setReason('') }} className="rounded-lg border border-line bg-white px-3 py-2 text-xs font-semibold">Cancel</button>
                <button disabled={busy || reason.trim().length < 5} onClick={async () => { if (await onResubmit(m, reason)) { setAskOpen(false); setReason('') } }} className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">{m.status === 'Recorded' ? 'Undo and ask again' : 'Ask to send again'}</button>
              </div>
            </div>
          ) : <button onClick={() => setAskOpen(true)} className="w-full rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-700">Ask to send again</button>
        )}
      </div>
    </div>
  )
}

// Weeks run Monday to Sunday (India time)
const addDays = (d: string, n: number) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10) }
const mondayOf = (d: string) => addDays(d, -((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7))
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
// "2026-10-31" + "09:05" -> "31 Oct 2026 · 9:05 am"
function txnWhen(date: string, time: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '')
  const d = m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : ''
  const t = /^(\d{2}):(\d{2})$/.exec(time || '')
  const tt = t ? `${Number(t[1]) % 12 || 12}:${t[2]} ${Number(t[1]) < 12 ? 'am' : 'pm'}` : ''
  return [d, tt].filter(Boolean).join(' · ')
}
const dayMonth = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`
const weekRange = (monday: string) => `${dayMonth(monday)} – ${dayMonth(addDays(monday, 6))}`
const istDay = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase()
function dayLabel(iso: string) {
  const d = istDay(iso)
  if (d === istDay(new Date().toISOString())) return 'Today'
  if (d === istDay(new Date(Date.now() - 864e5).toISOString())) return 'Yesterday'
  return new Date(iso).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })
}

// The guarantor's chat bubble (WhatsApp style). The guarantor's own messages are green and on the right; the office's are white on the left.
function WaBubble({ m, session, onFix }: { m: Msg; session: Session; onFix: (m: Msg, mode: 'image' | 'customer') => void }) {
  const mine = m.createdBy === session.userId
  const shape = mine ? 'rounded-tr-none bg-[#d9fdd3]' : 'rounded-tl-none bg-white'
  const tick = m.status === 'Recorded' ? <span className="text-[#53bdeb]">✓✓</span> : m.needsFix ? <span className="font-bold text-red-500">!</span> : <span className="text-gray-400">✓</span>
  const time = <span className="ml-2 inline-flex shrink-0 items-center gap-1 self-end text-[11px] text-[#667781]">{clock(m.createdAt)}{mine && tick}</span>
  const box = `relative max-w-[86%] rounded-lg px-2 py-1.5 shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] sm:max-w-sm ${shape}`
  if (m.kind === 'note') {
    return (
      <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
        <div className={box}>
          {!mine && <p className="text-xs font-semibold text-[#1f7aec]">{m.createdByName}</p>}
          <p className="flex flex-wrap items-end whitespace-pre-wrap text-[15px] leading-snug text-[#111b21]"><span className="min-w-0 break-words">{m.note}</span>{time}</p>
        </div>
      </div>
    )
  }
  const ok = m.status === 'Recorded'
  const total = m.lines.reduce((t, l) => t + l.amount, 0)
  const when2 = txnWhen(m.txnDate, m.txnTime)
  const cash = m.payApp === 'Cash'
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`${box.replace('max-w-[86%]', 'max-w-[94%]').replace('sm:max-w-sm', 'sm:max-w-md')} w-full`}>
        {!mine && <p className="px-1 text-xs font-semibold text-[#1f7aec]">{m.createdByName}</p>}
        <div className="flex gap-2.5">
          {m.imageUrl && <div className="w-[7.5rem] shrink-0"><Thumb session={session} url={m.imageUrl} compact /></div>}
          <div className="min-w-0 flex-1 space-y-1.5 py-0.5 pr-1">
            {m.lines.map(l => (
              <div key={l.repaymentId} className="leading-tight">
                <p className="font-mono text-lg font-extrabold text-[#111b21]">{l.payCode}</p>
                <p className="truncate text-[13px] font-semibold text-[#111b21]">{l.name}</p>
                {m.lines.length > 1 && <p className="text-xs font-semibold text-[#54656f]">{money(l.amount)}</p>}
              </div>
            ))}
            <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${cash ? 'bg-[#2563eb]/15 text-[#1e40af]' : ok ? 'bg-emerald-600/15 text-emerald-800' : m.needsFix ? 'bg-red-500/15 text-red-700' : 'bg-amber-500/20 text-amber-800'}`}>{cash ? 'Cash received ✓' : LABEL[m.status] || m.status}</span>
            <p className="text-xl font-extrabold leading-none text-[#111b21]">{money(m.amountRead ?? total)}{ok && !cash && m.amountRead != null && <span className="ml-1.5 text-[11px] font-semibold text-[#667781]">received</span>}</p>
            {m.utr && <p className="text-[11px] leading-snug text-[#667781]">UTR<br /><b className="break-all font-mono text-[13px] text-[#111b21]">{m.utr}</b></p>}
            {(when2 || m.payApp) && <p className="text-[11px] leading-snug text-[#667781]">{when2}{when2 && m.payApp ? <br /> : null}{m.payApp && (cash ? <>paid in <b className="text-[#111b21]">cash</b></> : <>via <b className="text-[#111b21]">{m.payApp}</b></>)}</p>}
          </div>
        </div>
        {m.problem && <p className={`mt-1.5 rounded-md px-2 py-1 text-xs ${m.needsFix ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}>{m.problem}</p>}
        <EarlierList m={m} session={session} showReader={false} wa />
        {m.needsFix && (mine || m.status === 'Resubmit') && (
          <div className="grid grid-cols-2 gap-1.5 pt-1.5">
            <button onClick={() => onFix(m, 'image')} className="rounded-md bg-[#075e54] px-2 py-1.5 text-xs font-semibold text-white">Send a new screenshot</button>
            <button onClick={() => onFix(m, 'customer')} className="rounded-md bg-white px-2 py-1.5 text-xs font-semibold text-[#075e54] ring-1 ring-[#075e54]/30">Change customer</button>
          </div>
        )}
        <p className="flex justify-end pt-0.5">{time}</p>
      </div>
    </div>
  )
}

export default function PaymentChatPage({ session, onOpenHistory }: { session: Session; onOpenHistory?: () => void }) {
  const [me, setMe] = useState<Me | null>(null)
  const [gid, setGid] = useState('')
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [openIssue, setOpenIssue] = useState(false)
  const [issues, setIssues] = useState<Msg[]>([])   // everything that still needs fixing, any week: shown as a pop-up to the guarantor
  const [resubmits, setResubmits] = useState<Msg[]>([])   // payments the office asked to send again (any week)
  const [stats, setStats] = useState<Stats | null>(null)
  const [weekStats, setWeekStats] = useState<Stats | null>(null)
  const [openIssueWeek, setOpenIssueWeek] = useState('')
  const curMonday = mondayOf(new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10))
  const [weekStart, setWeekStart] = useState(curMonday)
  const [manualUtr, setManualUtr] = useState('')
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState(false)
  const [text, setText] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const inFlight = useRef(false)
  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(''), 4000) }

  // composer
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'single' | 'multi' | 'cash'>('single')
  const [confirmCash, setConfirmCash] = useState(false)
  const isCash = mode === 'cash'
  const multi = mode !== 'single'   // multi and cash both take several customers
  const [fixId, setFixId] = useState('')
  const [fixKind, setFixKind] = useState<'image' | 'customer' | ''>('')
  const [sheet, setSheet] = useState<SheetRow[]>([])
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<SheetRow[]>([])
  const [img, setImg] = useState<{ mimeType: string; base64Data: string; preview: string } | null>(null)
  const [sending, setSending] = useState(false)

  const isG = !!me?.access.isGuarantor
  const activeGid = isG ? me!.access.guarantorId : gid

  useEffect(() => { api(session, '/api/payments?view=me').then(setMe).catch(e => setError(e.message)) }, [session])

  const load = useCallback(async () => {
    if (!me || inFlight.current) return
    inFlight.current = true
    try {
      const wk = weekStart ? `&weekStart=${weekStart}` : ''   // staff can also choose 'All recent' (empty)
      const d = await api(session, `/api/payment-chat?view=messages&guarantorId=${encodeURIComponent(gid)}${wk}`)
      setMsgs(d.messages); setResubmits(d.resubmits || []); setIssues(d.issues || []); setOpenIssue(d.openIssue); setOpenIssueWeek(d.openIssueWeek || ''); setStats(d.stats || null); setWeekStats(d.weekStats || null); setError('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load') }
    inFlight.current = false
  }, [session, me, gid, weekStart])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) load() }, 8000)
    return () => clearInterval(t)
  }, [load])
  // New messages scroll to the bottom; while the office has asked for something to be sent again, the top (the important card) is shown first
  useEffect(() => { if (resubmits.length) endRef.current?.parentElement?.scrollTo({ top: 0 }); else endRef.current?.scrollIntoView({ block: 'end' }) }, [msgs.length, resubmits.length])

  async function loadSheet(g: string) {
    try { const d = await api(session, `/api/payments?view=collect&guarantorId=${encodeURIComponent(g)}`); setSheet(d.rows) } catch (e) { flash(e instanceof Error ? e.message : 'Could not load customers') }
  }
  function startNew(m: 'single' | 'multi' | 'cash') {
    setMode(m); setConfirmCash(false); setFixId(''); setFixKind(''); setPicked([]); setImg(null); setQ(''); setManualUtr(''); setOpen(true)
    if (activeGid) loadSheet(activeGid)
  }
  function startFix(msg: Msg, kind: 'image' | 'customer') {
    setMode(msg.mode === 'multi' ? 'multi' : 'single'); setFixId(msg.messageId); setFixKind(kind); setImg(null); setQ(''); setManualUtr(''); setOpen(true)
    setPicked(msg.lines.map(l => ({ repaymentId: l.repaymentId, customerId: l.customerId, name: l.name, phone: '', payCode: l.payCode, weekNo: null, dueDate: '', amount: l.amount, status: 'Pending', overdue: false, payment: null })))
    loadSheet(msg.guarantorId)
  }

  const results = useMemo(() => {
    const s = q.trim().toLowerCase()
    const chosen = new Set(picked.map(p => p.repaymentId))
    return sheet.filter(r => r.status !== 'Paid' && !r.payment && !chosen.has(r.repaymentId)
      && (!s || r.payCode.includes(s) || r.name.toLowerCase().includes(s) || (r.phone || '').includes(s))).slice(0, 12)
  }, [sheet, q, picked])
  const total = picked.reduce((s, p) => s + p.amount, 0)

  function pick(r: SheetRow) { setPicked(mode === 'single' ? [r] : [...picked, r]); setQ(''); setConfirmCash(false) }

  async function onFile(f: File | undefined) {
    if (!f) return
    try { setImg(await prepareImage(f)) } catch { flash('Could not open that picture') }
  }

  async function send() {
    if (sending || !picked.length) return
    if (isCash) {
      // Cash is recorded straight away, so ask once more before it is saved
      if (!confirmCash) { setConfirmCash(true); return }
      setSending(true)
      try {
        await api(session, '/api/payment-chat', { action: 'cash', guarantorId: activeGid, repaymentIds: picked.map(p => p.repaymentId) })
        setOpen(false); setConfirmCash(false); setWeekStart(curMonday); await load(); flash('Cash recorded ✓')
      } catch (e) { flash(e instanceof Error ? e.message : 'Failed to record'); setConfirmCash(false) }
      setSending(false)
      return
    }
    if (!img && fixKind !== 'customer') { flash('Add the payment screenshot'); return }
    setSending(true)
    try {
      const d = await api(session, '/api/payment-chat', {
        action: 'submit', guarantorId: activeGid, mode, repaymentIds: picked.map(p => p.repaymentId), messageId: fixId || undefined,
        image: img ? { mimeType: img.mimeType, base64Data: img.base64Data } : undefined, manualUtr: stats?.manualMode ? manualUtr : undefined,
      })
      setOpen(false); setWeekStart(curMonday); await load()
      flash(d.message.status === 'Recorded' ? 'Payment recorded ✓' : d.message.problem || 'Sent'); setManualUtr('')
    } catch (e) { flash(e instanceof Error ? e.message : 'Failed to send') }
    setSending(false)
  }

  async function approve(m: Msg, utr: string) {
    setBusy(true)
    try { await api(session, '/api/payment-chat', { action: 'approve', messageId: m.messageId, utr }); await load(); flash('Recorded ✓') }
    catch (e) { flash(e instanceof Error ? e.message : 'Failed') }
    setBusy(false)
  }
  async function resubmit(m: Msg, reason: string): Promise<boolean> {
    setBusy(true)
    try { await api(session, '/api/payment-chat', { action: 'resubmit', messageId: m.messageId, reason }); await load(); flash('The guarantor has been asked to send it again'); setBusy(false); return true }
    catch (e) { flash(e instanceof Error ? e.message : 'Failed'); setBusy(false); return false }
  }
  async function sendNote() {
    if (!text.trim() || !activeGid) return
    try { await api(session, '/api/payment-chat', { action: 'note', guarantorId: activeGid, text }); setText(''); await load() }
    catch (e) { flash(e instanceof Error ? e.message : 'Failed') }
  }

  const sheetEl = (
    <>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={() => !sending && setOpen(false)}>
          <div className="max-h-[92dvh] w-full max-w-lg space-y-3 overflow-y-auto rounded-t-[1.75rem] bg-white p-5 shadow-panel sm:rounded-[1.75rem]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="text-lg font-bold text-[#111b21]">{fixId ? 'Fix this payment' : isCash ? 'Cash payment' : mode === 'multi' ? 'Multi payment' : 'Single payment'}</p>
              <button disabled={sending} onClick={() => setOpen(false)} className="rounded-full bg-mist px-3.5 py-1.5 text-sm font-semibold text-soft">Close</button>
            </div>

            {/* 1. Customer: results appear only after the person types something */}
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-[#075e54]">1 · {multi ? 'Customers (add each one)' : 'Customer'}</p>
              {fixKind !== 'image' && (multi || !picked.length) && (
                <>
                  <input autoFocus value={q} onChange={e => setQ(e.target.value)} inputMode="search" placeholder={multi && picked.length ? 'Add another customer: 4-digit ID or name' : 'Type the 4-digit ID or name'} className="w-full rounded-2xl border border-line bg-mist px-4 py-3 text-[15px] outline-none focus:border-[#00a884] focus:bg-white" />
                  {q.trim() && results.length > 0 && (
                    <div className="max-h-52 overflow-y-auto rounded-2xl border border-line">
                      {results.map(r => (
                        <button key={r.repaymentId} onClick={() => pick(r)} className="flex w-full items-center justify-between gap-2 border-b border-line px-4 py-2.5 text-left text-sm last:border-0 hover:bg-mist">
                          <span><b className="font-mono">{r.payCode}</b> · {r.name}<span className="ml-1 text-xs text-soft">{r.weekNo ? `week ${r.weekNo}` : ''}{r.dueDate ? ` · due ${r.dueDate.slice(5).split('-').reverse().join('/')}` : ''}</span>{r.overdue && <span className="ml-1 text-xs text-red-600">overdue</span>}</span>
                          <span className="font-semibold">{money(r.amount)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {q.trim() && results.length === 0 && <p className="text-xs text-soft">No unpaid customer found for that.</p>}
                </>
              )}
              {picked.map(p => (
                <div key={p.repaymentId} className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-3 ring-1 ring-emerald-300">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                  </span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <b className="block font-mono text-lg">{p.payCode}</b>
                    <span className="block truncate text-sm font-semibold text-[#111b21]">{p.name}</span>
                  </span>
                  <b className="shrink-0 text-base">{money(p.amount)}</b>
                  {fixKind !== 'image' && (
                    <button onClick={() => { setPicked(picked.filter(x => x.repaymentId !== p.repaymentId)); setConfirmCash(false) }} className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-red-600 ring-1 ring-red-200">{multi ? 'Remove' : 'Change'}</button>
                  )}
                </div>
              ))}
              {picked.length > 0 && (
                <div className="flex items-center justify-between rounded-2xl bg-[#075e54] px-4 py-3 text-white">
                  <span className="text-sm font-medium text-white/85">{isCash ? 'Cash received' : mode === 'multi' ? 'Total to match' : 'Amount to pay'}</span>
                  <span className="text-2xl font-extrabold">{money(total)}</span>
                </div>
              )}
              {mode === 'multi' && picked.length > 0 && fixKind !== 'image' && <p className="text-xs text-soft">The screenshot amount must equal the total.</p>}
              {isCash && picked.length > 0 && <p className="text-xs text-soft">Add every customer you collected cash from. No screenshot is needed.</p>}
            </div>

            {/* 2. Screenshot */}
            {picked.length > 0 && fixKind !== 'customer' && !isCash && (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-[#075e54]">2 · Payment screenshot</p>
                <label className="block cursor-pointer">
                  {img ? (
                    <span className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-2.5 ring-1 ring-emerald-300">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.preview} alt="Selected screenshot" className="h-24 w-16 shrink-0 rounded-lg border border-line bg-white object-cover object-top" />
                      <span className="min-w-0 flex-1 leading-tight"><b className="block text-sm text-emerald-800">Screenshot added ✓</b><span className="text-xs text-soft">Check it is the right payment</span></span>
                      <span className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#075e54] ring-1 ring-[#075e54]/30">Change</span>
                    </span>
                  ) : (
                    <span className="flex flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed border-[#00a884]/50 bg-emerald-50/60 px-4 py-6 text-center">
                      <svg viewBox="0 0 24 24" className="h-8 w-8 text-[#00a884]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="1.8" /><path d="M21 16l-5-5-8 9" /></svg>
                      <b className="text-sm text-[#075e54]">Tap to add the payment screenshot</b>
                      <span className="text-xs text-soft">The success screen of Google Pay, PhonePe or Paytm</span>
                    </span>
                  )}
                  <input type="file" accept="image/*" className="hidden" onChange={e => onFile(e.target.files?.[0])} />
                </label>
              </div>
            )}

            {stats?.manualMode && picked.length > 0 && !isCash && (
              <div className="space-y-2 rounded-2xl bg-amber-50 p-3">
                <p className="text-sm text-amber-900">You have used all {stats.wrongAllowed} wrong-screenshot tries for this Saturday. Send the screenshot and type its transaction ID.</p>
                <input value={manualUtr} onChange={e => setManualUtr(e.target.value.toUpperCase())} placeholder="Transaction ID (UTR) from the screenshot" className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 font-mono text-sm" />
              </div>
            )}
            {isCash && confirmCash && !sending && (
              <div className="rounded-2xl bg-blue-50 p-3 text-sm text-blue-900 ring-1 ring-blue-300">
                <p>Record <b>{money(total)}</b> as cash received{picked.length === 1 ? <> from <b>{picked[0].name}</b></> : <> from <b>{picked.length} customers</b></>}? The office will see it.</p>
                <button onClick={() => setConfirmCash(false)} className="mt-1 text-xs font-semibold text-blue-800 underline">Cancel</button>
              </div>
            )}
            <button disabled={sending || !picked.length || (!isCash && fixKind !== 'customer' && !img) || (!isCash && !!stats?.manualMode && manualUtr.trim().length < 8)} onClick={send} className={`flex w-full items-center justify-center gap-2 rounded-full px-4 py-3.5 text-base font-bold shadow-sm transition disabled:bg-gray-300 disabled:text-white/90 ${isCash ? 'bg-[#2563eb] text-white' : 'bg-[#00a884] text-white'}`}>
              {sending ? (isCash ? 'Recording…' : stats?.manualMode ? 'Recording…' : 'Reading the screenshot…') : isCash ? (confirmCash ? `Yes, record ${money(total)} cash` : 'Mark paid as cash') : 'Send'}
            </button>
          </div>
        </div>
      )}

    </>
  )
  const toastEl = (
    <>
      {toast && <div className="fixed bottom-6 left-1/2 z-[70] max-w-[90vw] -translate-x-1/2 rounded-2xl bg-ink px-4 py-3 text-sm text-white shadow-lg">{toast}</div>}
    </>
  )

  if (!me) return <div className="p-8 text-center text-sm text-soft">{error || 'Loading…'}</div>

  if (isG) {
    const ws = weekStats || stats   // progress of the selected week (its Saturday)
    const day = ws ? new Date(`${ws.collectionDay}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' }) : ''
    const pct = ws && ws.due ? Math.round(ws.recorded / ws.due * 100) : 0
    const weeks = Array.from({ length: 27 }, (_, i) => addDays(curMonday, -7 * i))
    const wi = Math.max(0, weeks.indexOf(weekStart))
    const weekName = (w: string, i: number) => `${i === 0 ? 'This week' : i === 1 ? 'Last week' : 'Week'} · ${weekRange(w)}`
    let lastDay = ''
    return (
      <div className="relative -mx-4 -mb-8 -mt-4 flex h-[calc(100dvh-3.75rem-env(safe-area-inset-top))] min-h-[28rem] flex-col overflow-hidden bg-[#efeae2] sm:-mx-6 md:-mb-4 lg:mx-auto lg:mb-0 lg:mt-0 lg:h-[calc(100dvh-7rem)] lg:max-w-2xl lg:rounded-2xl lg:shadow-panel lg:ring-1 lg:ring-black/10">
        <div className="bg-[#075e54] text-white">
          <div className="flex items-center gap-2 px-3 py-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ngflogo.png" alt="" className="h-10 w-10 shrink-0 rounded-full bg-white object-contain p-1" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold leading-tight">NGF FINCORP</p>
              <p className="truncate text-[11px] text-white/75">{ws ? (ws.due === 0 ? <>No collections<span className="hidden min-[430px]:inline"> · {day}</span></> : <>{ws.recorded} of {ws.due} recorded<span className="hidden min-[430px]:inline"> · Sat {day}</span></>) : 'Payments'}</p>
            </div>
            {/* Week picker: Monday to Sunday. Arrows step one week; tapping the label lists the last 27 weeks. */}
            <div className="flex shrink-0 items-center rounded-full bg-white/15 ring-1 ring-white/20">
              <button onClick={() => setWeekStart(weeks[Math.min(weeks.length - 1, wi + 1)])} disabled={wi >= weeks.length - 1} aria-label="Older week" className="px-2.5 py-2 text-lg leading-none disabled:opacity-30">‹</button>
              <label className="relative block min-w-[5.25rem] text-center">
                <span className="block text-[10px] font-medium leading-tight text-white/70">{wi === 0 ? 'This week' : wi === 1 ? 'Last week' : 'Week'}</span>
                <span className="block text-[11px] font-bold leading-tight">{weekRange(weeks[wi])}</span>
                <select value={weeks[wi]} onChange={e => setWeekStart(e.target.value)} aria-label="Choose a week" className="absolute inset-0 h-full w-full cursor-pointer opacity-0">
                  {weeks.map((w, i) => <option key={w} value={w}>{weekName(w, i)}</option>)}
                </select>
              </label>
              <button onClick={() => setWeekStart(weeks[Math.max(0, wi - 1)])} disabled={wi === 0} aria-label="Newer week" className="px-2.5 py-2 text-lg leading-none disabled:opacity-30">›</button>
            </div>
            {onOpenHistory && (
              <button onClick={onOpenHistory} aria-label="Payment history" className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-white/15 px-2.5 text-xs font-semibold hover:bg-white/25">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                <span className="hidden min-[430px]:inline">History</span>
              </button>
            )}
          </div>
          {ws && <div className="h-1 bg-white/20"><div className="h-full bg-[#25d366] transition-all" style={{ width: `${pct}%` }} /></div>}
        </div>

        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-3" style={{ backgroundImage: 'radial-gradient(rgba(0,0,0,0.05) 1px, transparent 1px)', backgroundSize: '18px 18px' }}>
          {resubmits.length > 0 && (
            <div className="mb-2 space-y-2 rounded-xl border-2 border-red-500 bg-red-50 p-2.5 shadow-md">
              <p className="text-sm font-extrabold uppercase tracking-wide text-red-700">Important · send again first</p>
              <p className="text-xs text-red-800">The office found a mistake. Send {resubmits.length === 1 ? 'this payment' : 'these payments'} again. You can send new payments after that.</p>
              {resubmits.map(r => (
                <div key={r.messageId} className="space-y-1.5 rounded-lg bg-white p-2 ring-1 ring-red-200">
                  {r.lines.map(l => <p key={l.repaymentId} className="text-sm leading-tight"><b className="font-mono text-base">{l.payCode}</b> · <b>{l.name}</b> · {money(l.amount)}</p>)}
                  <p className="text-xs text-red-700">{r.problem}</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button onClick={() => startFix(r, 'image')} className="rounded-md bg-red-600 px-2 py-1.5 text-xs font-bold text-white">Send a new screenshot</button>
                    <button onClick={() => startFix(r, 'customer')} className="rounded-md bg-white px-2 py-1.5 text-xs font-semibold text-red-700 ring-1 ring-red-300">Change customer</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {stats && weekStart === curMonday && (
            <p className={`mx-auto mb-2 w-fit max-w-[92%] rounded-lg px-3 py-1.5 text-center text-xs shadow-sm ${stats.manualMode ? 'bg-red-100 text-red-800' : stats.wrongLeft <= 3 ? 'bg-amber-100 text-amber-900' : 'bg-[#fff5c4] text-[#54656f]'}`}>
              {stats.manualMode ? `All ${stats.wrongAllowed} wrong tries used. Type the transaction ID with each screenshot` : `Wrong screenshots left: ${stats.wrongLeft} of ${stats.wrongAllowed}`}
            </p>
          )}
          {error && <p className="mx-auto w-fit rounded-lg bg-red-100 px-3 py-1.5 text-center text-xs text-red-700">{error}</p>}
          {!msgs.length && !error && <p className="mx-auto mt-6 w-fit max-w-[85%] rounded-lg bg-[#fff5c4] px-3 py-2 text-center text-xs text-[#54656f] shadow-sm">{weekStart === curMonday ? 'No payments sent yet this week. Tap Single, Multi or Cash payment below.' : 'No payments in this week.'}</p>}
          {msgs.map(m => {
            const d = dayLabel(m.createdAt)
            const sep = d !== lastDay
            lastDay = d
            return (
              <Fragment key={m.messageId}>
                {sep && <p className="mx-auto my-2 w-fit rounded-lg bg-white/90 px-3 py-1 text-xs font-medium text-[#54656f] shadow-sm">{d}</p>}
                <WaBubble m={m} session={session} onFix={startFix} />
              </Fragment>
            )
          })}
          <div ref={endRef} />
        </div>

        {isG && !open && issues.length > 0 && (() => {
          const m = issues[0]
          return (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" role="alertdialog" aria-modal="true">
              <div className="max-h-[90vh] w-full max-w-sm space-y-3 overflow-y-auto rounded-2xl border-2 border-red-500 bg-white p-4 shadow-2xl">
                <p className="text-base font-extrabold uppercase tracking-wide text-red-700">Fix this first{issues.length > 1 ? ` · 1 of ${issues.length}` : ''}</p>
                <p className="text-xs text-red-800">You cannot send or use the chat until this payment is fixed.</p>
                {m.lines.map(l => <p key={l.repaymentId} className="text-sm leading-tight"><b className="font-mono text-lg">{l.payCode}</b> · <b>{l.name}</b> · {money(l.amount)}</p>)}
                <span className="inline-block rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700">{LABEL[m.status] || m.status}</span>
                {m.problem && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{m.problem}</p>}
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => startFix(m, 'image')} className="rounded-xl bg-red-600 px-3 py-2.5 text-sm font-bold text-white">Send a new screenshot</button>
                  <button onClick={() => startFix(m, 'customer')} className="rounded-xl bg-white px-3 py-2.5 text-sm font-semibold text-red-700 ring-1 ring-red-300">Change customer</button>
                </div>
              </div>
            </div>
          )
        })()}
        {openIssue && (openIssueWeek && openIssueWeek !== weekStart
          ? <button onClick={() => setWeekStart(openIssueWeek)} className="mx-3 mb-1 rounded-lg bg-red-100 px-3 py-2 text-center text-xs font-medium text-red-700">A payment from {weekRange(openIssueWeek)} needs fixing first. Tap here to open it.</button>
          : <p className="mx-3 mb-1 rounded-lg bg-red-100 px-3 py-2 text-center text-xs font-medium text-red-700">Fix the red message above first. Then you can send the next screenshot.</p>)}
        {me.access.canChat === false && <p className="mx-3 mb-1 rounded-lg bg-amber-100 px-3 py-2 text-center text-xs text-amber-900">The chat is not switched on for you yet. Ask an Admin to switch it on.</p>}

        <div className="bg-[#f0f2f5]">
          {me.access.canChat && (
            <div className="grid grid-cols-3 gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5">
              <button disabled={openIssue} onClick={() => startNew('single')} className="rounded-2xl bg-[#00a884] px-2 py-2.5 text-sm font-bold leading-tight text-white shadow-sm disabled:opacity-40">＋ Single<br />payment</button>
              <button disabled={openIssue} onClick={() => startNew('multi')} className="rounded-2xl bg-[#f97316] px-2 py-2.5 text-sm font-bold leading-tight text-white shadow-sm disabled:opacity-40">＋ Multi<br />payment</button>
              <button disabled={openIssue} onClick={() => startNew('cash')} className="rounded-2xl bg-[#2563eb] px-2 py-2.5 text-sm font-bold leading-tight text-white shadow-sm disabled:opacity-40">＋ Cash<br />payment</button>
            </div>
          )}
        </div>
        {sheetEl}
        {toastEl}
      </div>
    )
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-10rem)] min-h-[30rem] max-w-3xl flex-col gap-3">
      {stats && <StatsStrip stats={stats} onOpenHistory={onOpenHistory} />}
      {!stats && onOpenHistory && (
        <div className="flex justify-end"><button onClick={onOpenHistory} className="rounded-full bg-white px-4 py-2 text-xs font-semibold ring-1 ring-black/10">Payment history →</button></div>
      )}
      {!isG && (
        <select value={gid} onChange={e => setGid(e.target.value)} className="rounded-2xl border border-line bg-white px-4 py-2.5 text-sm">
          <option value="">All guarantors</option>
          {me.guarantors.map(g => <option key={g.guarantorId} value={g.guarantorId}>{g.name} ({g.code})</option>)}
        </select>
      )}
      {!isG && (() => {
        // Week filter (Monday to Sunday, India time): with many screenshots coming in, look at one week at a time
        const weeks = Array.from({ length: 27 }, (_, i) => addDays(curMonday, -7 * i))
        const wi = weekStart ? Math.max(0, weeks.indexOf(weekStart)) : -1
        const name = (w: string, i: number) => `${i === 0 ? 'This week' : i === 1 ? 'Last week' : 'Week'} · ${weekRange(w)}`
        return (
          <div className="flex items-center gap-2">
            <button onClick={() => setWeekStart(weeks[Math.min(weeks.length - 1, (wi < 0 ? 0 : wi + 1))])} disabled={wi >= weeks.length - 1} aria-label="Older week" className="rounded-xl border border-line bg-white px-3 py-2 text-lg leading-none disabled:opacity-30">‹</button>
            <select value={weekStart} onChange={e => setWeekStart(e.target.value)} aria-label="Choose a week" className="min-w-0 flex-1 rounded-2xl border border-line bg-white px-3 py-2.5 text-sm">
              <option value="">All recent (latest 120)</option>
              {weeks.map((w, i) => <option key={w} value={w}>{name(w, i)}</option>)}
            </select>
            <button onClick={() => setWeekStart(weeks[Math.max(0, wi - 1)])} disabled={wi <= 0} aria-label="Newer week" className="rounded-xl border border-line bg-white px-3 py-2 text-lg leading-none disabled:opacity-30">›</button>
          </div>
        )
      })()}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-[1.75rem] bg-line p-3 sm:p-4">
        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {!msgs.length && !error && <p className="py-10 text-center text-sm text-soft">{isG ? 'No payments sent yet. Tap Single payment or Multi payment below.' : weekStart ? 'No screenshots in this week.' : 'No screenshots yet.'}</p>}
        {msgs.map(m => <Bubble key={m.messageId} m={m} session={session} me={me} onFix={startFix} onApprove={approve} onResubmit={resubmit} busy={busy} />)}
        <div ref={endRef} />
      </div>

      {openIssue && isG && <p className="rounded-2xl bg-red-50 px-4 py-2 text-sm font-medium text-red-700">Fix the red message above first. Then you can send the next screenshot.</p>}

      <div className="space-y-2">
        {me.access.canChat && (isG || gid) && (
          <div className="grid grid-cols-2 gap-2">
            <button disabled={openIssue && isG} onClick={() => startNew('single')} className="rounded-2xl bg-ink px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">Single payment</button>
            <button disabled={openIssue && isG} onClick={() => startNew('multi')} className="rounded-2xl bg-gold px-4 py-3 text-sm font-semibold text-ink disabled:opacity-40">Multi payment</button>
          </div>
        )}
        {me.access.canChat === false && isG && <p className="rounded-2xl bg-amber-50 px-4 py-2 text-sm text-amber-800">The chat is not switched on for you yet. Ask an Admin to switch it on.</p>}
        {(isG || gid) && (
          <div className="flex gap-2">
            <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendNote()} placeholder="Write a message…" className="min-w-0 flex-1 rounded-2xl border border-line bg-white px-4 py-2.5 text-sm" />
            <button onClick={sendNote} className="rounded-2xl border border-line bg-white px-4 text-sm font-semibold">Send</button>
          </div>
        )}
      </div>

      {sheetEl}
      {toastEl}
    </div>
  )
}

export function ChatSettings({ session }: { session: Session }) {
  const [open, setOpen] = useState(true)
  const [d, setD] = useState<{ settings: Settings; usage: Usage } | null>(null)
  const [msg, setMsg] = useState('')
  const load = useCallback(() => api(session, '/api/payment-chat?view=settings').then(setD).catch(e => setMsg(e.message)), [session])
  useEffect(() => { if (open && !d) load() }, [open, d, load])
  async function save(p: Partial<Settings>) {
    try { const r = await api(session, '/api/payment-chat', { action: 'settings', ...p }); setD(x => x && { ...x, settings: r.settings }); setMsg('Saved') } catch (e) { setMsg(e instanceof Error ? e.message : 'Failed') }
  }
  const inr = (usd: number) => `₹${(usd * INR_PER_USD).toFixed(usd * INR_PER_USD < 10 ? 2 : 0)}`
  return (
    <div className="rounded-2xl bg-white p-3 ring-1 ring-black/5">
      <button onClick={() => setOpen(o => !o)} className="flex w-full items-center justify-between text-sm font-semibold">Screenshot reading: cost and limits <span className="text-soft">{open ? '▲' : '▼'}</span></button>
      {open && d && (
        <div className="mt-3 space-y-3 text-sm">
          <div className="grid grid-cols-3 gap-2 text-center">
            {([['Today', d.usage.today], ['7 days', d.usage.week], ['30 days', d.usage.month]] as const).map(([k, u]) => (
              <div key={k} className="rounded-xl bg-mist p-2"><p className="text-[10px] font-semibold uppercase text-soft">{k}</p><p className="font-bold">{inr(u.usd)}</p><p className="text-xs text-soft">{u.reads} read</p></div>
            ))}
          </div>
          <p className="text-xs text-soft">Estimated from Claude&apos;s published prices ({d.settings.model}). The real bill is in your Anthropic account, where you should also set a monthly spending limit. {d.settings.keyPresent ? '' : 'No reader key is set yet, so reading is off and every screenshot goes to the office.'}</p>
          <RecentReads rows={d.usage.recent || []} />
          <div className="space-y-2 rounded-xl bg-mist p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-soft">Reader</p>
            <select value={d.settings.provider} onChange={e => save({ provider: e.target.value })} className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm">
              <option value="auto">Automatic (Claude, then OpenRouter, then NVIDIA, whichever key is set)</option>
              <option value="claude">Claude (paid, own Anthropic key)</option>
              <option value="openrouter">Claude through OpenRouter (paid from OpenRouter credit)</option>
              <option value="nvidia">NVIDIA Nemotron (free, for testing)</option>
            </select>
            <p className="text-xs text-soft">Claude key: <b>{d.settings.keys.claude ? 'set' : 'not set'}</b> · OpenRouter key: <b>{d.settings.keys.openrouter ? 'set' : 'not set'}</b> · OpenRouter model: <span className="font-mono">{d.settings.openrouterModel}</span> · NVIDIA key: <b>{d.settings.keys.nvidia ? 'set' : 'not set'}</b> · NVIDIA model: <span className="font-mono">{d.settings.nvidiaModel}</span></p>
            <p className="text-xs text-soft">Keys and models are entered in Dev &gt; AI Reader.</p>
            <p className="text-xs text-soft">The NVIDIA free service is meant for trying things out and has its own speed limits. The picture is sent to NVIDIA for reading. Use it to test, then switch to Claude for real use.</p>
            <ReaderTest session={session} keys={d.settings.keys} />
          </div>
          <label className="flex items-center gap-2"><input type="checkbox" checked={d.settings.enabled} onChange={e => save({ enabled: e.target.checked })} /> Automatic reading is on</label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">Daily limit (all)<input type="number" defaultValue={d.settings.dailyCap} onBlur={e => save({ dailyCap: Number(e.target.value) })} className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm" /></label>
            <label className="text-xs">Daily limit per guarantor<input type="number" defaultValue={d.settings.guarantorCap} onBlur={e => save({ guarantorCap: Number(e.target.value) })} className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm" /></label>
          </div>
          <label className="block text-xs">Payments must go to (name or UPI id, comma separated, empty = do not check)
            <input defaultValue={d.settings.payee} onBlur={e => save({ payee: e.target.value })} placeholder="e.g. NGF, ngf@okbank" className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm" /></label>
          {msg && <p className="text-xs text-soft">{msg}</p>}
        </div>
      )}
      {open && !d && <p className="mt-2 text-xs text-soft">{msg || 'Loading…'}</p>}
    </div>
  )
}

// The latest automatic reads: which reader read which payment, how long it took and what it cost
function RecentReads({ rows }: { rows: Recent[] }) {
  const [open, setOpen] = useState(false)
  if (!rows.length) return null
  return (
    <div className="rounded-xl bg-mist p-3">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-left text-xs font-semibold uppercase tracking-wider text-soft"><span>Recent reads ({rows.length}) · which reader read what</span><span>{open ? '▲' : '▼'}</span></button>
      {open && (
        <div className="mt-2 space-y-1.5">
          {rows.map(r => (
            <div key={r.id} className="rounded-lg bg-white p-2 text-[11px] leading-snug ring-1 ring-black/5">
              <p className="font-bold text-ink">{when(r.at)} · {r.guarantor} · {r.status}</p>
              {r.customers && <p className="text-soft">{r.customers}</p>}
              <p>{r.amount != null && <b>{money(r.amount)}</b>}{r.utr && <> · UTR <span className="font-mono">{r.utr}</span></>}</p>
              <p className="font-semibold text-indigo-800">{readerName(r.reader)}{secs(r.ms)}{r.usd ? ` · about ₹${(r.usd * INR_PER_USD).toFixed(2)}` : r.reader.startsWith('nvidia') ? ' · free' : ''}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Try a reader on one screenshot without recording anything. Run both readers on the same picture to compare.
function ReaderTest({ session, keys }: { session: Session; keys: { claude: boolean; openrouter: boolean; nvidia: boolean } }) {
  const [img, setImg] = useState<{ mimeType: string; base64Data: string; preview: string } | null>(null)
  const [busy, setBusy] = useState('')
  const [res, setRes] = useState<TestResult[]>([])
  const [err, setErr] = useState('')
  const [model, setModel] = useState('')
  async function run(providers: string[]) {
    if (!img) return
    setBusy(providers.join('+')); setErr(''); setRes([])
    try {
      const out: TestResult[] = []
      for (const p of providers) out.push(await api(session, '/api/payment-chat', { action: 'testRead', provider: p, model: p !== 'claude' ? model.trim() : undefined, image: { mimeType: img.mimeType, base64Data: img.base64Data } }))
      setRes(out)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed') }
    setBusy('')
  }
  return (
    <div className="space-y-2 border-t border-line pt-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-soft">Test a screenshot (nothing is recorded)</p>
      <label className="flex cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-line bg-white px-3 py-3 text-sm font-semibold">
        {img ? 'Change screenshot' : 'Choose a payment screenshot'}
        <input type="file" accept="image/*" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (f) { try { setImg(await prepareImage(f)); setRes([]) } catch { setErr('Could not open that picture') } } }} />
      </label>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {img && <img src={img.preview} alt="Test screenshot" className="mx-auto max-h-40 rounded-lg border border-line" />}
      {img && (keys.nvidia || keys.openrouter) && <input value={model} onChange={e => setModel(e.target.value)} placeholder="Model to try with NVIDIA / OpenRouter (empty = the saved one)" className="w-full rounded-xl border border-line bg-white px-3 py-2 font-mono text-xs" />}
      {img && (
        <div className="flex flex-wrap gap-2">
          <button disabled={!!busy || !keys.nvidia} onClick={() => run(['nvidia'])} className="rounded-xl bg-ink px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Read with NVIDIA</button>
          <button disabled={!!busy || !keys.openrouter} onClick={() => run(['openrouter'])} className="rounded-xl bg-ink px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Read with OpenRouter</button>
          <button disabled={!!busy || !keys.claude} onClick={() => run(['claude'])} className="rounded-xl bg-ink px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Read with Claude</button>
          <button disabled={!!busy || !keys.claude || !keys.nvidia} onClick={() => run(['nvidia', 'claude'])} className="rounded-xl border border-ink px-3 py-2 text-xs font-semibold disabled:opacity-40">Compare both</button>
        </div>
      )}
      {busy && <p className="text-xs text-soft">Reading…</p>}
      {err && <p className="text-xs text-red-600">{err}</p>}
      {res.map(r => (
        <div key={r.provider} className="rounded-xl bg-white p-3 text-xs ring-1 ring-black/5">
          <p className="font-semibold">{r.provider === 'nvidia' ? 'NVIDIA' : r.provider === 'openrouter' ? 'OpenRouter' : 'Claude'} <span className="font-mono font-normal text-soft">{r.model}</span> · {(r.ms / 1000).toFixed(1)} s{r.costUsd ? ` · about ₹${(r.costUsd * INR_PER_USD).toFixed(2)}` : ' · free'}</p>
          {r.ok && r.reading ? (
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
              {Object.entries(r.reading).map(([k, v]) => (<Fragment key={k}><dt className="text-soft">{k}</dt><dd className="font-mono break-all">{v === null ? '—' : String(v)}</dd></Fragment>))}
            </dl>
          ) : <p className="mt-1 text-red-600">{r.error}</p>}
        </div>
      ))}
    </div>
  )
}
