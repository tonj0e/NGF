'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Session } from '@/types'
import PaymentDiagram from '@/components/payments/PaymentDiagram'
import { parseBankCsv, BankRow } from '@/components/payments/bankCsv'

type Me = {
  today: string; saturday: string
  access: { canMark: boolean; canBank: boolean; canOverride: boolean; isGuarantor: boolean; isAdmin: boolean; guarantorId: string }
  guarantors: { guarantorId: string; name: string; code: string }[]
}
type Line = { lineId: string; customerId: string; name: string; payCode: string; amount: number; weekNo: number | null; dueDate: string | null; applied: boolean; hidden: boolean }
type Brief = { groupId: string; status: string; markedByName: string; createdAt: string; total: number; lines: Line[] }
type Group = {
  groupId: string; guarantorId: string; guarantorName: string; saturdayDate: string; mode: string; utr: string; total: number
  status: string; flagReason: string; screenshot: string; notes: string; markedByName: string; createdAt: string
  lines: Line[]; events: { event: string; oldUtr: string; newUtr: string; reason: string; actorName: string; createdAt: string }[]
  conflicts: Brief[]
  bank: { status: 'Matched' | 'Amount mismatch' | 'Not found' | 'Not checked'; bankAmount?: number; bankDate?: string }
}
type SheetRow = {
  repaymentId: string; customerId: string; name: string; phone: string; payCode: string; weekNo: number | null; dueDate: string
  amount: number; status: string; overdue: boolean
  payment: { groupId: string; status: string; mode: string; utr: string; total: number } | null
}

const money = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
function shiftDate(d: string, days: number) {
  const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + days); return t.toISOString().slice(0, 10)
}
const EVENT_LABEL: Record<string, string> = {
  created: 'Payment marked', flagged: 'Flagged: UTR already used', 'utr-corrected': 'UTR corrected, payment verified', 'utr-edited': 'UTR edited',
  overridden: 'Override approved', verified: 'Verified', discarded: 'Discarded',
}

const card = 'rounded-[1.75rem] border border-white/70 bg-white shadow-panel p-4 sm:p-6'
const input = 'w-full rounded-2xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm outline-none focus:border-[#1a1a2e]'

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

function Pill({ tone, children }: { tone: 'green' | 'amber' | 'red' | 'violet' | 'gray' | 'blue'; children: React.ReactNode }) {
  const c = { green: 'bg-green-100 text-green-700', amber: 'bg-amber-100 text-amber-800', red: 'bg-red-100 text-red-700', violet: 'bg-violet-100 text-violet-700', gray: 'bg-[#f4f5f7] text-[#697586]', blue: 'bg-blue-100 text-blue-700' }[tone]
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${c}`}>{children}</span>
}

function BankPill({ g }: { g: Group }) {
  if (!['UPI', 'Bank'].includes(g.mode) || g.status === 'Flagged') return null
  if (g.bank.status === 'Matched') return <Pill tone="green">Bank matched ✓</Pill>
  if (g.bank.status === 'Amount mismatch') return <Pill tone="red">Bank shows {money(g.bank.bankAmount || 0)}</Pill>
  if (g.bank.status === 'Not found') return <Pill tone="amber">Not in bank statement</Pill>
  return <Pill tone="gray">Bank not checked</Pill>
}

function Proof({ session, url }: { session: Session; url: string }) {
  const [src, setSrc] = useState('')
  const [open, setOpen] = useState(false)
  const fid = url.match(/[?&]id=([^&]+)/)?.[1] || url.match(/\/d\/([^/]+)/)?.[1] || ''
  useEffect(() => {
    if (!open || !fid || src) return
    fetch(`/api/drive/${fid}`, { headers: { Authorization: `Bearer ${session.token}` } })
      .then(r => { if (!r.ok) throw new Error(); return r.blob() })
      .then(b => setSrc(URL.createObjectURL(b))).catch(() => setSrc('error'))
  }, [open, fid, src, session.token])
  if (!url) return null
  return (
    <div>
      <button type="button" onClick={() => setOpen(o => !o)} className="text-xs font-semibold text-blue-700 underline">{open ? 'Hide screenshot' : 'View screenshot'}</button>
      {open && (src === 'error' ? <p className="mt-1 text-xs text-red-600">Could not load the screenshot.</p>
        : src ? <img src={src} alt="Payment screenshot" className="mt-2 max-h-80 rounded-xl border border-[#e5e7eb]" /> : <p className="mt-1 text-xs text-[#697586]">Loading…</p>)}
    </div>
  )
}

function History({ g }: { g: Group }) {
  const [open, setOpen] = useState(false)
  if (!g.events.length) return null
  return (
    <div>
      <button type="button" onClick={() => setOpen(o => !o)} className="text-xs font-semibold text-[#697586] underline">{open ? 'Hide history' : `History (${g.events.length})`}</button>
      {open && (
        <ul className="mt-2 space-y-1 text-xs text-[#4b5563]">
          {g.events.map((e, i) => (
            <li key={i}>
              <span className="font-semibold">{EVENT_LABEL[e.event] || e.event}</span> · {e.actorName} · {when(e.createdAt)}
              {e.oldUtr || e.newUtr ? <span className="font-mono"> · {e.oldUtr ? `${e.oldUtr} → ` : ''}{e.newUtr}</span> : null}
              {e.reason ? <span> · “{e.reason}”</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── One payment card (records) ──────────────────────────────────────────────

function GroupCard({ g, session, me, onChanged }: { g: Group; session: Session; me: Me; onChanged: () => void }) {
  const flagged = g.status === 'Flagged'
  const canAct = me.access.canMark
  return (
    <div className={`rounded-2xl border p-3 sm:p-4 space-y-3 ${flagged ? 'border-amber-300 bg-amber-50/40' : 'border-[#e5e7eb] bg-white'}`}>
      <div className="flex flex-wrap items-center gap-2">
        {flagged ? <Pill tone="amber">⚠ Flagged</Pill> : g.status === 'Overridden' ? <Pill tone="violet">Override approved</Pill> : <Pill tone="green">Verified</Pill>}
        <BankPill g={g} />
        <span className="ml-auto text-xs text-[#697586]">{g.guarantorName ? `${g.guarantorName} · ` : ''}{g.markedByName} · {when(g.createdAt)}</span>
      </div>
      <PaymentDiagram utr={g.utr} mode={g.mode} total={g.total} status={g.status}
        lines={g.lines.map(l => ({ name: l.name, payCode: l.payCode, amount: l.amount, hidden: l.hidden }))} />
      {g.notes && <p className="text-xs text-[#4b5563]">Note: {g.notes}</p>}
      {flagged && <FlagFix g={g} session={session} me={me} canAct={canAct} onChanged={onChanged} />}
      <div className="flex flex-wrap items-center gap-4">
        <Proof session={session} url={g.screenshot} />
        {g.status === 'Overridden' && g.flagReason && <p className="text-xs text-violet-700">Override reason: {g.flagReason}</p>}
      </div>
      {!me.access.isGuarantor && <History g={g} />}
    </div>
  )
}

// ─── Fix a flagged payment ───────────────────────────────────────────────────

function FlagFix({ g, session, me, canAct, onChanged }: { g: Group; session: Session; me: Me; canAct: boolean; onChanged: () => void }) {
  const [utr, setUtr] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState('')
  const [fixId, setFixId] = useState('')
  const [fixUtr, setFixUtr] = useState('')
  const [msg, setMsg] = useState('')

  async function run(label: string, body: object) {
    setBusy(label); setMsg('')
    try { await api(session, '/api/payments', body); onChanged() }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Failed') }
    finally { setBusy('') }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-amber-200 bg-white p-3">
      <p className="text-sm font-semibold text-amber-900">This UTR is already used on another payment.</p>
      {g.conflicts.length === 0 && <p className="text-xs text-[#697586]">{g.flagReason}</p>}
      {g.conflicts.map(c => (
        <div key={c.groupId} className="space-y-2 rounded-xl bg-[#f9fafb] p-3">
          <p className="text-xs text-[#4b5563]">
            <span className="font-semibold">UTR {g.utr}</span> is already used for{' '}
            <span className="font-semibold">{c.lines.map(l => `${l.name} ${money(l.amount)}`).join(' + ')}</span> ({c.markedByName}, {when(c.createdAt)}).
            {!me.access.isGuarantor && ' One of the two UTRs is wrong. Check the screenshots and correct the wrong one.'}
          </p>
          {canAct && (me.access.canOverride ? (
            fixId === c.groupId ? (
              <div className="flex gap-2">
                <input className={input} placeholder="Correct UTR for that payment" value={fixUtr} onChange={e => setFixUtr(e.target.value)} />
                <button disabled={!!busy || !fixUtr.trim()} onClick={() => run('fix', { action: 'editUtr', groupId: c.groupId, utr: fixUtr })}
                  className="shrink-0 rounded-2xl bg-[#1a1a2e] px-4 text-sm font-semibold text-white disabled:opacity-50">{busy === 'fix' ? '…' : 'Save'}</button>
              </div>
            ) : (
              <button onClick={() => { setFixId(c.groupId); setFixUtr('') }} className="text-xs font-semibold text-blue-700 underline">Edit the UTR on that earlier payment</button>
            )
          ) : <p className="text-xs text-[#697586]">To correct the earlier payment ask a manager with override permission.</p>)}
        </div>
      ))}
      {canAct && (
        <>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-[#697586]">Edit with the original UTR</p>
            <div className="flex gap-2">
              <input className={input} placeholder="Original UTR from the screenshot" value={utr} onChange={e => setUtr(e.target.value)} />
              <button disabled={!!busy || !utr.trim()} onClick={() => run('edit', { action: 'editUtr', groupId: g.groupId, utr })}
                className="shrink-0 rounded-2xl bg-[#1a1a2e] px-4 text-sm font-semibold text-white disabled:opacity-50">{busy === 'edit' ? '…' : 'Save UTR'}</button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button disabled={!!busy} onClick={() => { if (confirm('Discard this flagged payment? The customers go back to unpaid.')) run('discard', { action: 'discard', groupId: g.groupId }) }}
              className="text-xs font-semibold text-red-600 underline">Discard this payment</button>
          </div>
          {me.access.canOverride && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-[#697586]">Approve anyway (needs a written reason)</p>
              <div className="flex gap-2">
                <input className={input} placeholder="Reason for the override" value={reason} onChange={e => setReason(e.target.value)} />
                <button disabled={!!busy || reason.trim().length < 5} onClick={() => run('override', { action: 'override', groupId: g.groupId, reason })}
                  className="shrink-0 rounded-2xl border border-violet-300 bg-violet-50 px-4 text-sm font-semibold text-violet-800 disabled:opacity-50">{busy === 'override' ? '…' : 'Override'}</button>
              </div>
            </div>
          )}
        </>
      )}
      {msg && <p className="text-xs font-medium text-red-600">{msg}</p>}
    </div>
  )
}

// ─── Collect tab ─────────────────────────────────────────────────────────────

function CollectTab({ session, me, guarantorId, date, onChanged, refreshKey }: { session: Session; me: Me; guarantorId: string; date: string; onChanged: () => void; refreshKey: number }) {
  const [rows, setRows] = useState<SheetRow[]>([])
  const [expected, setExpected] = useState(0)
  const [flagged, setFlagged] = useState<Group[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [mode, setMode] = useState('UPI')
  const [utr, setUtr] = useState('')
  const [notes, setNotes] = useState('')
  const [shot, setShot] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [dup, setDup] = useState<{ groups: Group[]; utr: string } | null>(null)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    if (!guarantorId) { setRows([]); setFlagged([]); return }
    setLoading(true); setError('')
    try {
      const [sheet, rec] = await Promise.all([
        api(session, `/api/payments?view=collect&guarantorId=${encodeURIComponent(guarantorId)}&date=${date}`),
        api(session, `/api/payments?view=records&guarantorId=${encodeURIComponent(guarantorId)}&date=${date}`),
      ])
      setRows(sheet.rows); setExpected(sheet.expected); setFlagged(rec.flagged)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load') }
    finally { setLoading(false) }
  }, [session, guarantorId, date])
  useEffect(() => { load(); setPicked([]) }, [load, refreshKey])

  // Live duplicate check while typing the UTR
  useEffect(() => {
    setDup(null)
    if (timer.current) clearTimeout(timer.current)
    const v = utr.replace(/[\s-]+/g, '')
    if (!['UPI', 'Bank'].includes(mode) || v.length < 8) return
    timer.current = setTimeout(async () => {
      try {
        const r = await api(session, `/api/payments?view=utr&utr=${encodeURIComponent(v)}`)
        const used = (r.groups as Group[]).filter(g => g.status !== 'Flagged')
        setDup(used.length ? { groups: used, utr: r.utr } : null)
      } catch { /* the save step re-checks on the server */ }
    }, 400)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [utr, mode, session])

  const needle = q.trim().toLowerCase()
  const visible = useMemo(() => rows.filter(r => !needle || r.payCode.includes(needle) || r.name.toLowerCase().includes(needle) || r.phone.includes(needle)), [rows, needle])
  const pickedRows = rows.filter(r => picked.includes(r.repaymentId))
  const total = pickedRows.reduce((s, r) => s + r.amount, 0)
  const paidCount = rows.filter(r => r.status === 'Paid' && r.dueDate === date).length

  function toggle(r: SheetRow) {
    if (r.status === 'Paid' || r.payment) return
    setResult(null)
    setPicked(p => p.includes(r.repaymentId) ? p.filter(x => x !== r.repaymentId) : [...p, r.repaymentId])
  }

  async function save() {
    if (saving || !picked.length) return
    if (['UPI', 'Bank'].includes(mode) && !utr.trim()) { setResult({ ok: false, text: 'Enter the UTR / transaction ID.' }); return }
    setSaving(true); setResult(null)
    try {
      let screenshot: unknown = null
      if (shot) {
        const dataUrl: string = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.readAsDataURL(shot) })
        screenshot = { fileName: shot.name, mimeType: shot.type || 'image/jpeg', base64Data: dataUrl }
      }
      const r = await api(session, '/api/payments', { action: 'mark', guarantorId, date, mode, utr, repaymentIds: picked, notes, screenshot })
      if (r.flagged) setResult({ ok: false, text: 'Saved as FLAGGED: this UTR is already used on another payment. Fix it below.' })
      else setResult({ ok: true, text: `Saved ${money(r.group.total)} for ${r.group.lines.map((l: Line) => l.name).join(' + ')}.` })
      setPicked([]); setUtr(''); setNotes(''); setShot(null); setDup(null)
      await load(); onChanged()
    } catch (e) { setResult({ ok: false, text: e instanceof Error ? e.message : 'Could not save' }) }
    finally { setSaving(false) }
  }

  if (!guarantorId) return <div className={card}><p className="text-sm text-[#697586]">Choose a guarantor above to see their customers for this Saturday.</p></div>

  return (
    <div className="space-y-4">
      {flagged.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-amber-800">⚠ {flagged.length} flagged payment{flagged.length > 1 ? 's' : ''} need a corrected UTR</p>
          {flagged.map(g => <GroupCard key={g.groupId} g={g} session={session} me={me} onChanged={() => { load(); onChanged() }} />)}
        </div>
      )}

      <div className={card}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">Customers due · {rows.filter(r => r.dueDate === date).length}</p>
          <p className="text-xs text-[#697586]">Expected {money(expected)} · {paidCount} paid</p>
        </div>
        <input className={input} inputMode="search" placeholder="Search 4-digit code, name or phone" value={q} onChange={e => setQ(e.target.value)} />
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {loading && <p className="mt-3 text-sm text-[#697586]">Loading…</p>}
        {!loading && !error && visible.length === 0 && <p className="mt-3 text-sm text-[#697586]">No customers match.</p>}
        <ul className="mt-3 divide-y divide-[#f0f1f3]">
          {visible.map(r => {
            const on = picked.includes(r.repaymentId)
            const done = r.status === 'Paid' || !!r.payment
            return (
              <li key={r.repaymentId}>
                <button type="button" onClick={() => toggle(r)} disabled={done}
                  className={`flex w-full items-center gap-3 py-3 text-left transition ${on ? 'bg-blue-50/70' : ''} ${done ? 'opacity-75' : ''}`}>
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-xs font-bold ${on ? 'border-[#1a1a2e] bg-[#1a1a2e] text-white' : 'border-[#d1d5db] text-transparent'}`}>✓</span>
                  <span className="shrink-0 rounded-lg bg-[#f4f5f7] px-2 py-1 font-mono text-sm font-semibold text-[#1a1a2e]">{r.payCode || '----'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{r.name}</span>
                    <span className="block text-xs text-[#697586]">Week {r.weekNo ?? '-'}{r.overdue ? ` · due ${r.dueDate}` : ''}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-bold">{money(r.amount)}</span>
                    {r.payment?.status === 'Flagged' ? <Pill tone="amber">Flagged</Pill>
                      : r.status === 'Paid' ? <Pill tone="green">Paid{r.payment ? ` · ${r.payment.mode}` : ''}</Pill>
                      : r.overdue ? <Pill tone="red">Overdue</Pill> : <Pill tone="gray">Pending</Pill>}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      {picked.length > 0 && (
        <div className={`${card} sticky bottom-3 z-10 space-y-3 border-[#1a1a2e]/20`}>
          <div className="flex flex-wrap items-center gap-2">
            {pickedRows.map(r => (
              <span key={r.repaymentId} className="inline-flex items-center gap-1 rounded-full bg-[#f4f5f7] py-1 pl-3 pr-1 text-xs font-semibold">
                {r.name} · {money(r.amount)}
                <button type="button" aria-label={`Remove ${r.name}`} onClick={() => setPicked(p => p.filter(x => x !== r.repaymentId))} className="flex h-5 w-5 items-center justify-center rounded-full text-[#697586] hover:bg-white">×</button>
              </span>
            ))}
          </div>
          <p className="text-xs text-[#697586]">To add another customer to this same payment, search their code above and tap them.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <select className={input} value={mode} onChange={e => setMode(e.target.value)}>
              <option value="UPI">UPI / QR</option><option value="Cash">Cash</option><option value="Bank">Bank transfer</option><option value="Cheque">Cheque</option><option value="Other">Other</option>
            </select>
            {['UPI', 'Bank'].includes(mode) && (
              <input className={`${input} font-mono`} data-no-upper placeholder="UTR / transaction ID" value={utr} onChange={e => setUtr(e.target.value)} autoCapitalize="characters" />
            )}
          </div>
          {dup && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">This UTR is already used</p>
              {dup.groups.map(g => (
                <p key={g.groupId} className="mt-1 text-xs">{g.lines.map(l => `${l.name} ${money(l.amount)}`).join(' + ')} · {g.markedByName}, {when(g.createdAt)}</p>
              ))}
              <p className="mt-1 text-xs">If you save, this payment is marked <b>Flagged</b> and will not count as paid until the UTR is corrected.</p>
            </div>
          )}
          <input className={input} placeholder="Note (optional)" value={notes} onChange={e => setNotes(e.target.value)} />
          <label className="block text-xs text-[#697586]">Screenshot (optional proof)
            <input type="file" accept="image/*" className="mt-1 block w-full text-xs" onChange={e => setShot(e.target.files?.[0] || null)} />
          </label>
          <button type="button" onClick={save} disabled={saving}
            className="w-full rounded-2xl bg-[#1a1a2e] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
            {saving ? 'Saving…' : `Save ${money(total)} for ${picked.length} customer${picked.length > 1 ? 's' : ''}`}
          </button>
        </div>
      )}
      {result && (
        <p className={`rounded-2xl px-4 py-3 text-sm font-medium ${result.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{result.text}</p>
      )}
    </div>
  )
}

// ─── Records tab ─────────────────────────────────────────────────────────────

function RecordsTab({ session, me, guarantorId, date, refreshKey, onChanged }: { session: Session; me: Me; guarantorId: string; date: string; refreshKey: number; onChanged: () => void }) {
  const [data, setData] = useState<{ groups: Group[]; flagged: Group[]; summary: { upi: number; cash: number; other: number; payments: number; flaggedCount: number } } | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setData(await api(session, `/api/payments?view=records&guarantorId=${encodeURIComponent(guarantorId)}&date=${date}`)) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load') }
    finally { setLoading(false) }
  }, [session, guarantorId, date])
  useEffect(() => { load() }, [load, refreshKey])

  if (error) return <div className={card}><p className="text-sm text-red-600">{error}</p></div>
  if (!data) return <div className={card}><p className="text-sm text-[#697586]">{loading ? 'Loading…' : ''}</p></div>
  const flaggedElsewhere = data.flagged.filter(f => !data.groups.some(g => g.groupId === f.groupId))
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[['UPI / bank', money(data.summary.upi)], ['Cash', money(data.summary.cash)], ['Payments', String(data.summary.payments)], ['Flagged', String(data.summary.flaggedCount)]].map(([l, v]) => (
          <div key={l} className="rounded-2xl border border-[#e5e7eb] bg-white p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#697586]">{l}</p>
            <p className={`mt-1 text-lg font-bold ${l === 'Flagged' && v !== '0' ? 'text-amber-700' : ''}`}>{v}</p>
          </div>
        ))}
      </div>
      {flaggedElsewhere.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-amber-800">Other flagged payments</p>
          {flaggedElsewhere.map(g => <GroupCard key={g.groupId} g={g} session={session} me={me} onChanged={() => { load(); onChanged() }} />)}
        </div>
      )}
      {data.groups.length === 0 ? <div className={card}><p className="text-sm text-[#697586]">No payments recorded for this Saturday yet.</p></div>
        : <div className="space-y-3">{data.groups.map(g => <GroupCard key={g.groupId} g={g} session={session} me={me} onChanged={() => { load(); onChanged() }} />)}</div>}
    </div>
  )
}

// ─── Bank tab ────────────────────────────────────────────────────────────────

function BankTab({ session, me }: { session: Session; me: Me }) {
  const [report, setReport] = useState<any>(null)
  const [error, setError] = useState('')
  const [rows, setRows] = useState<BankRow[] | null>(null)
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const load = useCallback(async () => {
    try { setReport(await api(session, '/api/payments?view=bank')) } catch (e) { setError(e instanceof Error ? e.message : 'Could not load') }
  }, [session])
  useEffect(() => { load() }, [load])

  async function pick(f: File | null) {
    setMsg(''); setRows(null)
    if (!f) return
    setFileName(f.name)
    try { const parsed = parseBankCsv(await f.text()); setRows(parsed); if (!parsed.length) setMsg('No credit rows with a UTR were found. Export the statement as CSV with the UTR / narration and credit columns.') }
    catch { setMsg('Could not read that file. Use a CSV export.') }
  }
  async function upload() {
    if (!rows?.length) return
    setBusy(true); setMsg('')
    try {
      const r = await api(session, '/api/payments', { action: 'bankUpload', rows, fileName })
      setMsg(`Added ${r.added} new credits (${r.alreadyHad} already uploaded, ${r.skipped} skipped).`); setRows(null); await load()
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Upload failed') }
    finally { setBusy(false) }
  }
  if (!me.access.canBank) return null
  return (
    <div className="space-y-4">
      <div className={`${card} space-y-3`}>
        <p className="text-sm font-semibold">Upload bank statement (CSV)</p>
        <p className="text-xs text-[#697586]">Each credit is read with its UTR (from a UTR column, or the 12-digit number in the narration). Every saved UTR payment is then checked for the same UTR and amount.</p>
        <input type="file" accept=".csv,text/csv" className="block w-full text-sm" onChange={e => pick(e.target.files?.[0] || null)} />
        {rows && rows.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm">Found <b>{rows.length}</b> credits with a UTR. First: {rows[0].utr} · {money(rows[0].amount)}</p>
            <button onClick={upload} disabled={busy} className="rounded-2xl bg-[#1a1a2e] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{busy ? 'Uploading…' : 'Upload and check'}</button>
          </div>
        )}
        {msg && <p className="text-sm font-medium text-[#1a1a2e]">{msg}</p>}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {report && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[['Bank credits on file', report.bankRows], ['Matched', report.counts.matched], ['Amount mismatch', report.counts.mismatch], ['Not in bank', report.counts.notFound]].map(([l, v]) => (
              <div key={String(l)} className="rounded-2xl border border-[#e5e7eb] bg-white p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#697586]">{l}</p>
                <p className="mt-1 text-lg font-bold">{v}</p>
              </div>
            ))}
          </div>
          {report.payments.filter((g: Group) => g.bank.status === 'Amount mismatch' || g.bank.status === 'Not found').length > 0 && (
            <div className={`${card} space-y-2`}>
              <p className="text-sm font-semibold">Payments that do not match the bank</p>
              {report.payments.filter((g: Group) => g.bank.status === 'Amount mismatch' || g.bank.status === 'Not found').map((g: Group) => (
                <div key={g.groupId} className="flex flex-wrap items-center justify-between gap-2 border-t border-[#f0f1f3] pt-2 text-sm">
                  <span><b>{g.lines.map(l => l.name).join(' + ')}</b> · {money(g.total)} · <span className="font-mono text-xs">{g.utr}</span></span>
                  <BankPill g={g} />
                </div>
              ))}
            </div>
          )}
          {report.unclaimed.length > 0 && (
            <div className={`${card} space-y-2`}>
              <p className="text-sm font-semibold">Bank credits nobody has marked yet ({report.unclaimed.length})</p>
              {report.unclaimed.map((u: any) => (
                <div key={u.utr} className="flex flex-wrap items-center justify-between gap-2 border-t border-[#f0f1f3] pt-2 text-sm">
                  <span className="font-mono text-xs">{u.utr}</span>
                  <span className="text-xs text-[#697586]">{u.payer || u.remark || ''} {u.date}</span>
                  <b>{money(u.amount)}</b>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function PaymentMatchingPage({ session }: { session: Session }) {
  const [me, setMe] = useState<Me | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'collect' | 'records' | 'bank'>('collect')
  const [guarantorId, setGuarantorId] = useState('')
  const [date, setDate] = useState('')
  const [tick, setTick] = useState(0)

  useEffect(() => {
    api(session, '/api/payments?view=me').then((d: Me) => {
      setMe(d); setDate(d.saturday)
      setTab(d.access.canMark ? 'collect' : 'records')
      if (d.access.isGuarantor) setGuarantorId(d.access.guarantorId)
    }).catch(e => setError(e instanceof Error ? e.message : 'Could not load'))
  }, [session])

  if (error) return <div className={card}><p className="text-sm text-red-600">{error}</p></div>
  if (!me) return <div className={card}><p className="text-sm text-[#697586]">Loading…</p></div>

  const tabs = [
    ...(me.access.canMark ? [['collect', 'Collect'] as const] : []),
    ['records', me.access.isGuarantor ? 'My payments' : 'Records'] as const,
    ...(me.access.canBank ? [['bank', 'Bank check'] as const] : []),
  ]
  const needsGuarantor = tab !== 'bank' && !me.access.isGuarantor

  return (
    <div className="space-y-4">
      <div className={`${card} space-y-3`}>
        <div>
          <h2 className="text-lg font-bold">{me.access.isGuarantor ? 'UPI Payments' : 'Payment Matching'}</h2>
          <p className="text-xs text-[#697586]">{me.access.isGuarantor ? 'See how each of your customers’ payments was received. View only.' : 'Mark UPI and cash payments by UTR. Each UTR can be used only once.'}</p>
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {tabs.map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${tab === k ? 'bg-[#1a1a2e] text-white' : 'bg-[#f4f5f7] text-[#4b5563]'}`}>{label}</button>
          ))}
        </div>
        {tab !== 'bank' && (
          <div className="grid gap-3 sm:grid-cols-2">
            {needsGuarantor && (
              <select className={input} value={guarantorId} onChange={e => setGuarantorId(e.target.value)}>
                <option value="">{tab === 'records' ? 'All guarantors' : 'Choose guarantor'}</option>
                {me.guarantors.map(g => <option key={g.guarantorId} value={g.guarantorId}>{g.name}{g.code ? ` (${g.code})` : ''}</option>)}
              </select>
            )}
            <div className="flex items-center gap-2">
              <button type="button" aria-label="Previous week" onClick={() => setDate(shiftDate(date, -7))} className="h-11 w-11 shrink-0 rounded-2xl border border-[#e5e7eb] text-lg">‹</button>
              <input type="date" className={input} value={date} onChange={e => e.target.value && setDate(e.target.value)} />
              <button type="button" aria-label="Next week" onClick={() => setDate(shiftDate(date, 7))} className="h-11 w-11 shrink-0 rounded-2xl border border-[#e5e7eb] text-lg">›</button>
            </div>
          </div>
        )}
      </div>

      {tab === 'collect' && me.access.canMark && <CollectTab session={session} me={me} guarantorId={guarantorId} date={date} refreshKey={tick} onChanged={() => setTick(t => t + 1)} />}
      {tab === 'records' && <RecordsTab session={session} me={me} guarantorId={guarantorId} date={date} refreshKey={tick} onChanged={() => setTick(t => t + 1)} />}
      {tab === 'bank' && <BankTab session={session} me={me} />}
    </div>
  )
}
