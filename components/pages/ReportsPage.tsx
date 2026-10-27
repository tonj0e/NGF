'use client'
import { useEffect, useState } from 'react'
import { Session } from '@/types'
import Pager from '@/components/ui/Pager'

function currency(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}
function monthLabel(ym: string) {
  const [y, m] = ym.split('-')
  return new Date(Number(y), Number(m) - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
}
function statusColor(s: string) {
  if (s === 'Paid') return 'bg-green-100 text-green-700'
  if (s === 'Delayed') return 'bg-amber-100 text-amber-700'
  if (s === 'Waived') return 'bg-purple-100 text-purple-700'
  if (s === 'Overdue' || s === 'Pending') return 'bg-red-100 text-red-700'
  return 'bg-mist text-soft'
}

type Tab = 'summary' | 'transactions' | 'customers' | 'guarantors'

// A debounced copy of a value (used for the search boxes: the server is asked after a short pause)
function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t) }, [value, ms])
  return v
}

// The customers a guarantor's settlement covered that week: loaded only when "Show customers" is pressed
function SubmissionCustomers({ session, settlement, guarantorUserId }: { session: Session; settlement: any; guarantorUserId: string | null }) {
  const [rows, setRows] = useState<any[] | null>(null)
  const [busy, setBusy] = useState(false)
  async function load() {
    setBusy(true)
    const j = await fetch(`/api/settlements/due?saturday=${settlement['Saturday Date']}&guarantorId=${encodeURIComponent(settlement['Entity ID'])}`, { headers: { Authorization: `Bearer ${session.token}` } }).then(r => r.json()).catch(() => null)
    // only the weeks the guarantor collected themselves (or nobody recorded)
    setRows(j?.success ? (j.data || []).filter((x: any) => !x.collectorUserId || x.collectorUserId === guarantorUserId) : [])
    setBusy(false)
  }
  if (!rows) return <button onClick={load} disabled={busy} className="mt-1.5 ml-3 text-[10px] font-semibold text-green-700 underline disabled:opacity-50">{busy ? 'Loading…' : 'Show customers'}</button>
  return (
    <div className="mt-1.5 ml-3 border-l-2 border-green-100 pl-3 space-y-1">
      {rows.length === 0 && <p className="text-[10px] text-soft">No customer lines.</p>}
      {rows.map((r: any) => (
        <div key={r.repaymentId} className="flex items-center justify-between text-[10px]">
          <span className="text-soft">{r.customerName} · <span className="font-mono">{r.loanId}</span> · Due: {r.dueDate}{r.status === 'Paid' && <span className="ml-1 text-green-600">✓</span>}</span>
          <span className="text-green-700 font-semibold shrink-0">+{currency(Number(r.amount))}</span>
        </div>
      ))}
    </div>
  )
}

export default function ReportsPage({ session }: { session: Session }) {
  const auth = { headers: { Authorization: `Bearer ${session.token}` } }
  const [tab, setTab] = useState<Tab>('summary')
  const [loading, setLoading] = useState(true)
  const [summaryData, setSummaryData] = useState<any>(null)
  const [months, setMonths] = useState<{ ym: string; credit: number; txCount: number; debit: number }[]>([])

  // Drill-down states
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null)
  const [selectedGuarantor, setSelectedGuarantor] = useState<any | null>(null)
  const [yearFilter, setYearFilter] = useState<string>('')
  const [txSearch, setTxSearch] = useState('')
  const [gSearch, setGSearch] = useState('')
  const [custTab, setCustTab] = useState<'chart' | 'transactions' | 'history'>('chart')

  // One month: totals from the database, then each list one page at a time
  const [monthTotals, setMonthTotals] = useState<any>(null)
  const [monthLoans, setMonthLoans] = useState<{ rows: any[]; total: number; page: number }>({ rows: [], total: 0, page: 1 })
  const [monthComm, setMonthComm] = useState<{ rows: any[]; total: number; page: number }>({ rows: [], total: 0, page: 1 })   // commission settlements (debit)
  const [monthSubs, setMonthSubs] = useState<{ rows: any[]; total: number; page: number }>({ rows: [], total: 0, page: 1 })   // guarantor collection submissions (credit)
  const [monthStaff, setMonthStaff] = useState<{ rows: any[]; total: number; page: number }>({ rows: [], total: 0, page: 1 })  // collected by admin / staff / agents (credit)
  const [guarantorUsers, setGuarantorUsers] = useState<Record<string, string>>({})   // guarantor id -> user id, for the weeks they collected themselves
  const PAGE = 100

  // Customers and guarantors: one searched page at a time, with their small stat blocks
  const custQ = useDebounced(txSearch), gQ = useDebounced(gSearch)
  const [custPage, setCustPage] = useState(1)
  const [custList, setCustList] = useState<{ rows: any[]; total: number; totalPages: number; cards: Record<string, any> }>({ rows: [], total: 0, totalPages: 1, cards: {} })
  const [gPage, setGPage] = useState(1)
  const [gList, setGList] = useState<{ rows: any[]; total: number; totalPages: number; cards: Record<string, any> }>({ rows: [], total: 0, totalPages: 1, cards: {} })
  const [custLoans, setCustLoans] = useState<any[]>([])
  const [custReps, setCustReps] = useState<any[]>([])
  const [gDetail, setGDetail] = useState<{ loans: any[]; loanTotal: number; loanPage: number; settlements: any[]; card: any }>({ loans: [], loanTotal: 0, loanPage: 1, settlements: [], card: null })
  const [detailLoading, setDetailLoading] = useState(false)

  // Summary and the month list load first
  useEffect(() => {
    Promise.all([
      fetch('/api/reports?view=summary', auth).then(r => r.json()),
      fetch('/api/reports?view=months', auth).then(r => r.json()),
    ]).then(([sR, mR]) => {
      if (sR.success) setSummaryData(sR.data)
      if (mR.success) {
        setMonths(mR.data.months)
        setYearFilter(prev => prev || (mR.data.months[0]?.ym || '').slice(0, 4) || new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 4))
      }
    }).catch(() => {}).finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A month opens: its totals and the first page of each list
  useEffect(() => {
    if (!selectedMonth) return
    const [y, m] = selectedMonth.split('-').map(Number)
    const from = `${selectedMonth}-01`, to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
    setMonthTotals(null)
    const get = (url: string) => fetch(url, auth).then(r => r.json()).catch(() => null)
    Promise.all([
      get(`/api/reports?view=month&month=${selectedMonth}`),
      get(`/api/loans?filter=all&startFrom=${from}&startTo=${to}&page=1&pageSize=${PAGE}`),
      get(`/api/settlements?entityType=GuarantorCommission&settledFrom=${from}&settledTo=${to}&page=1&pageSize=${PAGE}`),
      get(`/api/settlements?entityType=Guarantor&settledFrom=${from}&settledTo=${to}&page=1&pageSize=${PAGE}`),
      get(`/api/repayments?mode=staffpaid&month=${selectedMonth}&page=1&pageSize=${PAGE}`),
    ]).then(([t, l, c, sb, st]) => {
      if (t?.success) setMonthTotals(t.data)
      setMonthLoans({ rows: l?.success ? l.data.loans : [], total: l?.success ? l.data.total : 0, page: 1 })
      setMonthComm({ rows: c?.success ? c.data.settlements : [], total: c?.success ? c.data.total : 0, page: 1 })
      setMonthSubs({ rows: sb?.success ? sb.data.settlements : [], total: sb?.success ? sb.data.total : 0, page: 1 })
      setMonthStaff({ rows: st?.success ? st.data.rows : [], total: st?.success ? st.data.pagination.total : 0, page: 1 })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth])

  async function moreOfMonth(kind: 'loans' | 'comm' | 'subs' | 'staff') {
    if (!selectedMonth) return
    const [y, m] = selectedMonth.split('-').map(Number)
    const from = `${selectedMonth}-01`, to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
    const cur = kind === 'loans' ? monthLoans : kind === 'comm' ? monthComm : kind === 'subs' ? monthSubs : monthStaff
    const page = cur.page + 1
    const url = kind === 'loans' ? `/api/loans?filter=all&startFrom=${from}&startTo=${to}&page=${page}&pageSize=${PAGE}`
      : kind === 'staff' ? `/api/repayments?mode=staffpaid&month=${selectedMonth}&page=${page}&pageSize=${PAGE}`
      : `/api/settlements?entityType=${kind === 'comm' ? 'GuarantorCommission' : 'Guarantor'}&settledFrom=${from}&settledTo=${to}&page=${page}&pageSize=${PAGE}`
    const j = await fetch(url, auth).then(r => r.json()).catch(() => null)
    if (!j?.success) return
    const rows = kind === 'loans' ? j.data.loans : kind === 'staff' ? j.data.rows : j.data.settlements
    const next = { rows: [...cur.rows, ...rows], total: cur.total, page }
    if (kind === 'loans') setMonthLoans(next); else if (kind === 'comm') setMonthComm(next); else if (kind === 'subs') setMonthSubs(next); else setMonthStaff(next)
  }
  // who collected which week: guarantor user ids for the submissions on screen
  useEffect(() => {
    const need = Array.from(new Set(monthSubs.rows.map(s => s['Entity ID']).filter((id: string) => id && !(id in guarantorUsers))))
    if (!need.length) return
    fetch(`/api/staff`, auth).then(r => r.json()).then(j => {
      if (!j.success) return
      setGuarantorUsers(prev => ({ ...prev, ...Object.fromEntries((j.data.guarantors || []).map((g: any) => [g.guarantorId, g.userId])) }))
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthSubs.rows.length])

  // Customer cards: a page of customers, then their stat blocks
  useEffect(() => { setCustPage(1) }, [custQ])
  useEffect(() => {
    if (tab !== 'customers') return
    fetch(`/api/customers?page=${custPage}&pageSize=24&q=${encodeURIComponent(custQ.trim())}`, auth).then(r => r.json()).then(async j => {
      if (!j.success) return
      const rows = j.data.customers
      const cj = rows.length ? await fetch(`/api/reports?view=customerCards&ids=${rows.map((c: any) => c.customerId).join(',')}`, auth).then(r => r.json()).catch(() => null) : null
      setCustList({ rows, total: j.data.total, totalPages: j.data.totalPages, cards: Object.fromEntries((cj?.success ? cj.data.cards : []).map((c: any) => [c.customerId, c])) })
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, custPage, custQ])
  // One customer opens: their loans and every week
  useEffect(() => {
    if (!selectedCustomer) return
    setDetailLoading(true)
    Promise.all([
      fetch(`/api/loans?filter=all&customerId=${encodeURIComponent(selectedCustomer.customerId)}&page=1&pageSize=200`, auth).then(r => r.json()),
      fetch(`/api/repayments?customerId=${encodeURIComponent(selectedCustomer.customerId)}`, auth).then(r => r.json()),
    ]).then(([l, rp]) => { setCustLoans(l.success ? l.data.loans : []); setCustReps(rp.success ? rp.data.rows : []) })
      .catch(() => {}).finally(() => setDetailLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomer?.customerId])

  // Guarantor cards, and one guarantor's detail
  useEffect(() => { setGPage(1) }, [gQ])
  useEffect(() => {
    if (tab !== 'guarantors') return
    fetch(`/api/settlements?guarantorList=1&page=${gPage}&pageSize=24&q=${encodeURIComponent(gQ.trim())}`, auth).then(r => r.json()).then(async j => {
      if (!j.success) return
      const rows = j.data.guarantors
      const cj = rows.length ? await fetch(`/api/reports?view=guarantorCards&ids=${rows.map((g: any) => g.guarantorId).join(',')}`, auth).then(r => r.json()).catch(() => null) : null
      setGList({ rows, total: j.data.total, totalPages: j.data.totalPages, cards: Object.fromEntries((cj?.success ? cj.data.cards : []).map((c: any) => [c.guarantorId, c])) })
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, gPage, gQ])
  useEffect(() => {
    if (!selectedGuarantor) return
    setDetailLoading(true)
    const gid = encodeURIComponent(selectedGuarantor.guarantorId)
    Promise.all([
      fetch(`/api/loans?filter=all&guarantorId=${gid}&page=1&pageSize=${PAGE}`, auth).then(r => r.json()),
      fetch(`/api/settlements?entityId=${gid}&entityType=GuarantorCommission&pageSize=200`, auth).then(r => r.json()),
      fetch(`/api/reports?view=guarantorCards&ids=${gid}`, auth).then(r => r.json()),
    ]).then(([l, st, c]) => setGDetail({ loans: l.success ? l.data.loans : [], loanTotal: l.success ? l.data.total : 0, loanPage: 1, settlements: st.success ? st.data.settlements : [], card: c.success ? c.data.cards[0] : null }))
      .catch(() => {}).finally(() => setDetailLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGuarantor?.guarantorId])
  async function moreGuarantorLoans() {
    const gid = encodeURIComponent(selectedGuarantor.guarantorId)
    const page = gDetail.loanPage + 1
    const j = await fetch(`/api/loans?filter=all&guarantorId=${gid}&page=${page}&pageSize=${PAGE}`, auth).then(r => r.json()).catch(() => null)
    if (j?.success) setGDetail(prev => ({ ...prev, loans: [...prev.loans, ...j.data.loans], loanPage: page }))
  }

  if (loading) return <div className="flex h-40 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-ink border-t-transparent" /></div>

  if (!summaryData) return <div className="rounded-2xl border border-line bg-white p-6 text-sm text-soft">Could not load reports. Please refresh and try again.</div>

  // ── TABS ──
  const TABS: { key: Tab; label: string }[] = [
    { key: 'summary',      label: 'Summary' },
    { key: 'transactions', label: 'Transactions' },
    { key: 'customers',    label: 'Customer Transactions' },
    { key: 'guarantors',   label: 'Guarantor Transactions' },
  ]
  const tabBar = (
    <div className="flex gap-2 flex-wrap">
      {TABS.map(t => (
        <button key={t.key} onClick={() => { setTab(t.key); setSelectedMonth(null); setSelectedCustomer(null); setSelectedGuarantor(null) }}
          className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${tab === t.key ? 'bg-ink text-white' : 'border border-line bg-white text-soft hover:text-ink'}`}>
          {t.label}
        </button>
      ))}
    </div>
  )

  // ── SUMMARY ──
  if (tab === 'summary') {
    const cards = [
      { label: 'Total Portfolio Value',     value: currency(summaryData.totalPortfolio),     sub: `${summaryData.activeLoans} active loans` },
      { label: 'Active Customers',          value: summaryData.activeCustomers,              sub: `${summaryData.completedLoans} completed loans` },
      { label: 'This Month Collected',      value: currency(summaryData.thisMonthCollected), sub: '' },
      { label: 'Last Month Collected',      value: currency(summaryData.lastMonthCollected), sub: '' },
      { label: 'Total Collected (All Time)', value: currency(summaryData.totalCollected),    sub: 'All paid repayments' },
      { label: 'Overdue Amount',            value: currency(summaryData.pendingAmount),      sub: `${summaryData.overdueLoans} overdue loans` },
    ]
    return (
      <div className="space-y-5">
        {tabBar}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map(c => (
            <div key={c.label} className="rounded-[1.5rem] border border-white/70 bg-white p-5 shadow-panel">
              <p className="text-xs text-soft">{c.label}</p>
              <p className="mt-2 text-2xl font-semibold">{c.value}</p>
              {c.sub && <p className="mt-1 text-xs text-soft">{c.sub}</p>}
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── TRANSACTIONS — month detail ──
  if (tab === 'transactions' && selectedMonth) {
    // totals come from the database (exact for the whole month); the lists below show a page at a time
    const totalCredit = monthTotals?.totalCredit ?? 0
    const totalDebit = monthTotals?.totalDebit ?? 0
    const monthCollections = monthSubs.rows
    const monthSettlements = monthComm.rows
    const staffReps = monthStaff.rows
    const moreBtn = (kind: 'loans' | 'comm' | 'subs' | 'staff', shown: number, total: number) => shown < total ? (
      <button onClick={() => moreOfMonth(kind)} className="m-3 rounded-xl border border-line px-3 py-1.5 text-xs font-semibold hover:bg-mist">Show more ({shown} of {total})</button>
    ) : null

    return (
      <div className="space-y-5">
        {tabBar}
        <div className="flex items-center gap-3">
          <button onClick={() => setSelectedMonth(null)} className="rounded-2xl border border-line bg-white px-4 py-2 text-sm font-semibold">Back</button>
          <p className="text-lg font-semibold">{monthLabel(selectedMonth)}</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-[1.5rem] border border-green-200 bg-green-50 p-4 text-center">
            <p className="text-xs text-green-700 font-semibold uppercase tracking-wide">Total Credit</p>
            <p className="mt-1 text-2xl font-bold text-green-700">{currency(totalCredit)}</p>
          </div>
          <div className="rounded-[1.5rem] border border-red-200 bg-red-50 p-4 text-center">
            <p className="text-xs text-red-700 font-semibold uppercase tracking-wide">Total Debit</p>
            <p className="mt-1 text-2xl font-bold text-red-700">{currency(totalDebit)}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          {/* CREDIT */}
          <div className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel overflow-hidden">
            <div className="border-b border-black/5 px-5 py-4 flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-green-500" />
              <p className="text-sm font-semibold">Credit</p>
              <span className="ml-auto text-sm font-bold text-green-700">+{currency(totalCredit)}</span>
            </div>

            {/* Collection Submissions — with per-customer repayment breakdown by due date */}
            {monthCollections.length > 0 && (
              <div>
                <p className="px-5 py-2 text-[10px] font-semibold uppercase tracking-wider text-soft bg-panel border-b border-black/5">Guarantor Collection Submissions</p>
                <div className="divide-y divide-black/5">
                  {monthCollections.map((s: any) => {
                    return (
                      <div key={s['Settlement ID']} className="px-5 py-2.5 text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium">{s['Entity Name']}</p>
                            <p className="text-soft">{s['Saturday Date']} · Cash: {currency(Number(s['Total Cash Due'] || 0))} · UPI: {currency(Number(s['Total UPI Due'] || 0))}</p>
                            {s['Notes'] && <p className="text-soft">{s['Notes']}</p>}
                          </div>
                          <span className="font-semibold text-green-700 shrink-0">+{currency(Number(s['Amount Submitted'] || 0))}</span>
                        </div>
                        <SubmissionCustomers session={session} settlement={s} guarantorUserId={guarantorUsers[s['Entity ID']] || null} />
                      </div>
                    )
                  })}
                  {moreBtn('subs', monthCollections.length, monthSubs.total)}
                </div>
              </div>
            )}


            {/* Guarantor Commissions Earned */}
            {monthLoans.rows.length > 0 && (
              <div>
                <p className="px-5 py-2 text-[10px] font-semibold uppercase tracking-wider text-soft bg-panel border-b border-black/5 border-t border-black/5">Guarantor Commissions Earned</p>
                <div className="divide-y divide-black/5">
                  {monthLoans.rows.map(l => (
                    <div key={l.loanId} className="flex items-center justify-between px-5 py-2.5 text-xs">
                      <div>
                        <p className="font-medium">{l.customerName}</p>
                        <p className="text-soft font-mono">{l.loanId} · {l.guarantorName}</p>
                      </div>
                      <span className="font-semibold text-green-700 shrink-0">+{currency(Number(l.guarantorCommission || 0))}</span>
                    </div>
                  ))}
                  {moreBtn('loans', monthLoans.rows.length, monthLoans.total)}
                </div>
              </div>
            )}

            {/* Staff / Agent direct collections — paid this month, no guarantor */}
            {staffReps.length > 0 && (
              <div>
                <p className="px-5 py-2 text-[10px] font-semibold uppercase tracking-wider text-soft bg-panel border-b border-black/5 border-t border-black/5">Staff / Agent Collections</p>
                <div className="divide-y divide-black/5">
                  {staffReps.map((r: any) => {
                    const collectorLabel = 'Admin/Staff'   // this list is only weeks collected by someone who is not a guarantor
                    return (
                      <div key={r['Repayment ID']} className="flex items-center justify-between px-5 py-2.5 text-xs">
                        <div>
                          <p className="font-medium">{r.customerName}</p>
                          <p className="text-soft font-mono">{r['Loan ID']} · Wk {r['Week No']} · {r['Paid Date']} · by {collectorLabel}</p>
                          {r.guarantorName && <p className="text-soft">Under: {r.guarantorName}</p>}
                        </div>
                        <span className="font-semibold text-green-700 shrink-0">+{currency(Number(r['Amount']))}</span>
                      </div>
                    )
                  })}
                  {moreBtn('staff', staffReps.length, monthStaff.total)}
                </div>
              </div>
            )}

            {staffReps.length === 0 && monthLoans.rows.length === 0 && monthCollections.length === 0 && <p className="p-5 text-sm text-soft">No credit entries.</p>}
          </div>

          {/* DEBIT */}
          <div className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel overflow-hidden">
            <div className="border-b border-black/5 px-5 py-4 flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-red-500" />
              <p className="text-sm font-semibold">Debit</p>
              <span className="ml-auto text-sm font-bold text-red-700">-{currency(totalDebit)}</span>
            </div>
            {monthLoans.rows.length > 0 && (
              <div>
                <p className="px-5 py-2 text-[10px] font-semibold uppercase tracking-wider text-soft bg-panel border-b border-black/5">Loan Disbursements</p>
                <div className="divide-y divide-black/5">
                  {monthLoans.rows.map(l => (
                    <div key={l.loanId} className="flex items-center justify-between px-5 py-2.5 text-xs">
                      <div>
                        <p className="font-medium">{l.customerName}</p>
                        <p className="text-soft font-mono">{l.loanId} · {l.startDate}</p>
                      </div>
                      <span className="font-semibold text-red-700 shrink-0">-{currency(Number(l.netDisbursed || 0))}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {monthSettlements.length > 0 && (
              <div>
                <p className="px-5 py-2 text-[10px] font-semibold uppercase tracking-wider text-soft bg-panel border-b border-black/5 border-t border-black/5">Commission Settlements Paid</p>
                <div className="divide-y divide-black/5">
                  {monthSettlements.map(s => (
                    <div key={s['Settlement ID']} className="flex items-center justify-between px-5 py-2.5 text-xs">
                      <div>
                        <p className="font-medium">{s['Entity Name']}</p>
                        <p className="text-soft">{s['Saturday Date']} · <span className={`font-semibold ${s['Status'] === 'Settled' ? 'text-green-700' : 'text-amber-700'}`}>{s['Status']}</span></p>
                      </div>
                      <span className="font-semibold text-red-700 shrink-0">-{currency(Number(s['Amount Submitted'] || 0))}</span>
                    </div>
                  ))}
                  {moreBtn('comm', monthSettlements.length, monthComm.total)}
                </div>
              </div>
            )}
            {monthLoans.rows.length === 0 && monthSettlements.length === 0 && <p className="p-5 text-sm text-soft">No debit entries.</p>}
          </div>
        </div>
      </div>
    )
  }

  // ── TRANSACTIONS — month cards ──
  if (tab === 'transactions') {
    const years = [...new Set(months.map(m => m.ym.slice(0, 4)))].sort().reverse()
    const filteredMonths = months.filter(m => m.ym.startsWith(yearFilter))   // newest first, from the database

    return (
      <div className="space-y-5">
        {tabBar}
        <div className="flex items-center gap-3">
          <select value={yearFilter} onChange={e => setYearFilter(e.target.value)}
            className="rounded-2xl border border-line bg-white px-4 py-2.5 text-sm outline-none focus:border-ink">
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <span className="text-sm text-soft">{filteredMonths.length} months</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredMonths.map(({ ym, credit, debit, txCount }) => {
            return (
              <div key={ym} className="rounded-[1.75rem] border border-white/70 bg-white p-5 shadow-panel space-y-3">
                <p className="font-semibold">{monthLabel(ym)}</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl bg-green-50 p-3">
                    <p className="text-green-700 font-medium">Credit</p>
                    <p className="font-bold text-green-800 mt-0.5">{currency(credit)}</p>
                    <p className="text-green-600 text-[10px]">{txCount} repayments</p>
                  </div>
                  <div className="rounded-xl bg-red-50 p-3">
                    <p className="text-red-700 font-medium">Debit</p>
                    <p className="font-bold text-red-800 mt-0.5">{currency(debit)}</p>
                    <p className="text-red-600 text-[10px]">disbursements</p>
                  </div>
                </div>
                <button onClick={() => setSelectedMonth(ym)}
                  className="w-full rounded-xl border border-line px-3 py-2 text-xs font-semibold hover:bg-mist transition">
                  View Transactions
                </button>
              </div>
            )
          })}
          {filteredMonths.length === 0 && <p className="py-10 text-center text-sm text-soft col-span-3">No transactions for {yearFilter}.</p>}
        </div>
      </div>
    )
  }

  // ── CUSTOMER TRANSACTIONS — detail ──
  if (tab === 'customers' && selectedCustomer) {
    const paidReps = custReps.filter(r => r['Status'] === 'Paid').sort((a, b) => (a['Paid Date'] || '').localeCompare(b['Paid Date'] || ''))
    const totalPaid = paidReps.reduce((s, r) => s + Number(r['Amount'] || 0), 0)
    const totalDisbursed = custLoans.reduce((s, l) => s + Number(l.netDisbursed || 0), 0)
    const lateCount = custReps.filter(r => r['Status'] === 'Delayed').length
    const missedCount = custReps.filter(r => r['Status'] === 'Overdue' || r['Status'] === 'Pending').length
    const custSubTabs = [
      { key: 'chart' as const, label: 'Repayment Chart' },
      { key: 'transactions' as const, label: 'Transactions' },
      { key: 'history' as const, label: 'Transaction History' },
    ]
    return (
      <div className="space-y-5">
        {tabBar}
        <div className="flex items-center gap-3">
          <button onClick={() => setSelectedCustomer(null)} className="rounded-2xl border border-line bg-white px-4 py-2 text-sm font-semibold">Back</button>
          <div>
            <p className="text-lg font-semibold">{selectedCustomer.name}</p>
            <p className="text-xs text-soft">{selectedCustomer.phone}</p>
          </div>
        </div>

        {/* Summary stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {([['Total Loans', custLoans.length, ''], ['Total Collected', currency(totalPaid), 'text-green-700'], ['Late Payments', lateCount, 'text-amber-600'], ['Missed', missedCount, 'text-red-600']] as [string, string|number, string][]).map(([l, v, c]) => (
            <div key={l} className="rounded-[1.5rem] border border-white/70 bg-white p-4 shadow-panel text-center">
              <p className="text-xs text-soft">{l}</p>
              <p className={`mt-1 text-xl font-bold ${c}`}>{v}</p>
            </div>
          ))}
        </div>

        {/* Sub-tab bar */}
        <div className="flex gap-2 flex-wrap">
          {custSubTabs.map(t => (
            <button key={t.key} onClick={() => setCustTab(t.key)}
              className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${custTab === t.key ? 'bg-ink text-white' : 'border border-line bg-white text-soft hover:text-ink'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Sub-tab: Repayment Chart */}
        {custTab === 'chart' && custLoans.map(loan => {
          const reps = custReps.filter(r => r['Loan ID'] === loan.loanId).sort((a, b) => Number(a['Week No']) - Number(b['Week No']))
          return (
            <div key={loan.loanId} className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-black/5">
                <div>
                  <p className="font-semibold font-mono text-sm">{loan.loanId}</p>
                  <p className="text-xs text-soft">{loan.startDate} → {loan.endDate} · {loan.guarantorName}</p>
                </div>
                <div className="text-right">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${loan.status === 'Active' ? 'bg-green-100 text-green-700' : loan.status === 'Completed' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>{loan.status}</span>
                  <p className="mt-1 text-xs text-soft">{loan.paidWeeks}/{loan.totalWeeks} wks · {currency(Number(loan.principal))}</p>
                </div>
              </div>
              <div className="divide-y divide-black/5">
                {reps.map(r => (
                  <div key={r['Repayment ID']} className="flex items-center justify-between px-5 py-2.5 text-xs">
                    <div className="flex items-center gap-3">
                      <span className="text-soft w-12">Wk {r['Week No']}</span>
                      <span className="text-soft">Due: {r['Due Date']}</span>
                      {r['Paid Date'] && <span className="text-green-700">Paid: {r['Paid Date']}</span>}
                      {r['Payment Mode'] && <span className="text-soft">{r['Payment Mode']}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{currency(Number(r['Amount']))}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusColor(r['Status'])}`}>{r['Status']}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}

        {/* Sub-tab: Transactions */}
        {custTab === 'transactions' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <div className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel overflow-hidden">
              <div className="border-b border-black/5 px-5 py-4 flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-green-500" />
                <p className="text-sm font-semibold">Credit</p>
                <span className="ml-auto text-sm font-bold text-green-700">+{currency(totalPaid)}</span>
              </div>
              {paidReps.length > 0 ? (
                <div className="divide-y divide-black/5">
                  {paidReps.map(r => (
                    <div key={r['Repayment ID']} className="flex items-center justify-between px-5 py-2.5 text-xs">
                      <div>
                        <p className="font-medium">{r['Loan ID']} · Wk {r['Week No']}</p>
                        <p className="text-soft">Paid: {r['Paid Date']}{r['Payment Mode'] ? ` · ${r['Payment Mode']}` : ''}</p>
                      </div>
                      <span className="text-green-700 font-semibold shrink-0">+{currency(Number(r['Amount']))}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="p-5 text-sm text-soft">No payments received yet.</p>}
            </div>
            <div className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel overflow-hidden">
              <div className="border-b border-black/5 px-5 py-4 flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-red-500" />
                <p className="text-sm font-semibold">Debit</p>
                <span className="ml-auto text-sm font-bold text-red-700">-{currency(totalDisbursed)}</span>
              </div>
              <div className="divide-y divide-black/5">
                {custLoans.map(l => (
                  <div key={l.loanId} className="flex items-center justify-between px-5 py-2.5 text-xs">
                    <div>
                      <p className="font-medium font-mono">{l.loanId}</p>
                      <p className="text-soft">{l.startDate} · {l.guarantorName} · <span className={`font-semibold ${l.status === 'Active' ? 'text-green-700' : 'text-blue-700'}`}>{l.status}</span></p>
                      <p className="text-soft">{l.paidWeeks}/{l.totalWeeks} wks · Principal: {currency(Number(l.principal))}</p>
                    </div>
                    <span className="text-red-700 font-semibold shrink-0">-{currency(Number(l.netDisbursed || 0))}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Sub-tab: Transaction History */}
        {custTab === 'history' && (() => {
          const totalDisbursedH = custLoans.reduce((s, l) => s + Number(l.netDisbursed || 0), 0)
          const outstanding = custLoans.reduce((s, l) => s + Number(l.principal || 0), 0) - totalPaid
          return (
            <div className="space-y-4">
              {/* Summary row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {([
                  ['Total Loans', custLoans.length, 'text-ink', 'border-line'],
                  ['Total Disbursed', currency(totalDisbursedH), 'text-red-700', 'border-red-200'],
                  ['Total Repaid', currency(totalPaid), 'text-green-700', 'border-green-200'],
                  ['Outstanding', currency(Math.max(0, outstanding)), 'text-amber-600', 'border-amber-200'],
                ] as [string, string|number, string, string][]).map(([l, v, c, b]) => (
                  <div key={l} className={`rounded-[1.5rem] border ${b} bg-white p-4 shadow-panel text-center`}>
                    <p className="text-xs text-soft">{l}</p>
                    <p className={`mt-1 text-lg font-bold ${c}`}>{v}</p>
                  </div>
                ))}
              </div>

              {/* Per-loan ledger */}
              {custLoans.map(loan => {
                const loanReps = custReps.filter(r => r['Loan ID'] === loan.loanId && (r['Status'] === 'Paid' || r['Status'] === 'Delayed')).sort((a, b) => Number(a['Week No']) - Number(b['Week No']))
                const loanPaid = loanReps.filter(r => r['Status'] === 'Paid').reduce((s, r) => s + Number(r['Amount'] || 0), 0)
                return (
                  <div key={loan.loanId} className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel overflow-hidden">
                    {/* Loan header */}
                    <div className="px-5 py-4 border-b border-black/5 flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold font-mono text-sm">{loan.loanId}</p>
                        <p className="text-xs text-soft mt-0.5">{loan.startDate} → {loan.endDate} · {loan.guarantorName}</p>
                        <p className="text-xs text-soft">{loan.paidWeeks}/{loan.totalWeeks} wks · Principal {currency(Number(loan.principal))}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${loan.status === 'Active' ? 'bg-green-100 text-green-700' : loan.status === 'Completed' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>{loan.status}</span>
                        <p className="text-xs text-green-700 font-semibold mt-1">Repaid {currency(loanPaid)}</p>
                      </div>
                    </div>

                    {/* Debit | Credit side by side */}
                    <div className="grid grid-cols-2 divide-x divide-black/5">
                      {/* DEBIT */}
                      <div>
                        <div className="flex items-center justify-between px-4 py-2.5 bg-red-50 border-b border-red-100">
                          <div className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-red-500" />
                            <p className="text-xs font-semibold text-red-700">Debit</p>
                          </div>
                          <span className="text-xs font-bold text-red-700">-{currency(Number(loan.netDisbursed || 0))}</span>
                        </div>
                        <div className="flex items-start gap-2.5 px-4 py-3 text-xs">
                          <span className="h-6 w-6 rounded-full bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
                            <span className="text-red-600 font-bold text-[10px]">D</span>
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium">Loan Disbursed</p>
                            <p className="text-soft">{loan.startDate}</p>
                            <p className="font-semibold text-red-700 mt-0.5">-{currency(Number(loan.netDisbursed || 0))}</p>
                          </div>
                        </div>
                      </div>

                      {/* CREDIT */}
                      <div>
                        <div className="flex items-center justify-between px-4 py-2.5 bg-green-50 border-b border-green-100">
                          <div className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-green-500" />
                            <p className="text-xs font-semibold text-green-700">Credit</p>
                          </div>
                          <span className="text-xs font-bold text-green-700">+{currency(loanPaid)}</span>
                        </div>
                        <div className="divide-y divide-black/5">
                          {loanReps.map(r => (
                            <div key={r['Repayment ID']} className="flex items-start gap-2.5 px-4 py-3 text-xs">
                              <span className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                                r['Status'] === 'Paid' ? 'bg-green-100' :
                                r['Status'] === 'Delayed' ? 'bg-amber-100' :
                                r['Status'] === 'Overdue' ? 'bg-red-100' : 'bg-mist'
                              }`}>
                                <span className={`font-bold text-[9px] ${
                                  r['Status'] === 'Paid' ? 'text-green-600' :
                                  r['Status'] === 'Delayed' ? 'text-amber-600' :
                                  r['Status'] === 'Overdue' ? 'text-red-600' : 'text-soft'
                                }`}>{r['Week No']}</span>
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1 flex-wrap">
                                  <p className="font-medium">Wk {r['Week No']}</p>
                                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${statusColor(r['Status'])}`}>{r['Status']}</span>
                                </div>
                                <p className="text-soft">Due: {r['Due Date']}</p>
                                {r['Paid Date'] && <p className="text-green-700">Paid: {r['Paid Date']}</p>}
                                <p className={`font-semibold mt-0.5 ${r['Status'] === 'Paid' ? 'text-green-700' : 'text-soft'}`}>
                                  {r['Status'] === 'Paid' ? '+' : ''}{currency(Number(r['Amount']))}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })()}
      </div>
    )
  }

  // ── CUSTOMER TRANSACTIONS — cards ──
  if (tab === 'customers') {
    return (
      <div className="space-y-4">
        {tabBar}
        <input value={txSearch} onChange={e => setTxSearch(e.target.value)} placeholder="Search name, phone, loan ID…"
          data-no-upper className="w-full max-w-sm rounded-2xl border border-line bg-white px-4 py-2.5 text-sm outline-none focus:border-ink" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {custList.rows.map(c => {
            const card = custList.cards[c.customerId] || { loanCount: 0, collected: 0, lateCount: 0 }
            const totalPaid = card.collected, lateCount = card.lateCount, loanCount = card.loanCount
            return (
              <div key={c.customerId} className="rounded-[1.75rem] border border-white/70 bg-white p-5 shadow-panel space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{c.name}</p>
                    <p className="text-xs text-soft">{c.phone}</p>
                    {c.activeLoanId && <p className="font-mono text-[11px] text-soft">{c.activeLoanId}</p>}
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${c.loanStatus === 'Active' ? 'bg-green-100 text-green-700' : 'bg-mist text-soft'}`}>{c.loanStatus === 'Active' ? 'Active' : 'Inactive'}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-xl bg-mist p-2 text-center"><p className="text-soft">Loans</p><p className="font-bold">{loanCount}</p></div>
                  <div className="rounded-xl bg-green-50 p-2 text-center"><p className="text-soft">Collected</p><p className="font-bold text-green-700">{currency(totalPaid)}</p></div>
                  <div className={`rounded-xl p-2 text-center ${lateCount > 0 ? 'bg-amber-50' : 'bg-mist'}`}><p className="text-soft">Late</p><p className={`font-bold ${lateCount > 0 ? 'text-amber-600' : ''}`}>{lateCount}</p></div>
                </div>
                <button onClick={() => setSelectedCustomer(c)} className="w-full rounded-xl border border-line px-3 py-2 text-xs font-semibold hover:bg-mist transition">View Transactions</button>
              </div>
            )
          })}
        </div>
        {custList.rows.length === 0 && <p className="py-10 text-center text-sm text-soft">No customers found.</p>}
        <Pager page={custPage} totalPages={custList.totalPages} total={custList.total} noun="customers" pageSize={24} onPage={setCustPage} />
      </div>
    )
  }

  // ── GUARANTOR TRANSACTIONS — detail ──
  if (tab === 'guarantors' && selectedGuarantor) {
    const gLoans = gDetail.loans
    const gSettlements = gDetail.settlements
    // the totals are for the guarantor's whole history (from the database); the list shows a page at a time
    const totalEarned = gDetail.card?.earned ?? 0
    const totalSettled = gDetail.card?.settled ?? 0
    const balance = totalEarned - totalSettled
    return (
      <div className="space-y-5">
        {tabBar}
        <div className="flex items-center gap-3">
          <button onClick={() => setSelectedGuarantor(null)} className="rounded-2xl border border-line bg-white px-4 py-2 text-sm font-semibold">Back</button>
          <div>
            <p className="text-lg font-semibold">{selectedGuarantor.name}</p>
            <p className="text-xs text-soft font-mono">{selectedGuarantor.code}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-[1.5rem] border border-green-200 bg-green-50 p-4 text-center">
            <p className="text-xs text-green-700 font-semibold">Total Earned</p>
            <p className="mt-1 text-xl font-bold text-green-800">{currency(totalEarned)}</p>
          </div>
          <div className="rounded-[1.5rem] border border-blue-200 bg-blue-50 p-4 text-center">
            <p className="text-xs text-blue-700 font-semibold">Total Settled</p>
            <p className="mt-1 text-xl font-bold text-blue-800">{currency(totalSettled)}</p>
          </div>
          <div className={`rounded-[1.5rem] border p-4 text-center ${balance > 0 ? 'border-amber-200 bg-amber-50' : 'border-line bg-mist'}`}>
            <p className="text-xs font-semibold text-soft">Balance Due</p>
            <p className={`mt-1 text-xl font-bold ${balance > 0 ? 'text-amber-700' : 'text-ink'}`}>{currency(balance)}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          {/* Commissions earned */}
          <div className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel overflow-hidden">
            <div className="border-b border-black/5 px-5 py-4 flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-green-500" />
              <p className="text-sm font-semibold">Commissions Earned</p>
              <span className="ml-auto text-sm font-bold text-green-700">+{currency(totalEarned)}</span>
            </div>
            <div className="divide-y divide-black/5">
              {gLoans.map(l => (
                <div key={l.loanId} className="flex items-center justify-between px-5 py-2.5 text-xs">
                  <div>
                    <p className="font-medium">{l.customerName}</p>
                    <p className="text-soft font-mono">{l.loanId} · {l.startDate} · <span className={`font-semibold ${l.status === 'Active' ? 'text-green-700' : 'text-blue-700'}`}>{l.status}</span></p>
                  </div>
                  <span className="font-semibold text-green-700 shrink-0">+{currency(Number(l.guarantorCommission || 0))}</span>
                </div>
              ))}
              {gLoans.length === 0 && <p className="p-5 text-sm text-soft">{detailLoading ? 'Loading…' : 'No commissions.'}</p>}
              {gLoans.length < gDetail.loanTotal && <button onClick={moreGuarantorLoans} className="m-3 rounded-xl border border-line px-3 py-1.5 text-xs font-semibold hover:bg-mist">Show more ({gLoans.length} of {gDetail.loanTotal})</button>}
            </div>
          </div>

          {/* Settlements */}
          <div className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel overflow-hidden">
            <div className="border-b border-black/5 px-5 py-4 flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-blue-500" />
              <p className="text-sm font-semibold">Commission Settlements</p>
              <span className="ml-auto text-sm font-bold text-blue-700">-{currency(totalSettled)}</span>
            </div>
            <div className="divide-y divide-black/5">
              {gSettlements.map(s => (
                <div key={s['Settlement ID']} className="flex items-center justify-between px-5 py-2.5 text-xs">
                  <div>
                    <p className="font-medium">{s['Settlement Date']} · Payment: {s['Saturday Date']}</p>
                    <p className="text-soft">
                      <span className={`font-semibold ${s['Status'] === 'Settled' ? 'text-green-700' : 'text-amber-700'}`}>{s['Status']}</span>
                      {s['Notes'] ? ` · ${s['Notes']}` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold text-blue-700">-{currency(Number(s['Amount Submitted'] || 0))}</p>
                    {Number(s['Balance'] || 0) > 0 && <p className="text-[10px] text-amber-600">Bal: {currency(Number(s['Balance']))}</p>}
                  </div>
                </div>
              ))}
              {gSettlements.length === 0 && <p className="p-5 text-sm text-soft">No settlements.</p>}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── GUARANTOR TRANSACTIONS — cards ──
  if (tab === 'guarantors') {
    return (
      <div className="space-y-4">
        {tabBar}
        <input value={gSearch} onChange={e => setGSearch(e.target.value)} placeholder="Search guarantor name or code…"
          data-no-upper className="w-full max-w-sm rounded-2xl border border-line bg-white px-4 py-2.5 text-sm outline-none focus:border-ink" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {gList.rows.map(g => {
            const card = gList.cards[g.guarantorId] || { loanCount: 0, earned: 0, settled: 0 }
            const earned = card.earned, settled = card.settled
            return (
              <div key={g.guarantorId} className="rounded-[1.75rem] border border-white/70 bg-white p-5 shadow-panel space-y-3">
                <div>
                  <p className="font-semibold">{g.name}</p>
                  <p className="text-xs font-mono text-soft">{g.code}</p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-xl bg-mist p-2 text-center"><p className="text-soft">Loans</p><p className="font-bold">{card.loanCount}</p></div>
                  <div className="rounded-xl bg-green-50 p-2 text-center"><p className="text-soft">Earned</p><p className="font-bold text-green-700">{currency(earned)}</p></div>
                  <div className={`rounded-xl p-2 text-center ${earned - settled > 0 ? 'bg-amber-50' : 'bg-mist'}`}><p className="text-soft">Balance</p><p className={`font-bold ${earned - settled > 0 ? 'text-amber-700' : ''}`}>{currency(earned - settled)}</p></div>
                </div>
                <button onClick={() => setSelectedGuarantor(g)} className="w-full rounded-xl border border-line px-3 py-2 text-xs font-semibold hover:bg-mist transition">View Transactions</button>
              </div>
            )
          })}
          {gList.rows.length === 0 && <p className="py-10 text-center text-sm text-soft">No guarantors found.</p>}
        </div>
        <Pager page={gPage} totalPages={gList.totalPages} total={gList.total} noun="guarantors" pageSize={24} onPage={setGPage} />
      </div>
    )
  }

  return null
}
