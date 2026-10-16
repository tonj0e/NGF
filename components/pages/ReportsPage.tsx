'use client'
import { useEffect, useState } from 'react'
import { Session } from '@/types'

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
  return 'bg-[#f4f5f7] text-[#697586]'
}

type Tab = 'summary' | 'transactions' | 'customers' | 'guarantors'

export default function ReportsPage({ session }: { session: Session }) {
  const [tab, setTab] = useState<Tab>('summary')
  const [loading, setLoading] = useState(true)
  const [loans, setLoans] = useState<any[]>([])
  const [repayments, setRepayments] = useState<any[]>([])
  const [settlements, setSettlements] = useState<any[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [guarantors, setGuarantors] = useState<any[]>([])
  const [summaryData, setSummaryData] = useState<any>(null)

  // Drill-down states
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null)
  const [selectedGuarantor, setSelectedGuarantor] = useState<any | null>(null)
  const [yearFilter, setYearFilter] = useState<string>('')
  const [txSearch, setTxSearch] = useState('')
  const [gSearch, setGSearch] = useState('')
  const [custTab, setCustTab] = useState<'chart' | 'transactions' | 'history'>('chart')

  useEffect(() => {
    Promise.all([
      fetch('/api/loans?filter=all', { headers: { Authorization: `Bearer ${session.token}` } }).then(r => r.json()),
      fetch('/api/repayments?mode=all&pageSize=5000', { headers: { Authorization: `Bearer ${session.token}` } }).then(r => r.json()),
      fetch('/api/settlements', { headers: { Authorization: `Bearer ${session.token}` } }).then(r => r.json()),
      fetch('/api/customers', { headers: { Authorization: `Bearer ${session.token}` } }).then(r => r.json()),
      fetch('/api/staff', { headers: { Authorization: `Bearer ${session.token}` } }).then(r => r.json()),
    ]).then(([lR, rR, sR, cR, stR]) => {
      const l = lR.data?.loans || []
      const r = rR.data?.rows || []
      const s = sR.data?.settlements || []
      const c = cR.data?.customers || []
      const g = stR.data?.guarantors || []
      setLoans(l); setRepayments(r); setSettlements(s); setCustomers(c); setGuarantors(g)

      const today = new Date().toISOString().slice(0, 10)
      const thisMonth = today.slice(0, 7)
      const lastMonth = new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().slice(0, 7)
      const paid = r.filter((x: any) => x['Status'] === 'Paid')
      setSummaryData({
        totalPortfolio: l.filter((x: any) => x.status === 'Active').reduce((s: number, x: any) => s + Number(x.principal || 0), 0),
        activeLoans: l.filter((x: any) => x.status === 'Active').length,
        completedLoans: l.filter((x: any) => x.status === 'Completed').length,
        overdueLoans: l.filter((x: any) => x.isOverdue).length,
        activeCustomers: c.filter((x: any) => x.loanStatus === 'Active').length,
        thisMonthCollected: paid.filter((x: any) => (x['Paid Date'] || '').startsWith(thisMonth)).reduce((s: number, x: any) => s + Number(x['Amount'] || 0), 0),
        lastMonthCollected: paid.filter((x: any) => (x['Paid Date'] || '').startsWith(lastMonth)).reduce((s: number, x: any) => s + Number(x['Amount'] || 0), 0),
        totalCollected: paid.reduce((s: number, x: any) => s + Number(x['Amount'] || 0), 0),
        pendingAmount: r.filter((x: any) => (x['Status'] === 'Pending' || x['Status'] === 'Overdue') && x['Due Date'] < today).reduce((s: number, x: any) => s + Number(x['Amount'] || 0), 0),
      })
      // Set default year to current year
      setYearFilter(today.slice(0, 4))
    }).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex h-40 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-[#1a1a2e] border-t-transparent" /></div>

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
          className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${tab === t.key ? 'bg-[#1a1a2e] text-white' : 'border border-[#e5e7eb] bg-white text-[#697586] hover:text-[#1a1a2e]'}`}>
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
              <p className="text-xs text-[#697586]">{c.label}</p>
              <p className="mt-2 text-2xl font-semibold">{c.value}</p>
              {c.sub && <p className="mt-1 text-xs text-[#697586]">{c.sub}</p>}
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── TRANSACTIONS — month detail ──
  if (tab === 'transactions' && selectedMonth) {
    const monthLoans = loans.filter(l => (l.startDate || '').startsWith(selectedMonth))
    const monthSettlements = settlements.filter(s => (s['Settlement Date'] || '').startsWith(selectedMonth) && s['Entity Type'] === 'GuarantorCommission')
    const monthCollections = settlements.filter(s => (s['Settlement Date'] || '').startsWith(selectedMonth) && s['Entity Type'] === 'Guarantor')
    // Only collections by non-guarantors (admin / NGF agents)
    const guarantorUserIds = new Set(guarantors.map((g: any) => g.userId).filter(Boolean))
    const staffReps = repayments.filter(r =>
      r['Status'] === 'Paid' &&
      (r['Paid Date'] || '').startsWith(selectedMonth) &&
      r['NGF Agent ID'] &&
      !guarantorUserIds.has(r['NGF Agent ID'])
    )
    // totalCredit = guarantor-submitted settlements + admin/staff direct collections + commissions earned
    const totalCredit = monthCollections.reduce((s, s2) => s + Number(s2['Amount Submitted'] || 0), 0)
      + staffReps.reduce((s, r) => s + Number(r['Amount'] || 0), 0)
      + monthLoans.reduce((s, l) => s + Number(l.guarantorCommission || 0), 0)
    const totalDebit = monthLoans.reduce((s, l) => s + Number(l.netDisbursed || 0), 0)
      + monthSettlements.reduce((s, s2) => s + Number(s2['Amount Submitted'] || 0), 0)

    return (
      <div className="space-y-5">
        {tabBar}
        <div className="flex items-center gap-3">
          <button onClick={() => setSelectedMonth(null)} className="rounded-2xl border border-[#e5e7eb] bg-white px-4 py-2 text-sm font-semibold">Back</button>
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
                <p className="px-5 py-2 text-[10px] font-semibold uppercase tracking-wider text-[#697586] bg-[#fafafa] border-b border-black/5">Guarantor Collection Submissions</p>
                <div className="divide-y divide-black/5">
                  {monthCollections.map((s: any) => {
                    const satDate = s['Saturday Date'] || ''
                    const weekStart = satDate ? new Date(new Date(satDate).getTime() - 6 * 86400000).toISOString().slice(0, 10) : ''
                    const guarantorG = guarantors.find((g: any) => g.guarantorId === s['Entity ID'])
                    const guarantorUserId = guarantorG?.userId || null
                    const guarantorLoanIds = new Set(loans.filter(l => l.guarantorName === s['Entity Name']).map(l => l.loanId))
                    const weekReps = satDate ? repayments.filter(r =>
                      guarantorLoanIds.has(r['Loan ID']) &&
                      r['Due Date'] >= weekStart &&
                      r['Due Date'] <= satDate &&
                      (!r['NGF Agent ID'] || r['NGF Agent ID'] === guarantorUserId)
                    ) : []
                    return (
                      <div key={s['Settlement ID']} className="px-5 py-2.5 text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium">{s['Entity Name']}</p>
                            <p className="text-[#697586]">{s['Saturday Date']} · Cash: {currency(Number(s['Total Cash Due'] || 0))} · UPI: {currency(Number(s['Total UPI Due'] || 0))}</p>
                            {s['Notes'] && <p className="text-[#697586]">{s['Notes']}</p>}
                          </div>
                          <span className="font-semibold text-green-700 shrink-0">+{currency(Number(s['Amount Submitted'] || 0))}</span>
                        </div>
                        {weekReps.length > 0 && (
                          <div className="mt-1.5 ml-3 border-l-2 border-green-100 pl-3 space-y-1">
                            {weekReps.map((r: any) => (
                              <div key={r['Repayment ID']} className="flex items-center justify-between text-[10px]">
                                <span className="text-[#697586]">
                                  {r.customerName} · <span className="font-mono">{r['Loan ID']}</span> · Wk {r['Week No']} · Due: {r['Due Date']}
                                  {r['Status'] === 'Paid' && <span className="ml-1 text-green-600">✓</span>}
                                </span>
                                <span className="text-green-700 font-semibold shrink-0">+{currency(Number(r['Amount']))}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}


            {/* Guarantor Commissions Earned */}
            {monthLoans.length > 0 && (
              <div>
                <p className="px-5 py-2 text-[10px] font-semibold uppercase tracking-wider text-[#697586] bg-[#fafafa] border-b border-black/5 border-t border-black/5">Guarantor Commissions Earned</p>
                <div className="divide-y divide-black/5">
                  {monthLoans.map(l => (
                    <div key={l.loanId} className="flex items-center justify-between px-5 py-2.5 text-xs">
                      <div>
                        <p className="font-medium">{l.customerName}</p>
                        <p className="text-[#697586] font-mono">{l.loanId} · {l.guarantorName}</p>
                      </div>
                      <span className="font-semibold text-green-700 shrink-0">+{currency(Number(l.guarantorCommission || 0))}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Staff / Agent direct collections — paid this month, no guarantor */}
            {staffReps.length > 0 && (
              <div>
                <p className="px-5 py-2 text-[10px] font-semibold uppercase tracking-wider text-[#697586] bg-[#fafafa] border-b border-black/5 border-t border-black/5">Staff / Agent Collections</p>
                <div className="divide-y divide-black/5">
                  {staffReps.map((r: any) => {
                    const collectorG = guarantors.find((g: any) => g.userId === r['NGF Agent ID'])
                    const collectorLabel = collectorG ? collectorG.name : 'Admin/Staff'
                    return (
                      <div key={r['Repayment ID']} className="flex items-center justify-between px-5 py-2.5 text-xs">
                        <div>
                          <p className="font-medium">{r.customerName}</p>
                          <p className="text-[#697586] font-mono">{r['Loan ID']} · Wk {r['Week No']} · {r['Paid Date']} · by {collectorLabel}</p>
                          {r.guarantorName && <p className="text-[#697586]">Under: {r.guarantorName}</p>}
                        </div>
                        <span className="font-semibold text-green-700 shrink-0">+{currency(Number(r['Amount']))}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {staffReps.length === 0 && monthLoans.length === 0 && monthCollections.length === 0 && <p className="p-5 text-sm text-[#697586]">No credit entries.</p>}
          </div>

          {/* DEBIT */}
          <div className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel overflow-hidden">
            <div className="border-b border-black/5 px-5 py-4 flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-red-500" />
              <p className="text-sm font-semibold">Debit</p>
              <span className="ml-auto text-sm font-bold text-red-700">-{currency(totalDebit)}</span>
            </div>
            {monthLoans.length > 0 && (
              <div>
                <p className="px-5 py-2 text-[10px] font-semibold uppercase tracking-wider text-[#697586] bg-[#fafafa] border-b border-black/5">Loan Disbursements</p>
                <div className="divide-y divide-black/5">
                  {monthLoans.map(l => (
                    <div key={l.loanId} className="flex items-center justify-between px-5 py-2.5 text-xs">
                      <div>
                        <p className="font-medium">{l.customerName}</p>
                        <p className="text-[#697586] font-mono">{l.loanId} · {l.startDate}</p>
                      </div>
                      <span className="font-semibold text-red-700 shrink-0">-{currency(Number(l.netDisbursed || 0))}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {monthSettlements.length > 0 && (
              <div>
                <p className="px-5 py-2 text-[10px] font-semibold uppercase tracking-wider text-[#697586] bg-[#fafafa] border-b border-black/5 border-t border-black/5">Commission Settlements Paid</p>
                <div className="divide-y divide-black/5">
                  {monthSettlements.map(s => (
                    <div key={s['Settlement ID']} className="flex items-center justify-between px-5 py-2.5 text-xs">
                      <div>
                        <p className="font-medium">{s['Entity Name']}</p>
                        <p className="text-[#697586]">{s['Saturday Date']} · <span className={`font-semibold ${s['Status'] === 'Settled' ? 'text-green-700' : 'text-amber-700'}`}>{s['Status']}</span></p>
                      </div>
                      <span className="font-semibold text-red-700 shrink-0">-{currency(Number(s['Amount Submitted'] || 0))}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {monthLoans.length === 0 && monthSettlements.length === 0 && <p className="p-5 text-sm text-[#697586]">No debit entries.</p>}
          </div>
        </div>
      </div>
    )
  }

  // ── TRANSACTIONS — month cards ──
  if (tab === 'transactions') {
    const allMonths = new Set<string>()
    repayments.filter(r => r['Status'] === 'Paid' && r['Paid Date']).forEach(r => allMonths.add(r['Paid Date'].slice(0, 7)))
    loans.filter(l => l.startDate).forEach(l => allMonths.add(l.startDate.slice(0, 7)))
    settlements.filter(s => s['Settlement Date']).forEach(s => allMonths.add(s['Settlement Date'].slice(0, 7)))

    const years = [...new Set([...allMonths].map(m => m.slice(0, 4)))].sort().reverse()
    if (!yearFilter && years.length) setYearFilter(years[0])

    const filteredMonths = [...allMonths].filter(m => m.startsWith(yearFilter)).sort().reverse()

    return (
      <div className="space-y-5">
        {tabBar}
        <div className="flex items-center gap-3">
          <select value={yearFilter} onChange={e => setYearFilter(e.target.value)}
            className="rounded-2xl border border-[#e5e7eb] bg-white px-4 py-2.5 text-sm outline-none focus:border-[#1a1a2e]">
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <span className="text-sm text-[#697586]">{filteredMonths.length} months</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredMonths.map(ym => {
            const credit = repayments.filter(r => r['Status'] === 'Paid' && (r['Paid Date'] || '').startsWith(ym)).reduce((s, r) => s + Number(r['Amount'] || 0), 0)
            const debit = loans.filter(l => (l.startDate || '').startsWith(ym)).reduce((s, l) => s + Number(l.netDisbursed || 0), 0)
            const txCount = repayments.filter(r => r['Status'] === 'Paid' && (r['Paid Date'] || '').startsWith(ym)).length
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
                  className="w-full rounded-xl border border-[#e5e7eb] px-3 py-2 text-xs font-semibold hover:bg-[#f4f5f7] transition">
                  View Transactions
                </button>
              </div>
            )
          })}
          {filteredMonths.length === 0 && <p className="py-10 text-center text-sm text-[#697586] col-span-3">No transactions for {yearFilter}.</p>}
        </div>
      </div>
    )
  }

  // ── CUSTOMER TRANSACTIONS — detail ──
  if (tab === 'customers' && selectedCustomer) {
    const custLoans = loans.filter(l => l.customerId === selectedCustomer.customerId)
    const custReps = repayments.filter(r => r['Customer ID'] === selectedCustomer.customerId)
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
          <button onClick={() => setSelectedCustomer(null)} className="rounded-2xl border border-[#e5e7eb] bg-white px-4 py-2 text-sm font-semibold">Back</button>
          <div>
            <p className="text-lg font-semibold">{selectedCustomer.name}</p>
            <p className="text-xs text-[#697586]">{selectedCustomer.phone}</p>
          </div>
        </div>

        {/* Summary stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {([['Total Loans', custLoans.length, ''], ['Total Collected', currency(totalPaid), 'text-green-700'], ['Late Payments', lateCount, 'text-amber-600'], ['Missed', missedCount, 'text-red-600']] as [string, string|number, string][]).map(([l, v, c]) => (
            <div key={l} className="rounded-[1.5rem] border border-white/70 bg-white p-4 shadow-panel text-center">
              <p className="text-xs text-[#697586]">{l}</p>
              <p className={`mt-1 text-xl font-bold ${c}`}>{v}</p>
            </div>
          ))}
        </div>

        {/* Sub-tab bar */}
        <div className="flex gap-2 flex-wrap">
          {custSubTabs.map(t => (
            <button key={t.key} onClick={() => setCustTab(t.key)}
              className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${custTab === t.key ? 'bg-[#1a1a2e] text-white' : 'border border-[#e5e7eb] bg-white text-[#697586] hover:text-[#1a1a2e]'}`}>
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
                  <p className="text-xs text-[#697586]">{loan.startDate} → {loan.endDate} · {loan.guarantorName}</p>
                </div>
                <div className="text-right">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${loan.status === 'Active' ? 'bg-green-100 text-green-700' : loan.status === 'Completed' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>{loan.status}</span>
                  <p className="mt-1 text-xs text-[#697586]">{loan.paidWeeks}/{loan.totalWeeks} wks · {currency(Number(loan.principal))}</p>
                </div>
              </div>
              <div className="divide-y divide-black/5">
                {reps.map(r => (
                  <div key={r['Repayment ID']} className="flex items-center justify-between px-5 py-2.5 text-xs">
                    <div className="flex items-center gap-3">
                      <span className="text-[#697586] w-12">Wk {r['Week No']}</span>
                      <span className="text-[#697586]">Due: {r['Due Date']}</span>
                      {r['Paid Date'] && <span className="text-green-700">Paid: {r['Paid Date']}</span>}
                      {r['Payment Mode'] && <span className="text-[#697586]">{r['Payment Mode']}</span>}
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
                        <p className="text-[#697586]">Paid: {r['Paid Date']}{r['Payment Mode'] ? ` · ${r['Payment Mode']}` : ''}</p>
                      </div>
                      <span className="text-green-700 font-semibold shrink-0">+{currency(Number(r['Amount']))}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="p-5 text-sm text-[#697586]">No payments received yet.</p>}
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
                      <p className="text-[#697586]">{l.startDate} · {l.guarantorName} · <span className={`font-semibold ${l.status === 'Active' ? 'text-green-700' : 'text-blue-700'}`}>{l.status}</span></p>
                      <p className="text-[#697586]">{l.paidWeeks}/{l.totalWeeks} wks · Principal: {currency(Number(l.principal))}</p>
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
                  ['Total Loans', custLoans.length, 'text-[#1a1a2e]', 'border-[#e5e7eb]'],
                  ['Total Disbursed', currency(totalDisbursedH), 'text-red-700', 'border-red-200'],
                  ['Total Repaid', currency(totalPaid), 'text-green-700', 'border-green-200'],
                  ['Outstanding', currency(Math.max(0, outstanding)), 'text-amber-600', 'border-amber-200'],
                ] as [string, string|number, string, string][]).map(([l, v, c, b]) => (
                  <div key={l} className={`rounded-[1.5rem] border ${b} bg-white p-4 shadow-panel text-center`}>
                    <p className="text-xs text-[#697586]">{l}</p>
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
                        <p className="text-xs text-[#697586] mt-0.5">{loan.startDate} → {loan.endDate} · {loan.guarantorName}</p>
                        <p className="text-xs text-[#697586]">{loan.paidWeeks}/{loan.totalWeeks} wks · Principal {currency(Number(loan.principal))}</p>
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
                            <p className="text-[#697586]">{loan.startDate}</p>
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
                                r['Status'] === 'Overdue' ? 'bg-red-100' : 'bg-[#f4f5f7]'
                              }`}>
                                <span className={`font-bold text-[9px] ${
                                  r['Status'] === 'Paid' ? 'text-green-600' :
                                  r['Status'] === 'Delayed' ? 'text-amber-600' :
                                  r['Status'] === 'Overdue' ? 'text-red-600' : 'text-[#697586]'
                                }`}>{r['Week No']}</span>
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1 flex-wrap">
                                  <p className="font-medium">Wk {r['Week No']}</p>
                                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${statusColor(r['Status'])}`}>{r['Status']}</span>
                                </div>
                                <p className="text-[#697586]">Due: {r['Due Date']}</p>
                                {r['Paid Date'] && <p className="text-green-700">Paid: {r['Paid Date']}</p>}
                                <p className={`font-semibold mt-0.5 ${r['Status'] === 'Paid' ? 'text-green-700' : 'text-[#697586]'}`}>
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
    const filtered = customers.filter(c => {
      if (!txSearch) return true
      const q = txSearch.toLowerCase()
      return c.name.toLowerCase().includes(q) || c.phone.includes(txSearch) || c.activeLoanId?.toLowerCase().includes(q)
    })
    return (
      <div className="space-y-4">
        {tabBar}
        <input value={txSearch} onChange={e => setTxSearch(e.target.value)} placeholder="Search name, phone, loan ID…"
          data-no-upper className="w-full max-w-sm rounded-2xl border border-[#e5e7eb] bg-white px-4 py-2.5 text-sm outline-none focus:border-[#1a1a2e]" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map(c => {
            const custReps = repayments.filter(r => r['Customer ID'] === c.customerId)
            const totalPaid = custReps.filter(r => r['Status'] === 'Paid').reduce((s, r) => s + Number(r['Amount'] || 0), 0)
            const lateCount = custReps.filter(r => r['Status'] === 'Delayed').length
            const loanCount = loans.filter(l => l.customerId === c.customerId).length
            return (
              <div key={c.customerId} className="rounded-[1.75rem] border border-white/70 bg-white p-5 shadow-panel space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{c.name}</p>
                    <p className="text-xs text-[#697586]">{c.phone}</p>
                    {c.activeLoanId && <p className="font-mono text-[11px] text-[#697586]">{c.activeLoanId}</p>}
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${c.loanStatus === 'Active' ? 'bg-green-100 text-green-700' : 'bg-[#f4f5f7] text-[#697586]'}`}>{c.loanStatus || 'Inactive'}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-xl bg-[#f4f5f7] p-2 text-center"><p className="text-[#697586]">Loans</p><p className="font-bold">{loanCount}</p></div>
                  <div className="rounded-xl bg-green-50 p-2 text-center"><p className="text-[#697586]">Collected</p><p className="font-bold text-green-700">{currency(totalPaid)}</p></div>
                  <div className={`rounded-xl p-2 text-center ${lateCount > 0 ? 'bg-amber-50' : 'bg-[#f4f5f7]'}`}><p className="text-[#697586]">Late</p><p className={`font-bold ${lateCount > 0 ? 'text-amber-700' : ''}`}>{lateCount}</p></div>
                </div>
                <button onClick={() => setSelectedCustomer(c)} className="w-full rounded-xl border border-[#e5e7eb] px-3 py-2 text-xs font-semibold hover:bg-[#f4f5f7] transition">View Transactions</button>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── GUARANTOR TRANSACTIONS — detail ──
  if (tab === 'guarantors' && selectedGuarantor) {
    const gLoans = loans.filter(l => l.guarantorName === selectedGuarantor.name || l.guarantorCode === selectedGuarantor.code)
    const gSettlements = settlements.filter(s => s['Entity ID'] === selectedGuarantor.guarantorId && s['Entity Type'] === 'GuarantorCommission')
    const totalEarned = gLoans.reduce((s, l) => s + Number(l.guarantorCommission || 0), 0)
    const totalSettled = gSettlements.reduce((s, s2) => s + Number(s2['Amount Submitted'] || 0), 0)
    const balance = totalEarned - totalSettled
    return (
      <div className="space-y-5">
        {tabBar}
        <div className="flex items-center gap-3">
          <button onClick={() => setSelectedGuarantor(null)} className="rounded-2xl border border-[#e5e7eb] bg-white px-4 py-2 text-sm font-semibold">Back</button>
          <div>
            <p className="text-lg font-semibold">{selectedGuarantor.name}</p>
            <p className="text-xs text-[#697586] font-mono">{selectedGuarantor.code}</p>
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
          <div className={`rounded-[1.5rem] border p-4 text-center ${balance > 0 ? 'border-amber-200 bg-amber-50' : 'border-[#e5e7eb] bg-[#f4f5f7]'}`}>
            <p className="text-xs font-semibold text-[#697586]">Balance Due</p>
            <p className={`mt-1 text-xl font-bold ${balance > 0 ? 'text-amber-700' : 'text-[#1a1a2e]'}`}>{currency(balance)}</p>
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
                    <p className="text-[#697586] font-mono">{l.loanId} · {l.startDate} · <span className={`font-semibold ${l.status === 'Active' ? 'text-green-700' : 'text-blue-700'}`}>{l.status}</span></p>
                  </div>
                  <span className="font-semibold text-green-700 shrink-0">+{currency(Number(l.guarantorCommission || 0))}</span>
                </div>
              ))}
              {gLoans.length === 0 && <p className="p-5 text-sm text-[#697586]">No commissions.</p>}
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
                    <p className="text-[#697586]">
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
              {gSettlements.length === 0 && <p className="p-5 text-sm text-[#697586]">No settlements.</p>}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── GUARANTOR TRANSACTIONS — cards ──
  if (tab === 'guarantors') {
    const filtered = guarantors.filter(g => {
      if (!gSearch) return true
      const q = gSearch.toLowerCase()
      return g.name?.toLowerCase().includes(q) || g.code?.toLowerCase().includes(q)
    })
    return (
      <div className="space-y-4">
        {tabBar}
        <input value={gSearch} onChange={e => setGSearch(e.target.value)} placeholder="Search guarantor name or code…"
          data-no-upper className="w-full max-w-sm rounded-2xl border border-[#e5e7eb] bg-white px-4 py-2.5 text-sm outline-none focus:border-[#1a1a2e]" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map(g => {
            const gLoans = loans.filter(l => l.guarantorName === g.name || l.guarantorCode === g.code)
            const gStl = settlements.filter(s => s['Entity ID'] === g.guarantorId && s['Entity Type'] === 'GuarantorCommission')
            const earned = gLoans.reduce((s, l) => s + Number(l.guarantorCommission || 0), 0)
            const settled = gStl.reduce((s, s2) => s + Number(s2['Amount Submitted'] || 0), 0)
            return (
              <div key={g.guarantorId} className="rounded-[1.75rem] border border-white/70 bg-white p-5 shadow-panel space-y-3">
                <div>
                  <p className="font-semibold">{g.name}</p>
                  <p className="text-xs font-mono text-[#697586]">{g.code}</p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-xl bg-[#f4f5f7] p-2 text-center"><p className="text-[#697586]">Loans</p><p className="font-bold">{gLoans.length}</p></div>
                  <div className="rounded-xl bg-green-50 p-2 text-center"><p className="text-[#697586]">Earned</p><p className="font-bold text-green-700">{currency(earned)}</p></div>
                  <div className={`rounded-xl p-2 text-center ${earned - settled > 0 ? 'bg-amber-50' : 'bg-[#f4f5f7]'}`}><p className="text-[#697586]">Balance</p><p className={`font-bold ${earned - settled > 0 ? 'text-amber-700' : ''}`}>{currency(earned - settled)}</p></div>
                </div>
                <button onClick={() => setSelectedGuarantor(g)} className="w-full rounded-xl border border-[#e5e7eb] px-3 py-2 text-xs font-semibold hover:bg-[#f4f5f7] transition">View Transactions</button>
              </div>
            )
          })}
          {filtered.length === 0 && <p className="py-10 text-center text-sm text-[#697586]">No guarantors found.</p>}
        </div>
      </div>
    )
  }

  return null
}
