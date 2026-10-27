'use client'
import { useEffect, useRef, useState } from 'react'
import { Session } from '@/types'
import Pager from '@/components/ui/Pager'

function currency(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

function thisSaturday() {
  const istOffset = 5.5 * 60 * 60 * 1000
  const d = new Date(Date.now() + istOffset)
  const day = d.getUTCDay()
  d.setUTCDate(d.getUTCDate() + (day === 6 ? 0 : 6 - day))
  return d.toISOString().slice(0, 10)
}

type Guarantor = { guarantorId: string; name: string; code: string; phone: string }
type Settlement = {
  'Settlement ID': string; 'Entity ID': string; 'Entity Name': string
  'Saturday Date': string; 'Total Cash Due': string; 'Total UPI Due': string
  'Amount Submitted': string; 'Balance': string; 'Status': string
  'Notes': string; 'Recorded By': string; 'Created At': string
  entityPhone?: string
}
type Transaction = {
  customerName: string
  amount: number
  paymentMode: string
  paidAt: string
}
type StaffBreakdown = {
  collectorUserId: string
  collectorName: string
  collectorCode: string
  collectorRole: string
  cash: number
  upi: number
  transactions: Transaction[]
}
type CollectionSummary = {
  guarantorId: string; guarantorName: string; guarantorCode: string; guarantorPhone: string
  cashDue: number; upiDue: number; totalDue: number; unpaid: number
  staffBreakdown: Map<string, StaffBreakdown>
}

// A summary row from /api/settlements/summary, in the shape the screen uses. The customer-by-customer
// transactions are empty here and filled in only when one guarantor is opened (see openDetail).
type ServerSummary = {
  dueDate: string; guarantorId: string; guarantorName: string; guarantorCode: string; guarantorPhone: string
  totalDue: number; unpaid: number; upiDue: number; cashDue: number
  collectors: { collectorUserId: string; collectorName: string; collectorCode: string; collectorRole: string; cash: number; upi: number }[]
  settlement: Settlement | null
}
function toSummary(x: ServerSummary): CollectionSummary {
  const staffBreakdown = new Map<string, StaffBreakdown>()
  for (const c of x.collectors || []) {
    staffBreakdown.set(c.collectorUserId || '__guarantor__', {
      collectorUserId: c.collectorUserId || '',
      collectorName: c.collectorUserId ? (c.collectorName || 'Unknown') : x.guarantorName,
      collectorCode: c.collectorCode || '',
      collectorRole: c.collectorUserId ? (c.collectorRole || '') : 'Guarantor',
      cash: Number(c.cash) || 0, upi: Number(c.upi) || 0, transactions: [],
    })
  }
  return { guarantorId: x.guarantorId, guarantorName: x.guarantorName, guarantorCode: x.guarantorCode, guarantorPhone: x.guarantorPhone,
    cashDue: x.cashDue, upiDue: x.upiDue, totalDue: x.totalDue, unpaid: x.unpaid, staffBreakdown }
}

export default function SettlementsPage({ session }: { session: Session }) {
  const [tab, setTab] = useState<'today' | 'unsettled' | 'history'>('today')
  const saturday = thisSaturday()

  const [summaries, setSummaries] = useState<CollectionSummary[]>([])
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [loading, setLoading] = useState(true)
  const loadedOnce = useRef(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [detailSummary, setDetailSummary] = useState<CollectionSummary | null>(null)
  const [submitAmount, setSubmitAmount] = useState('')
  const [submitNotes, setSubmitNotes] = useState('')
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())
  const setSaving = (id: string, val: boolean) => setSavingIds(prev => { const s = new Set(prev); val ? s.add(id) : s.delete(id); return s })
  const isSaving = (id: string) => savingIds.has(id)

  const [histLoading, setHistLoading] = useState(false)
  const [allSettlements, setAllSettlements] = useState<Settlement[]>([])   // the opened guarantor's history
  const [guarantors, setGuarantors] = useState<Guarantor[]>([])            // one page of the history guarantor list
  // The server adds the totals up and sends one page at a time
  const [todayPage, setTodayPage] = useState(1)
  const [todayTotal, setTodayTotal] = useState(0)
  const [todayPages, setTodayPages] = useState(1)
  const [guarantorSearch, setGuarantorSearch] = useState('')
  const [unsettledPage, setUnsettledPage] = useState(1)
  const [unsettledMore, setUnsettledMore] = useState(false)
  const [histPage, setHistPage] = useState(1)
  const [histPages, setHistPages] = useState(1)
  const PAGE = 100

  // Unsettled tab state
  const [unsettledLoading, setUnsettledLoading] = useState(false)
  const [unsettledWeeks, setUnsettledWeeks] = useState<Array<{
    saturdayDate: string
    summaries: CollectionSummary[]
    settlements: Settlement[]
  }>>([])


  // Past weeks that still need a settlement, two weeks at a time (the database groups them by guarantor and Saturday); each 'page' is the next two older weeks
  async function loadUnsettled(page = 1) {
    setUnsettledLoading(true)
    try {
      const res = await fetch(`/api/settlements/summary?unsettled=1&before=${saturday}&window=${page - 1}&page=1&pageSize=500&q=${encodeURIComponent(guarantorSearch.trim())}`, { headers: { Authorization: `Bearer ${session.token}` } })
      const json = await res.json()
      const rows: ServerSummary[] = json.success ? json.data.summaries || [] : []
      const byWeek = new Map<string, { saturdayDate: string; summaries: CollectionSummary[]; settlements: Settlement[] }>()
      for (const x of rows) {
        if (!byWeek.has(x.dueDate)) byWeek.set(x.dueDate, { saturdayDate: x.dueDate, summaries: [], settlements: [] })
        const w = byWeek.get(x.dueDate)!
        w.summaries.push(toSummary(x))
        if (x.settlement) w.settlements.push(x.settlement)
      }
      const weeks = Array.from(byWeek.values()).sort((a, b) => b.saturdayDate.localeCompare(a.saturdayDate))
      setUnsettledWeeks(prev => {
        // a week can continue on the next page: add its guarantors to the week already on screen
        const map = new Map((page === 1 ? [] : prev).map(w => [w.saturdayDate, { ...w, summaries: [...w.summaries], settlements: [...w.settlements] }]))
        for (const w of weeks) {
          const have = map.get(w.saturdayDate)
          if (have) { have.summaries.push(...w.summaries); have.settlements.push(...w.settlements) } else map.set(w.saturdayDate, w)
        }
        return Array.from(map.values()).sort((a, b) => b.saturdayDate.localeCompare(a.saturdayDate))
      })
      setUnsettledMore(!!(json.success && json.data.hasMore))
    } catch (e) {
      console.error('Failed to load unsettled:', e)
    } finally {
      setUnsettledLoading(false)
    }
  }

  // History 3-level navigation
  const [histView, setHistView] = useState<{ guarantorId: string; name: string; code: string; phone: string } | null>(null)
  const [histWeekDetail, setHistWeekDetail] = useState<{ settlement: Settlement; summary: CollectionSummary } | null>(null)
  const [histWeekLoading, setHistWeekLoading] = useState(false)


  const [toast, setToast] = useState('')
  function showToast(m: string) { setToast(m); setTimeout(() => setToast(''), 3000) }

  // This Saturday: totals per guarantor with weeks due, searched and paged by the server
  async function loadToday(page = todayPage) {
    if (!loadedOnce.current) setLoading(true)
    const res = await fetch(`/api/settlements/summary?saturday=${saturday}&page=${page}&pageSize=${PAGE}&q=${encodeURIComponent(guarantorSearch.trim())}`, { headers: { Authorization: `Bearer ${session.token}` } })
    const json = await res.json()
    const rows: ServerSummary[] = json.success ? json.data.summaries || [] : []
    setSummaries(rows.map(toSummary))
    setSettlements(rows.map(x => x.settlement).filter(Boolean) as Settlement[])
    if (json.success) { setTodayTotal(json.data.total); setTodayPages(json.data.totalPages) }
    loadedOnce.current = true
    setLoading(false)
  }

  // The customer-by-customer lines of one guarantor and week, loaded only when that guarantor is opened
  async function loadTransactions(summary: CollectionSummary, satDate: string): Promise<CollectionSummary> {
    const res = await fetch(`/api/settlements/due?saturday=${satDate}&guarantorId=${encodeURIComponent(summary.guarantorId)}`, { headers: { Authorization: `Bearer ${session.token}` } })
    const json = await res.json()
    const lines: any[] = json.success ? json.data || [] : []
    const sb = new Map<string, StaffBreakdown>()
    for (const [k, v] of summary.staffBreakdown) sb.set(k, { ...v, transactions: [] })
    for (const r of lines) {
      if (r.status !== 'Paid') continue
      const key = r.collectorUserId || '__guarantor__'
      const entry: StaffBreakdown = sb.get(key) || { collectorUserId: r.collectorUserId || '', collectorName: r.collectorUserId ? (r.collectorName || 'Unknown') : summary.guarantorName, collectorCode: r.collectorCode || '', collectorRole: r.collectorUserId ? (r.collectorRole || '') : 'Guarantor', cash: 0, upi: 0, transactions: [] }
      entry.transactions.push({ customerName: r.customerName || 'Unknown Customer', amount: Number(r.amount) || 0, paymentMode: r.paymentMode || 'Cash', paidAt: r.paidAt || r.updatedAt || r.createdAt || '' })
      sb.set(key, entry)
    }
    return { ...summary, staffBreakdown: sb }
  }
  async function openDetail(summary: CollectionSummary) {
    setDetailSummary(await loadTransactions(summary, saturday))
  }

  // History: first the guarantors (one page, searchable), then one guarantor's weeks when opened
  async function loadHistory(page = histPage) {
    setHistLoading(true)
    const res = await fetch(`/api/settlements?guarantorList=1&page=${page}&pageSize=50&q=${encodeURIComponent(guarantorSearch.trim())}`, { headers: { Authorization: `Bearer ${session.token}` } })
    const json = await res.json()
    setGuarantors(json.success ? json.data.guarantors || [] : [])
    if (json.success) setHistPages(json.data.totalPages)
    setHistLoading(false)
  }
  async function loadGuarantorHistory(guarantorId: string) {
    setHistLoading(true)
    const res = await fetch(`/api/settlements?entityId=${encodeURIComponent(guarantorId)}&pageSize=200`, { headers: { Authorization: `Bearer ${session.token}` } })
    const json = await res.json()
    setAllSettlements(json.success ? json.data.settlements || [] : [])
    setHistLoading(false)
  }

  // a new search starts again at page 1; it is sent to the server after a short pause
  useEffect(() => { setTodayPage(1); setUnsettledPage(1); setHistPage(1) }, [guarantorSearch, tab])
  useEffect(() => {
    const t = setTimeout(() => {
      if (tab === 'today') loadToday(todayPage)
      else if (tab === 'unsettled') loadUnsettled(unsettledPage)
      else if (tab === 'history' && !histView) loadHistory(histPage)
    }, guarantorSearch ? 300 : 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, todayPage, unsettledPage, histPage, guarantorSearch])

  async function recordSettlement(guarantorId: string, guarantorName: string, cashDue: number, upiDue: number) {
    setSaving(guarantorId, true)
    const res = await fetch('/api/settlements', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entityType: 'Guarantor', entityId: guarantorId, entityName: guarantorName,
        saturdayDate: saturday, totalCashDue: cashDue, totalUpiDue: upiDue,
        amountSubmitted: Number(submitAmount) || 0, notes: submitNotes,
        recordedBy: session.userId,
      }),
    })
    const json = await res.json()
    if (json.success) {
      showToast('✓ Settlement recorded.')
      setOpenId(null); setSubmitAmount(''); setSubmitNotes('')
      setAllSettlements([])
      await loadToday()
    } else {
      showToast('Failed to record. Please try again.')
    }
    setSaving(guarantorId, false)
  }

  async function settleNow(guarantorId: string, guarantorName: string, upiDue: number, satDate: string = saturday) {
    setSaving(guarantorId, true)
    const res = await fetch('/api/settlements', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entityType: 'Guarantor', entityId: guarantorId, entityName: guarantorName,
        saturdayDate: satDate, totalCashDue: 0, totalUpiDue: upiDue,
        amountSubmitted: upiDue, notes: 'Auto-settled: cash due is ₹0',
        recordedBy: session.userId,
      }),
    })
    const json = await res.json()
    if (json.success && json.data?.success !== false) {
      showToast('✓ Settled successfully.')
      setAllSettlements([])
      await loadToday()
      if (tab === 'unsettled') { setUnsettledPage(1); await loadUnsettled(1) }
    } else {
      const errMsg = json.error || json.data?.error || 'Unknown error'
      showToast(`Failed: ${errMsg}`)
    }
    setSaving(guarantorId, false)
  }

  const getSettlement = (gId: string) => settlements.find(s => s['Entity ID'] === gId)

  // the guarantors on this page of the list, and the opened guarantor's weeks (oldest first, as before)
  const histGuarantors = guarantors
  const getGuarantorHistory = (gId: string) =>
    allSettlements
      .filter(s => s['Entity ID'] === gId)
      .sort((a, b) => a['Saturday Date'].localeCompare(b['Saturday Date']))

  async function loadHistWeekDetail(stl: Settlement) {
    setHistWeekLoading(true)
    const repRes = await fetch(`/api/settlements/due?saturday=${stl['Saturday Date']}&guarantorId=${encodeURIComponent(stl['Entity ID'])}`, {
      headers: { Authorization: `Bearer ${session.token}` },
    })
    const repJson = await repRes.json()
    const repayments = repJson.success ? repJson.data || [] : []

    const gId = stl['Entity ID']
    const g = histView!
    const summary: CollectionSummary = {
      guarantorId: gId, guarantorName: g.name, guarantorCode: g.code, guarantorPhone: g.phone,
      cashDue: 0, upiDue: 0, totalDue: 0, unpaid: 0,
      staffBreakdown: new Map(),
    }

    for (const r of repayments) {
      if (r.guarantorId !== gId) continue
      const amt = Number(r.amount) || 0
      const isPaid = r.status === 'Paid'
      const mode = (r.paymentMode || '').toLowerCase()
      const isUpi = mode.includes('upi') || mode.includes('qr') || mode.includes('bank')

      summary.totalDue += amt
      if (!isPaid) {
        summary.unpaid += amt
      } else {
        const collectorKey = r.collectorUserId || '__guarantor__'
        if (!summary.staffBreakdown.has(collectorKey)) {
          summary.staffBreakdown.set(collectorKey, {
            collectorUserId: r.collectorUserId || '',
            collectorName: r.collectorUserId ? (r.collectorName || 'Unknown') : g.name,
            collectorCode: r.collectorCode || '',
            collectorRole: r.collectorUserId ? (r.collectorRole || '') : 'Guarantor',
            cash: 0, upi: 0, transactions: [],
          })
        }
        const sb = summary.staffBreakdown.get(collectorKey)!
        if (isUpi) { sb.upi += amt; summary.upiDue += amt }
        else { sb.cash += amt }
        sb.transactions.push({
          customerName: r.customerName || 'Unknown Customer',
          amount: amt,
          paymentMode: r.paymentMode || 'Cash',
          paidAt: r.paidAt || r.updatedAt || r.createdAt || '',
        })
        if (!isUpi && (!r.collectorUserId || r.collectorRole === 'Guarantor')) {
          summary.cashDue += amt
        }
      }
    }

    setHistWeekDetail({ settlement: stl, summary })
    setHistWeekLoading(false)
  }

  const roleOrder = ['Guarantor', 'NGF AGENT', 'Admin', 'Other']
  const roleLabel: Record<string, string> = {
    'Guarantor': 'Guarantor', 'NGF AGENT': 'NGF AGENT', 'Admin': 'Admin', 'Other': 'Branch/Staff',
  }
  const roleBadge: Record<string, string> = {
    'Guarantor': 'bg-blue-100 text-blue-700', 'NGF AGENT': 'bg-purple-100 text-purple-700',
    'Admin': 'bg-orange-100 text-orange-700', 'Other': 'bg-gray-100 text-gray-600',
  }

  function renderCollectorTable(summary: CollectionSummary) {
    const allCollectors = Array.from(summary.staffBreakdown.values())
    const sorted = [...allCollectors].sort((a, b) => {
      const ai = roleOrder.indexOf(a.collectorRole) === -1 ? 99 : roleOrder.indexOf(a.collectorRole)
      const bi = roleOrder.indexOf(b.collectorRole) === -1 ? 99 : roleOrder.indexOf(b.collectorRole)
      return ai - bi
    })
    const totalUpi = allCollectors.reduce((a, b) => a + b.upi, 0)
    return (
      <div className="rounded-[1.6rem] border border-line bg-white overflow-hidden shadow-sm">
        <div className="grid grid-cols-2 divide-x divide-line border-b border-line">
          <div className="p-5">
            <p className="text-xs text-soft mb-1">Total Collection</p>
            <p className="text-2xl font-bold text-ink">{currency(summary.totalDue)}</p>
          </div>
          <div className="p-5">
            <p className="text-xs text-soft mb-1">Balance to Collect / Unpaid</p>
            <p className={`text-2xl font-bold ${summary.unpaid > 0 ? 'text-red-600' : 'text-green-600'}`}>{currency(summary.unpaid)}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 divide-x divide-line border-b border-line bg-panel">
          <div className="p-4 text-center">
            <p className="text-xs text-soft mb-1">Cash Due</p>
            <p className="text-lg font-bold text-ink">{currency(summary.cashDue)}</p>
          </div>
          <div className="p-4 text-center">
            <p className="text-xs text-soft mb-1">UPI / QR</p>
            <p className="text-lg font-bold text-ink">{currency(totalUpi)}</p>
          </div>
          <div className="p-4 text-center">
            <p className="text-xs text-soft mb-1">Not Paid</p>
            <p className={`text-lg font-bold ${summary.unpaid > 0 ? 'text-red-600' : 'text-soft'}`}>{currency(summary.unpaid)}</p>
          </div>
        </div>
        {sorted.length === 0 ? (
          <p className="p-6 text-sm text-center text-soft">No payment breakdown available.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  {sorted.map(sb => (
                    <th key={sb.collectorUserId || sb.collectorName}
                      className="px-4 py-3 text-left bg-mist border-b border-r border-line last:border-r-0 min-w-[150px] align-top">
                      <p className="text-sm font-bold text-ink leading-tight">{sb.collectorName}</p>
                      {sb.collectorCode && <p className="text-xs text-soft font-normal mt-0.5">{sb.collectorCode}</p>}
                      <span className={`inline-block mt-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${roleBadge[sb.collectorRole] ?? roleBadge['Other']}`}>
                        {roleLabel[sb.collectorRole] ?? 'Staff'}
                      </span>
                      <div className="mt-2 pt-2 border-t border-line">
                        <div className="flex items-end gap-5">
                          <div>
                            <p className="text-[10px] text-soft uppercase tracking-wide mb-1">Total</p>
                            <p className="font-bold text-base text-ink">{currency(sb.cash + sb.upi)}</p>
                          </div>
                          <div className="flex gap-4 pb-px">
                            <div>
                              <p className="text-[10px] text-soft uppercase tracking-wide mb-1">Cash</p>
                              <p className={`text-sm font-bold ${sb.cash > 0 ? 'text-ink' : 'text-gray-400'}`}>{currency(sb.cash)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-soft uppercase tracking-wide mb-1">UPI / QR</p>
                              <p className={`text-sm font-bold ${sb.upi > 0 ? 'text-ink' : 'text-gray-400'}`}>{currency(sb.upi)}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {sorted.map(sb => (
                    <td key={sb.collectorUserId || sb.collectorName}
                      className="px-0 border-r border-line last:border-r-0 align-top">
                      {sb.transactions.length === 0 ? (
                        <p className="px-4 py-3 text-xs text-gray-400">No transactions</p>
                      ) : (
                        <div className="divide-y divide-mist">
                          {sb.transactions.map((tx, i) => {
                            const isUpi = tx.paymentMode.toLowerCase().includes('upi') || tx.paymentMode.toLowerCase().includes('qr') || tx.paymentMode.toLowerCase().includes('bank')
                            return (
                              <div key={i} className="px-4 py-3">
                                <p className="text-sm font-semibold text-ink leading-tight">{tx.customerName}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${isUpi ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                                    {tx.paymentMode}
                                  </span>
                                  <span className="text-sm font-bold text-ink">{currency(tx.amount)}</span>
                                </div>
                                {tx.paidAt && (
                                  <p className="text-[10px] text-gray-400 mt-1">
                                    {new Date(tx.paidAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                  </p>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  function renderHistory() {
    if (histLoading) return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-ink border-t-transparent" />
      </div>
    )

    // Level 3: Week detail
    if (histWeekDetail) {
      const { settlement: wstl, summary: ws } = histWeekDetail
      return (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setHistWeekDetail(null)}
              className="rounded-2xl border border-line bg-white px-4 py-2 text-sm font-semibold flex items-center gap-1.5 hover:bg-mist transition">
              ← Back
            </button>
            <div>
              <p className="font-bold text-base text-ink">{ws.guarantorName}</p>
              <p className="text-xs text-soft">{ws.guarantorCode} &bull; {wstl['Saturday Date']}</p>
            </div>
          </div>
          {renderCollectorTable(ws)}
          <div className="rounded-[1.6rem] border border-line bg-white p-5 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-soft">Settlement Record</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-mist p-3 text-center">
                <p className="text-xs text-soft mb-1">Submitted</p>
                <p className="font-bold text-sm">{currency(Number(wstl['Amount Submitted']))}</p>
              </div>
              <div className="rounded-xl bg-mist p-3 text-center">
                <p className="text-xs text-soft mb-1">Balance</p>
                <p className={`font-bold text-sm ${Number(wstl['Balance']) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {currency(Number(wstl['Balance']))}
                </p>
              </div>
              <div className="rounded-xl bg-mist p-3 text-center">
                <p className="text-xs text-soft mb-1">Status</p>
                <p className={`font-bold text-sm ${wstl['Status'] === 'Settled' ? 'text-green-700' : 'text-amber-600'}`}>
                  {wstl['Status']}
                </p>
              </div>
            </div>
            {wstl['Notes'] && <p className="text-xs text-soft pt-1">{wstl['Notes']}</p>}
            <p className="text-xs text-soft">Recorded by {wstl['Recorded By']} &bull; {wstl['Created At']?.slice(0, 16)}</p>
          </div>
        </div>
      )
    }

    // Level 2: Week cards for selected guarantor
    if (histView) {
      const weeks = getGuarantorHistory(histView.guarantorId)
      return (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setHistView(null)}
              className="rounded-2xl border border-line bg-white px-4 py-2 text-sm font-semibold flex items-center gap-1.5 hover:bg-mist transition">
              ← Back
            </button>
            <div>
              <p className="font-bold text-base text-ink">{histView.name}</p>
              <p className="text-xs text-soft">{histView.code} &bull; {histView.phone}</p>
            </div>
          </div>
          {weeks.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line bg-white p-8 text-center text-sm text-soft">
              No settlements found for this guarantor.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {weeks.map(stl => {
                const isSettled = stl['Status'] === 'Settled'
                const balance = Number(stl['Balance'])
                const satDate = new Date(stl['Saturday Date'])
                return (
                  <div key={stl['Settlement ID']} className="rounded-2xl border border-white/70 bg-white px-4 py-3 shadow-panel space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="shrink-0 rounded-xl bg-mist px-3 py-2 text-center">
                          <p className="text-[10px] text-soft leading-none uppercase">
                            {satDate.toLocaleDateString('en-IN', { month: 'short' })}
                          </p>
                          <p className="font-bold text-lg text-ink leading-none mt-0.5">
                            {satDate.getDate()}
                          </p>
                          <p className="text-[10px] text-soft leading-none mt-0.5">
                            {satDate.getFullYear()}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-semibold leading-tight">{stl['Saturday Date']}</p>
                          <p className="text-xs text-soft">Submitted: {currency(Number(stl['Amount Submitted']))}</p>
                        </div>
                      </div>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold shrink-0 ${isSettled ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                        {stl['Status']}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-mist px-2 py-2">
                      <div className="text-center">
                        <p className="text-[10px] text-soft">Cash Due</p>
                        <p className="font-semibold text-xs">{currency(Number(stl['Total Cash Due']))}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-soft">Balance</p>
                        <p className={`font-semibold text-xs ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>{currency(balance)}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => loadHistWeekDetail(stl)}
                      disabled={histWeekLoading}
                      className="w-full rounded-xl border border-line bg-mist px-3 py-1.5 text-xs font-semibold text-soft hover:bg-ink hover:text-white transition disabled:opacity-50">
                      {histWeekLoading ? 'Loading...' : 'View'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )
    }

    // Level 1: Guarantor cards
    if (histGuarantors.length === 0) return (
      <div className="space-y-3">
        <input value={guarantorSearch} onChange={e => setGuarantorSearch(e.target.value)} placeholder="Search guarantor name or code…" data-no-upper
          className="w-full max-w-sm rounded-2xl border border-line bg-white px-4 py-2.5 text-sm outline-none focus:border-ink" />
        <p className="rounded-2xl border border-dashed border-line bg-white p-8 text-center text-sm text-soft">
          {histLoading ? 'Loading…' : 'No guarantors found.'}
        </p>
      </div>
    )
    return (
      <div className="space-y-3">
      <input value={guarantorSearch} onChange={e => setGuarantorSearch(e.target.value)} placeholder="Search guarantor name or code…" data-no-upper
        className="w-full max-w-sm rounded-2xl border border-line bg-white px-4 py-2.5 text-sm outline-none focus:border-ink" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {histGuarantors.map(g => {
          return (
            <div key={g.guarantorId} className="rounded-2xl border border-white/70 bg-white px-4 py-3 shadow-panel space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold leading-tight">{g.name}</p>
                  <p className="text-xs text-soft">{g.code} &bull; {g.phone}</p>
                </div>
              </div>
              <button
                onClick={() => { setHistView(g); setHistWeekDetail(null); setAllSettlements([]); loadGuarantorHistory(g.guarantorId) }}
                className="w-full rounded-xl border border-line bg-mist px-3 py-1.5 text-xs font-semibold text-soft hover:bg-ink hover:text-white transition">
                View
              </button>
            </div>
          )
        })}
      </div>
      <Pager page={histPage} totalPages={histPages} total={histPages * 50} noun="guarantors" pageSize={50} onPage={setHistPage} />
      </div>
    )
  }

  if (detailSummary) {
    const stl = getSettlement(detailSummary.guarantorId)
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setDetailSummary(null)}
            className="rounded-2xl border border-line bg-white px-4 py-2 text-sm font-semibold flex items-center gap-1.5 hover:bg-mist transition">
            ← Back
          </button>
          <div>
            <p className="font-bold text-base text-ink">{detailSummary.guarantorName}</p>
            <p className="text-xs text-soft">{detailSummary.guarantorCode} &bull; {saturday}</p>
          </div>
        </div>
        {renderCollectorTable(detailSummary)}
        {stl && (
          <div className="rounded-[1.6rem] border border-line bg-white p-5 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-soft">Settlement Record</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-mist p-3 text-center">
                <p className="text-xs text-soft mb-1">Submitted</p>
                <p className="font-bold text-sm">{currency(Number(stl['Amount Submitted']))}</p>
              </div>
              <div className="rounded-xl bg-mist p-3 text-center">
                <p className="text-xs text-soft mb-1">Balance</p>
                <p className={`font-bold text-sm ${Number(stl['Balance']) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {currency(Number(stl['Balance']))}
                </p>
              </div>
              <div className="rounded-xl bg-mist p-3 text-center">
                <p className="text-xs text-soft mb-1">Status</p>
                <p className={`font-bold text-sm ${stl['Status'] === 'Settled' ? 'text-green-700' : 'text-amber-600'}`}>
                  {stl['Status']}
                </p>
              </div>
            </div>
            {stl['Notes'] && <p className="text-xs text-soft pt-1">{stl['Notes']}</p>}
            <p className="text-xs text-soft">Recorded by {stl['Recorded By']} &bull; {stl['Created At']?.slice(0, 16)}</p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {toast && (
        <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-2xl bg-ink px-5 py-3 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={() => setTab('today')}
          className={`rounded-2xl px-5 py-2.5 text-sm font-semibold transition ${tab === 'today' ? 'bg-ink text-white' : 'border border-line bg-white text-soft'}`}>
          This Saturday
        </button>
        <button onClick={() => setTab('unsettled')}
          className={`rounded-2xl px-5 py-2.5 text-sm font-semibold transition ${tab === 'unsettled' ? 'bg-ink text-white' : 'border border-line bg-white text-soft'}`}>
          Unsettled
        </button>
        <button onClick={() => setTab('history')}
          className={`rounded-2xl px-5 py-2.5 text-sm font-semibold transition ${tab === 'history' ? 'bg-ink text-white' : 'border border-line bg-white text-soft'}`}>
          History
        </button>
      </div>

      {(tab === 'today' || tab === 'unsettled') && (
        <input value={guarantorSearch} onChange={e => setGuarantorSearch(e.target.value)} placeholder="Search guarantor name or code…" data-no-upper
          className="w-full max-w-sm rounded-2xl border border-line bg-white px-4 py-2.5 text-sm outline-none focus:border-ink" />
      )}
      {tab === 'today' && (
        <p className="text-sm text-soft">
          Showing settlements for <span className="font-semibold text-ink">{saturday}</span>
        </p>
      )}

      {tab === 'unsettled' && (
        <p className="text-sm text-soft">
          Showing all past weeks with missed or partial settlements.
        </p>
      )}

      {/* TODAY TAB */}
      {tab === 'today' && (
        loading ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-ink border-t-transparent" />
          </div>
        ) : summaries.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line bg-white p-8 text-center text-sm text-soft">
            No collections found for this Saturday.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {summaries.map(s => {
              const stl = getSettlement(s.guarantorId)
              const isSettled = stl?.['Status'] === 'Settled'
              const balance = stl ? Number(stl['Balance']) : s.cashDue
              return (
                <div key={s.guarantorId} className="rounded-2xl border border-white/70 bg-white px-4 py-3 shadow-panel space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold leading-tight">{s.guarantorName}</p>
                      <p className="text-xs text-soft">{s.guarantorCode} &bull; {s.guarantorPhone}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold shrink-0 ${isSettled ? 'bg-green-100 text-green-700' : stl ? 'bg-amber-100 text-amber-700' : 'bg-mist text-soft'}`}>
                      {isSettled ? 'Settled' : stl ? 'Partial' : 'Pending'}
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5 rounded-xl bg-mist px-2 py-2">
                    <div className="text-center">
                      <p className="text-[10px] text-soft">Cash Due</p>
                      <p className="font-semibold text-xs">{currency(s.cashDue)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-soft">UPI / QR</p>
                      <p className="font-semibold text-xs">{currency(s.upiDue)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-soft">Collection</p>
                      <p className="font-semibold text-xs text-green-700">{currency(s.totalDue)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-soft">Unpaid</p>
                      <p className={`font-semibold text-xs ${s.unpaid > 0 ? 'text-red-600' : 'text-soft'}`}>{currency(s.unpaid)}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => openDetail(s)}
                    className="w-full rounded-xl border border-line bg-mist px-3 py-1.5 text-xs font-semibold text-soft hover:bg-ink hover:text-white transition">
                    View Details
                  </button>

                  {stl && (
                    <div className="rounded-xl bg-mist px-3 py-2 text-xs space-y-1">
                      <div className="flex justify-between">
                        <span className="text-soft">Submitted</span>
                        <span className="font-semibold">{currency(Number(stl['Amount Submitted']))}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-soft">Balance</span>
                        <span className={`font-semibold ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>{currency(balance)}</span>
                      </div>
                      {stl['Notes'] && <p className="text-[10px] text-soft">{stl['Notes']}</p>}
                      <p className="text-[10px] text-soft">Recorded: {stl['Created At']?.slice(0, 16)}</p>
                    </div>
                  )}

                  {!isSettled && (
                    openId === s.guarantorId ? (
                      <div className="space-y-2 rounded-xl border border-line p-3">
                        <input
                          type="number" placeholder="Amount submitted"
                          value={submitAmount} onChange={e => setSubmitAmount(e.target.value)}
                          className="w-full rounded-xl border border-line px-3 py-2 text-xs outline-none focus:border-ink"
                        />
                        <textarea
                          placeholder="Notes (optional)" value={submitNotes}
                          onChange={e => setSubmitNotes(e.target.value)} rows={2}
                          className="w-full rounded-xl border border-line px-3 py-2 text-xs outline-none focus:border-ink resize-none"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => recordSettlement(s.guarantorId, s.guarantorName, s.cashDue, s.upiDue)}
                            disabled={isSaving(s.guarantorId)}
                            className="flex-1 rounded-xl bg-ink px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
                            {isSaving(s.guarantorId) ? 'Saving...' : 'Record'}
                          </button>
                          <button onClick={() => setOpenId(null)}
                            className="rounded-xl border border-line px-3 py-2 text-xs font-semibold text-soft">
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        {s.cashDue > 0 && (
                          <button
                            onClick={() => { setOpenId(s.guarantorId); setSubmitAmount(''); setSubmitNotes('') }}
                            className="flex-1 rounded-xl border border-line bg-mist px-3 py-1.5 text-xs font-semibold text-ink hover:bg-ink hover:text-white transition">
                            Record Cash Submission
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (s.cashDue > 0) {
                              showToast(`Cash due ₹${s.cashDue.toLocaleString('en-IN')} is still pending`)
                            } else {
                              settleNow(s.guarantorId, s.guarantorName, s.upiDue)
                            }
                          }}
                          disabled={isSaving(s.guarantorId)}
                          className={`flex-1 rounded-xl px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${s.cashDue === 0 ? 'bg-green-600 text-white hover:bg-green-700' : 'border border-line bg-mist text-gray-400'}`}>
                          {isSaving(s.guarantorId) ? 'Settling...' : s.cashDue === 0 ? 'Settle' : 'Settle (Cash Due Pending)'}
                        </button>
                      </div>
                    )
                  )}
                </div>
              )
            })}
          </div>
        )
      )}


      {tab === 'today' && <Pager page={todayPage} totalPages={todayPages} total={todayTotal} noun="guarantors" pageSize={PAGE} onPage={setTodayPage} />}

      {/* UNSETTLED TAB */}
      {tab === 'unsettled' && (
        unsettledLoading ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-ink border-t-transparent" />
          </div>
        ) : unsettledWeeks.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line bg-white p-8 text-center text-sm text-soft">
            No missed or partial settlements in past weeks.
          </p>
        ) : (
          <div className="space-y-4">
            {unsettledWeeks.map(week => (
              <div key={week.saturdayDate} className="rounded-2xl border border-white/70 bg-white p-4 shadow-panel space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      Week of {new Date(week.saturdayDate).toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                    <p className="text-xs text-soft">
                      {week.summaries.length} guarantor{week.summaries.length !== 1 ? 's' : ''} with missed or partial settlements
                    </p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {week.summaries.map(s => {
                    const stl = week.settlements.find(stl => stl['Entity ID'] === s.guarantorId)
                    const isSettled = stl?.['Status'] === 'Settled'
                    const balance = stl ? Number(stl['Balance']) : s.cashDue
                    return (
                      <div key={s.guarantorId} className="rounded-2xl border border-white/70 bg-white px-4 py-3 shadow-panel space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold leading-tight">{s.guarantorName}</p>
                            <p className="text-xs text-soft">{s.guarantorCode} &bull; {s.guarantorPhone}</p>
                          </div>
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold shrink-0 ${s.unpaid > 0 ? 'bg-red-100 text-red-700' : balance > 0 ? 'bg-amber-100 text-amber-700' : 'bg-mist text-soft'}`}>
                            {s.unpaid > 0 ? 'Unpaid' : balance > 0 ? 'Partial' : 'Missed'}
                          </span>
                        </div>

                        <div className="grid grid-cols-4 gap-1.5 rounded-xl bg-mist px-2 py-2">
                          <div className="text-center">
                            <p className="text-[10px] text-soft">Cash Due</p>
                            <p className="font-semibold text-xs">{currency(s.cashDue)}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-[10px] text-soft">UPI / QR</p>
                            <p className="font-semibold text-xs">{currency(s.upiDue)}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-[10px] text-soft">Total Due</p>
                            <p className="font-semibold text-xs text-green-700">{currency(s.totalDue)}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-[10px] text-soft">Unpaid</p>
                            <p className={`font-semibold text-xs ${s.unpaid > 0 ? 'text-red-600' : 'text-soft'}`}>{currency(s.unpaid)}</p>
                          </div>
                        </div>

                        {stl && (
                          <div className="rounded-xl bg-mist px-3 py-2 text-xs space-y-1">
                            <div className="flex justify-between">
                              <span className="text-soft">Submitted</span>
                              <span className="font-semibold">{currency(Number(stl['Amount Submitted']))}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-soft">Balance</span>
                              <span className={`font-semibold ${Number(stl['Balance']) > 0 ? 'text-red-600' : 'text-green-600'}`}>{currency(Number(stl['Balance']))}</span>
                            </div>
                            {stl['Notes'] && <p className="text-[10px] text-soft">{stl['Notes']}</p>}
                            <p className="text-[10px] text-soft">Recorded: {stl['Created At']?.slice(0, 16)}</p>
                          </div>
                        )}

                        {!isSettled && (
                          <div className="flex gap-2">
                            {s.cashDue > 0 && (
                              <button
                                onClick={() => { setOpenId(s.guarantorId); setSubmitAmount(''); setSubmitNotes('') }}
                                className="flex-1 rounded-xl border border-line bg-mist px-3 py-1.5 text-xs font-semibold text-ink hover:bg-ink hover:text-white transition">
                                  Record Cash Submission
                                </button>
                              )}
                            <button
                              onClick={() => {
                                if (s.cashDue > 0) {
                                  showToast(`Cash due ₹${s.cashDue.toLocaleString('en-IN')} is still pending`)
                                } else {
                                  settleNow(s.guarantorId, s.guarantorName, s.upiDue, week.saturdayDate)
                                }
                              }}
                              disabled={isSaving(s.guarantorId)}
                              className={`flex-1 rounded-xl px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${s.cashDue === 0 ? 'bg-green-600 text-white hover:bg-green-700' : 'border border-line bg-mist text-gray-400'}`}>
                              {isSaving(s.guarantorId) ? 'Settling...' : s.cashDue === 0 ? 'Settle' : 'Settle (Cash Due Pending)'}
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'unsettled' && unsettledMore && (
        <button onClick={() => setUnsettledPage(p => p + 1)} className="rounded-2xl border border-line bg-white px-5 py-2.5 text-sm font-semibold">Load two older weeks</button>
      )}

      {/* HISTORY TAB */}
      {tab === 'history' && renderHistory()}
    </div>
  )
}
