'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  createdByName: string; createdBy: string; createdAt: string; needsFix: boolean; manual: boolean; reader: string
}
type SheetRow = { repaymentId: string; customerId: string; name: string; phone: string; payCode: string; weekNo: number | null; dueDate: string; amount: number; status: string; overdue: boolean; payment: unknown | null }
type Settings = { enabled: boolean; dailyCap: number; guarantorCap: number; payee: string; keyPresent: boolean; model: string; provider: string; keys: { claude: boolean; nvidia: boolean }; nvidiaModel: string }
type TestResult = { ok: boolean; provider: string; model: string; ms: number; reading: Record<string, unknown> | null; inTokens: number; outTokens: number; costUsd: number; error: string }
type Usage = { today: { reads: number; usd: number }; week: { reads: number; usd: number }; month: { reads: number; usd: number } }

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
  'Wrong Payee': 'bg-red-50 text-red-700 ring-red-200', 'Not Successful': 'bg-red-50 text-red-700 ring-red-200',
}
const LABEL: Record<string, string> = { Recorded: 'Recorded ✓', 'Pending Staff': 'With the office', 'Needs Retake': 'Send a clearer screenshot', Duplicate: 'Already used', 'Amount Mismatch': 'Amount does not match', 'Wrong Payee': 'Wrong receiver', 'Not Successful': 'Payment not successful' }

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

function Thumb({ session, url }: { session: Session; url: string }) {
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
  if (!src) return <div className="h-40 w-28 animate-pulse rounded-xl bg-[#e8eaf0]" />
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="Payment screenshot" onClick={() => setBig(true)} className="max-h-56 w-auto cursor-zoom-in rounded-xl border border-[#e5e7eb] object-contain" />
      {big && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4" onClick={() => setBig(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="Payment screenshot" className="max-h-full max-w-full rounded-xl" />
        </div>
      )}
    </>
  )
}

function Bubble({ m, session, me, onFix, onApprove, busy }: { m: Msg; session: Session; me: Me; onFix: (m: Msg, mode: 'image' | 'customer') => void; onApprove: (m: Msg, utr: string) => void; busy: boolean }) {
  const mine = m.createdBy === session.userId
  const [utr, setUtr] = useState(m.utr)
  const staffView = !me.access.isGuarantor
  if (m.kind === 'note') {
    return (
      <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
        <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${mine ? 'bg-[#1a1a2e] text-white' : 'bg-white ring-1 ring-black/5'}`}>
          <p className={`text-[10px] font-semibold ${mine ? 'text-white/60' : 'text-[#697586]'}`}>{m.createdByName} · {when(m.createdAt)}</p>
          <p className="mt-0.5 whitespace-pre-wrap">{m.note}</p>
        </div>
      </div>
    )
  }
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className="w-full max-w-[92%] space-y-2 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-black/5 sm:max-w-md">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold text-[#697586]">{m.createdByName} · {when(m.createdAt)} · {m.mode === 'multi' ? 'Multi payment' : 'Single payment'}</p>
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ${TONE[m.status] || 'bg-gray-50 text-gray-600 ring-gray-200'}`}>{LABEL[m.status] || m.status}</span>
        </div>
        <Thumb session={session} url={m.imageUrl} />
        <div className="space-y-1">
          {m.lines.map(l => (
            <div key={l.repaymentId} className="flex items-center justify-between gap-2 rounded-xl bg-[#f4f5f7] px-3 py-1.5 text-sm">
              <span><b className="font-mono">{l.payCode}</b> · {l.name}</span><span className="font-semibold">{money(l.amount)}</span>
            </div>
          ))}
        </div>
        {(m.utr || m.amountRead != null) && (
          <p className="text-xs text-[#697586]">
            {m.manual ? 'Typed by the guarantor' : m.amountRead != null ? 'Read from screenshot' : 'Confirmed by the office'}: {m.amountRead != null && <b className="text-[#1a1a2e]">{money(m.amountRead)}</b>}{m.utr && <> · UTR <b className="font-mono text-[#1a1a2e]">{m.utr}</b></>}{m.txnDate && <> · {m.txnDate}{m.txnTime ? ` ${m.txnTime}` : ''}</>}{m.payApp && <> · {m.payApp}</>}
          </p>
        )}
        {m.problem && <p className={`rounded-xl px-3 py-2 text-sm ${m.needsFix ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}>{m.problem}</p>}
        {m.needsFix && mine && (
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => onFix(m, 'image')} className="rounded-xl bg-[#1a1a2e] px-3 py-2 text-xs font-semibold text-white">Send a new screenshot</button>
            <button onClick={() => onFix(m, 'customer')} className="rounded-xl border border-[#e5e7eb] px-3 py-2 text-xs font-semibold">Change customer</button>
          </div>
        )}
        {m.status === 'Pending Staff' && staffView && me.access.canChat && (
          <div className="flex gap-2">
            <input value={utr} onChange={e => setUtr(e.target.value)} placeholder="Transaction ID from the screenshot" className="min-w-0 flex-1 rounded-xl border border-[#e5e7eb] px-3 py-2 text-xs font-mono" />
            <button disabled={busy || !utr.trim()} onClick={() => onApprove(m, utr)} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Record</button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function PaymentChatPage({ session, onOpenHistory }: { session: Session; onOpenHistory?: () => void }) {
  const [me, setMe] = useState<Me | null>(null)
  const [gid, setGid] = useState('')
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [openIssue, setOpenIssue] = useState(false)
  const [stats, setStats] = useState<Stats | null>(null)
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
  const [mode, setMode] = useState<'single' | 'multi'>('single')
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
      const d = await api(session, `/api/payment-chat?view=messages&guarantorId=${encodeURIComponent(gid)}`)
      setMsgs(d.messages); setOpenIssue(d.openIssue); setStats(d.stats || null); setError('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load') }
    inFlight.current = false
  }, [session, me, gid])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) load() }, 8000)
    return () => clearInterval(t)
  }, [load])
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [msgs.length])

  async function loadSheet(g: string) {
    try { const d = await api(session, `/api/payments?view=collect&guarantorId=${encodeURIComponent(g)}`); setSheet(d.rows) } catch (e) { flash(e instanceof Error ? e.message : 'Could not load customers') }
  }
  function startNew(m: 'single' | 'multi') {
    setMode(m); setFixId(''); setFixKind(''); setPicked([]); setImg(null); setQ(''); setManualUtr(''); setOpen(true)
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

  function pick(r: SheetRow) { setPicked(mode === 'single' ? [r] : [...picked, r]); setQ('') }

  async function onFile(f: File | undefined) {
    if (!f) return
    try { setImg(await prepareImage(f)) } catch { flash('Could not open that picture') }
  }

  async function send() {
    if (sending || !picked.length) return
    if (!img && fixKind !== 'customer') { flash('Add the payment screenshot'); return }
    setSending(true)
    try {
      const d = await api(session, '/api/payment-chat', {
        action: 'submit', guarantorId: activeGid, mode, repaymentIds: picked.map(p => p.repaymentId), messageId: fixId || undefined,
        image: img ? { mimeType: img.mimeType, base64Data: img.base64Data } : undefined, manualUtr: stats?.manualMode ? manualUtr : undefined,
      })
      setOpen(false); await load()
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
  async function sendNote() {
    if (!text.trim() || !activeGid) return
    try { await api(session, '/api/payment-chat', { action: 'note', guarantorId: activeGid, text }); setText(''); await load() }
    catch (e) { flash(e instanceof Error ? e.message : 'Failed') }
  }

  if (!me) return <div className="p-8 text-center text-sm text-[#697586]">{error || 'Loading…'}</div>

  return (
    <div className="mx-auto flex h-[calc(100dvh-10rem)] min-h-[30rem] max-w-3xl flex-col gap-3">
      {stats && <StatsStrip stats={stats} onOpenHistory={onOpenHistory} />}
      {!stats && onOpenHistory && (
        <div className="flex justify-end"><button onClick={onOpenHistory} className="rounded-full bg-white px-4 py-2 text-xs font-semibold ring-1 ring-black/10">Payment history →</button></div>
      )}
      {!isG && (
        <select value={gid} onChange={e => setGid(e.target.value)} className="rounded-2xl border border-[#e5e7eb] bg-white px-4 py-2.5 text-sm">
          <option value="">All guarantors</option>
          {me.guarantors.map(g => <option key={g.guarantorId} value={g.guarantorId}>{g.name} ({g.code})</option>)}
        </select>
      )}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-[1.75rem] bg-[#eef0f5] p-3 sm:p-4">
        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {!msgs.length && !error && <p className="py-10 text-center text-sm text-[#697586]">{isG ? 'No payments sent yet. Tap Single payment or Multi payment below.' : 'No screenshots yet.'}</p>}
        {msgs.map(m => <Bubble key={m.messageId} m={m} session={session} me={me} onFix={startFix} onApprove={approve} busy={busy} />)}
        <div ref={endRef} />
      </div>

      {openIssue && isG && <p className="rounded-2xl bg-red-50 px-4 py-2 text-sm font-medium text-red-700">Fix the red message above first. Then you can send the next screenshot.</p>}

      <div className="space-y-2">
        {me.access.canChat && (isG || gid) && (
          <div className="grid grid-cols-2 gap-2">
            <button disabled={openIssue && isG} onClick={() => startNew('single')} className="rounded-2xl bg-[#1a1a2e] px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">Single payment</button>
            <button disabled={openIssue && isG} onClick={() => startNew('multi')} className="rounded-2xl bg-[#f0b429] px-4 py-3 text-sm font-semibold text-[#1a1a2e] disabled:opacity-40">Multi payment</button>
          </div>
        )}
        {me.access.canChat === false && isG && <p className="rounded-2xl bg-amber-50 px-4 py-2 text-sm text-amber-800">The chat is not switched on for you yet. Ask an Admin to switch it on.</p>}
        {(isG || gid) && (
          <div className="flex gap-2">
            <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendNote()} placeholder="Write a message…" className="min-w-0 flex-1 rounded-2xl border border-[#e5e7eb] bg-white px-4 py-2.5 text-sm" />
            <button onClick={sendNote} className="rounded-2xl border border-[#e5e7eb] bg-white px-4 text-sm font-semibold">Send</button>
          </div>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={() => !sending && setOpen(false)}>
          <div className="max-h-[92dvh] w-full max-w-lg space-y-3 overflow-y-auto rounded-t-[1.75rem] bg-white p-5 shadow-panel sm:rounded-[1.75rem]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="text-base font-semibold">{fixId ? 'Fix this payment' : mode === 'multi' ? 'Multi payment' : 'Single payment'}</p>
              <button disabled={sending} onClick={() => setOpen(false)} className="text-sm text-[#697586]">Close</button>
            </div>

            {fixKind !== 'image' && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#697586]">{mode === 'multi' ? 'Customers (add each one)' : 'Customer'}</p>
                <input autoFocus value={q} onChange={e => setQ(e.target.value)} inputMode="search" placeholder="Search the 4-digit ID or name" className="w-full rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none focus:border-[#1a1a2e]" />
                {(q.trim() || (mode === 'multi' && picked.length > 0) || !picked.length) && results.length > 0 && (
                  <div className="max-h-48 overflow-y-auto rounded-2xl border border-[#e5e7eb]">
                    {results.map(r => (
                      <button key={r.repaymentId} onClick={() => pick(r)} className="flex w-full items-center justify-between gap-2 border-b border-[#f0f1f4] px-4 py-2.5 text-left text-sm last:border-0 hover:bg-[#f4f5f7]">
                        <span><b className="font-mono">{r.payCode}</b> · {r.name}<span className="ml-1 text-xs text-[#697586]">{r.weekNo ? `week ${r.weekNo}` : ''}{r.dueDate ? ` · due ${r.dueDate.slice(5).split('-').reverse().join('/')}` : ''}</span>{r.overdue && <span className="ml-1 text-xs text-red-600">overdue</span>}</span>
                        <span className="font-semibold">{money(r.amount)}</span>
                      </button>
                    ))}
                  </div>
                )}
                {q.trim() && results.length === 0 && <p className="text-xs text-[#697586]">No unpaid customer found for that.</p>}
              </div>
            )}

            {picked.length > 0 && (
              <div className="space-y-1">
                {picked.map(p => (
                  <div key={p.repaymentId} className="flex items-center justify-between gap-2 rounded-xl bg-[#f4f5f7] px-3 py-2 text-sm">
                    <span><b className="font-mono">{p.payCode}</b> · {p.name}</span>
                    <span className="flex items-center gap-2"><b>{money(p.amount)}</b>
                      {fixKind !== 'image' && <button onClick={() => setPicked(picked.filter(x => x.repaymentId !== p.repaymentId))} className="text-red-600" aria-label="Remove">✕</button>}</span>
                  </div>
                ))}
                <p className="text-right text-sm font-semibold">Total to match: {money(total)}</p>
              </div>
            )}
            {mode === 'multi' && picked.length > 0 && fixKind !== 'image' && <p className="text-xs text-[#697586]">Add another customer by searching again. The screenshot amount must equal the total.</p>}

            {picked.length > 0 && fixKind !== 'customer' && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#697586]">Payment screenshot</p>
                <label className="flex cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed border-[#d6d9e0] px-4 py-5 text-sm font-semibold text-[#1a1a2e]">
                  {img ? 'Change screenshot' : 'Upload screenshot'}
                  <input type="file" accept="image/*" className="hidden" onChange={e => onFile(e.target.files?.[0])} />
                </label>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {img && <img src={img.preview} alt="Selected screenshot" className="mx-auto max-h-56 rounded-xl border border-[#e5e7eb]" />}
              </div>
            )}

            {stats?.manualMode && picked.length > 0 && (
              <div className="space-y-2 rounded-2xl bg-amber-50 p-3">
                <p className="text-sm text-amber-900">You have used all {stats.wrongAllowed} wrong-screenshot tries for this Saturday. Send the screenshot and type its transaction ID.</p>
                <input value={manualUtr} onChange={e => setManualUtr(e.target.value.toUpperCase())} placeholder="Transaction ID (UTR) from the screenshot" className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 font-mono text-sm" />
              </div>
            )}
            <button disabled={sending || !picked.length || (fixKind !== 'customer' && !img) || (!!stats?.manualMode && manualUtr.trim().length < 8)} onClick={send} className="w-full rounded-2xl bg-[#1a1a2e] px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">
              {sending ? (stats?.manualMode ? 'Recording…' : 'Reading the screenshot…') : 'Send'}
            </button>
          </div>
        </div>
      )}

      {toast && <div className="fixed bottom-6 left-1/2 z-[70] max-w-[90vw] -translate-x-1/2 rounded-2xl bg-[#1a1a2e] px-4 py-3 text-sm text-white shadow-lg">{toast}</div>}
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
      <button onClick={() => setOpen(o => !o)} className="flex w-full items-center justify-between text-sm font-semibold">Screenshot reading: cost and limits <span className="text-[#697586]">{open ? '▲' : '▼'}</span></button>
      {open && d && (
        <div className="mt-3 space-y-3 text-sm">
          <div className="grid grid-cols-3 gap-2 text-center">
            {([['Today', d.usage.today], ['7 days', d.usage.week], ['30 days', d.usage.month]] as const).map(([k, u]) => (
              <div key={k} className="rounded-xl bg-[#f4f5f7] p-2"><p className="text-[10px] font-semibold uppercase text-[#697586]">{k}</p><p className="font-bold">{inr(u.usd)}</p><p className="text-xs text-[#697586]">{u.reads} read</p></div>
            ))}
          </div>
          <p className="text-xs text-[#697586]">Estimated from Claude&apos;s published prices ({d.settings.model}). The real bill is in your Anthropic account, where you should also set a monthly spending limit. {d.settings.keyPresent ? '' : 'No reader key is set yet, so reading is off and every screenshot goes to the office.'}</p>
          <div className="space-y-2 rounded-xl bg-[#f4f5f7] p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#697586]">Reader</p>
            <select value={d.settings.provider} onChange={e => save({ provider: e.target.value })} className="w-full rounded-xl border border-[#e5e7eb] bg-white px-3 py-2 text-sm">
              <option value="auto">Automatic (Claude if its key is set, otherwise NVIDIA)</option>
              <option value="claude">Claude (paid, most accurate)</option>
              <option value="nvidia">NVIDIA Nemotron (free, for testing)</option>
            </select>
            <p className="text-xs text-[#697586]">Claude key: <b>{d.settings.keys.claude ? 'set' : 'not set'}</b> · NVIDIA key: <b>{d.settings.keys.nvidia ? 'set' : 'not set'}</b> · NVIDIA model: <span className="font-mono">{d.settings.nvidiaModel}</span></p>
            <p className="text-xs text-[#697586]">Keys and the NVIDIA model are entered in Dev &gt; AI Reader.</p>
            <p className="text-xs text-[#697586]">The NVIDIA free service is meant for trying things out and has its own speed limits. The picture is sent to NVIDIA for reading. Use it to test, then switch to Claude for real use.</p>
            <ReaderTest session={session} keys={d.settings.keys} />
          </div>
          <label className="flex items-center gap-2"><input type="checkbox" checked={d.settings.enabled} onChange={e => save({ enabled: e.target.checked })} /> Automatic reading is on</label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">Daily limit (all)<input type="number" defaultValue={d.settings.dailyCap} onBlur={e => save({ dailyCap: Number(e.target.value) })} className="mt-1 w-full rounded-xl border border-[#e5e7eb] px-3 py-2 text-sm" /></label>
            <label className="text-xs">Daily limit per guarantor<input type="number" defaultValue={d.settings.guarantorCap} onBlur={e => save({ guarantorCap: Number(e.target.value) })} className="mt-1 w-full rounded-xl border border-[#e5e7eb] px-3 py-2 text-sm" /></label>
          </div>
          <label className="block text-xs">Payments must go to (name or UPI id, comma separated, empty = do not check)
            <input defaultValue={d.settings.payee} onBlur={e => save({ payee: e.target.value })} placeholder="e.g. NGF, ngf@okbank" className="mt-1 w-full rounded-xl border border-[#e5e7eb] px-3 py-2 text-sm" /></label>
          {msg && <p className="text-xs text-[#697586]">{msg}</p>}
        </div>
      )}
      {open && !d && <p className="mt-2 text-xs text-[#697586]">{msg || 'Loading…'}</p>}
    </div>
  )
}

// Try a reader on one screenshot without recording anything. Run both readers on the same picture to compare.
function ReaderTest({ session, keys }: { session: Session; keys: { claude: boolean; nvidia: boolean } }) {
  const [img, setImg] = useState<{ mimeType: string; base64Data: string; preview: string } | null>(null)
  const [busy, setBusy] = useState('')
  const [res, setRes] = useState<TestResult[]>([])
  const [err, setErr] = useState('')
  async function run(providers: string[]) {
    if (!img) return
    setBusy(providers.join('+')); setErr(''); setRes([])
    try {
      const out: TestResult[] = []
      for (const p of providers) out.push(await api(session, '/api/payment-chat', { action: 'testRead', provider: p, image: { mimeType: img.mimeType, base64Data: img.base64Data } }))
      setRes(out)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed') }
    setBusy('')
  }
  return (
    <div className="space-y-2 border-t border-[#e5e7eb] pt-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-[#697586]">Test a screenshot (nothing is recorded)</p>
      <label className="flex cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-[#d6d9e0] bg-white px-3 py-3 text-sm font-semibold">
        {img ? 'Change screenshot' : 'Choose a payment screenshot'}
        <input type="file" accept="image/*" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (f) { try { setImg(await prepareImage(f)); setRes([]) } catch { setErr('Could not open that picture') } } }} />
      </label>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {img && <img src={img.preview} alt="Test screenshot" className="mx-auto max-h-40 rounded-lg border border-[#e5e7eb]" />}
      {img && (
        <div className="flex flex-wrap gap-2">
          <button disabled={!!busy || !keys.nvidia} onClick={() => run(['nvidia'])} className="rounded-xl bg-[#1a1a2e] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Read with NVIDIA</button>
          <button disabled={!!busy || !keys.claude} onClick={() => run(['claude'])} className="rounded-xl bg-[#1a1a2e] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Read with Claude</button>
          <button disabled={!!busy || !keys.claude || !keys.nvidia} onClick={() => run(['nvidia', 'claude'])} className="rounded-xl border border-[#1a1a2e] px-3 py-2 text-xs font-semibold disabled:opacity-40">Compare both</button>
        </div>
      )}
      {busy && <p className="text-xs text-[#697586]">Reading…</p>}
      {err && <p className="text-xs text-red-600">{err}</p>}
      {res.map(r => (
        <div key={r.provider} className="rounded-xl bg-white p-3 text-xs ring-1 ring-black/5">
          <p className="font-semibold">{r.provider === 'nvidia' ? 'NVIDIA' : 'Claude'} <span className="font-mono font-normal text-[#697586]">{r.model}</span> · {(r.ms / 1000).toFixed(1)} s{r.costUsd ? ` · about ₹${(r.costUsd * INR_PER_USD).toFixed(2)}` : ' · free'}</p>
          {r.ok && r.reading ? (
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
              {Object.entries(r.reading).map(([k, v]) => (<><dt key={k + 'k'} className="text-[#697586]">{k}</dt><dd key={k + 'v'} className="font-mono break-all">{v === null ? '—' : String(v)}</dd></>))}
            </dl>
          ) : <p className="mt-1 text-red-600">{r.error}</p>}
        </div>
      ))}
    </div>
  )
}
