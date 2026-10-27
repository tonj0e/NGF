'use client'
import { useEffect, useRef, useState } from 'react'
import { Session } from '@/types'
import jsQR from 'jsqr'
import { formatINR, formatDateIN } from '@/lib/format'

const currency = (n: number) => formatINR(n)

type Loan = {
  loanId: string; customerId?: string; customerName?: string; status?: string; startDate?: string
  principal?: number | string; paidWeeks?: number; totalWeeks?: number
  guarantorCommission?: number | string; guarantorCode?: string; guarantorName?: string
}
type Settlement = {
  'Settlement ID': string; 'Settlement Date'?: string; 'Saturday Date'?: string; 'Entity ID'?: string
  'Entity Type'?: string; 'Amount Submitted'?: string | number; Status?: string; Notes?: string
}
type Cycle = { cycleStart: string; settlementDue: string; scheduledSaturday: string; daysLeft: number; isOverdue: boolean; cycleLoans: Loan[]; totalCommission: number; loanCount: number }
type QrPayload = { t: string; uid?: string; gn?: string; amt: number; pid?: string; pf?: string; pt?: string; rid?: string; typ?: string; rd?: string }

function getMonday(dateStr: string): string {
  const d = new Date(dateStr)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function daysBetween(from: string, to: string): number {
  return Math.floor((new Date(to).getTime() - new Date(from).getTime()) / 86400000)
}

// Commission cycle: 35 days, settlement on Saturday (Day 35)
// Next cycle starts Monday after scheduled Saturday
// If settled early (before Saturday) → still wait until Monday
// If settled late (delayed/held) → next cycle starts day after actual settlement
// Loans starting during cycle window (cycleStart to settlementDue) are included
function calcCycle(gLoans: Loan[], gSettlements: Settlement[]): Cycle | null {
  const activeLoans = gLoans.filter(l => l.status === 'Active' && l.startDate) as (Loan & { startDate: string })[]
  if (!activeLoans.length) return null

  const sortedSettlements = [...gSettlements]
    .filter(s => s['Settlement Date'])
    .sort((a, b) => (a['Settlement Date'] || '').localeCompare(b['Settlement Date'] || ''))
  const lastSettlement = sortedSettlements.length
    ? sortedSettlements[sortedSettlements.length - 1]
    : null

  const sortedLoans = [...activeLoans].sort((a, b) => a.startDate.localeCompare(b.startDate))

  // Determine this cycle's start and scheduled settlement Saturday
  let cycleStart: string
  let scheduledSaturday: string

  if (lastSettlement) {
    const lastSettlementDate = lastSettlement['Settlement Date'] as string
    const lastSaturday = lastSettlement['Saturday Date'] || lastSettlementDate

    // Check if last settlement was delayed (after its scheduled Saturday)
    const wasDelayed = lastSettlementDate > lastSaturday

    if (wasDelayed) {
      // Delayed: next cycle starts day after actual settlement
      cycleStart = addDays(lastSettlementDate, 1)
    } else {
      // On-time or early: next cycle starts Monday after scheduled Saturday
      cycleStart = addDays(lastSaturday, 2) // Saturday + 2 = Monday
    }
  } else {
    // First cycle: starts on Monday of earliest active loan
    cycleStart = getMonday(sortedLoans[0].startDate)
  }

  // Scheduled settlement Saturday = Day 35 of cycle (cycleStart + 34 days)
  scheduledSaturday = addDays(cycleStart, 34)
  const settlementDue = scheduledSaturday // due on Saturday

  // Include loans active AND started on or before settlement Saturday
  const cycleLoans = activeLoans.filter(l => l.startDate <= settlementDue)

  const today = new Date().toISOString().slice(0, 10)
  const daysLeft = daysBetween(today, settlementDue)

  return {
    cycleStart,
    settlementDue,
    scheduledSaturday,
    daysLeft,
    isOverdue: daysLeft < 0,
    cycleLoans,
    totalCommission: cycleLoans.reduce((s, l) => s + Number(l.guarantorCommission || 0), 0),
    loanCount: cycleLoans.length,
  }
}

type Guarantor = { guarantorId: string; userId?: string; name: string; code: string; phone?: string; status?: string }
type DetailTab = 'overview' | 'settlement' | 'history' | 'commission' | 'deposits'

export default function GuarantorPage({ session }: { session: Session }) {
  const [guarantors, setGuarantors] = useState<Guarantor[]>([])
  const [loans, setLoans] = useState<Loan[]>([])
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Guarantor | null>(null)
  const [detailTab, setDetailTab] = useState<DetailTab>('overview')
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState('')
  const [ledgerMonth, setLedgerMonth] = useState('')
  const [ledgerStatus, setLedgerStatus] = useState('')
  const [showScanner, setShowScanner] = useState(false)
  const [manualPayoutGuarantor, setManualPayoutGuarantor] = useState<Guarantor | null>(null)

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(''), 3000) }

  const loadedOnce = useRef(false)
  function load() {
    if (!loadedOnce.current) setLoading(true)
    Promise.all([
      fetch('/api/staff', { headers: { Authorization: `Bearer ${session.token}` } }).then(r => r.json()),
      fetch('/api/loans?filter=all', { headers: { Authorization: `Bearer ${session.token}` } }).then(r => r.json()),
      fetch('/api/settlements', { headers: { Authorization: `Bearer ${session.token}` } }).then(r => r.json()),
      fetch('/api/customers', { headers: { Authorization: `Bearer ${session.token}` } }).then(r => r.json()),
    ]).then(([sR, lR, stR, cR]) => {
      const bad = [sR, lR, stR, cR].find(r => r && r.success === false)
      if (bad) showToast(bad.error || 'Some data failed to load')
      setGuarantors(sR.data?.guarantors || [])
      setLoans(lR.data?.loans || [])
      setSettlements(stR.data?.settlements || [])
      setCustomers(cR.data?.customers || [])
    }).catch(() => showToast('Could not load guarantor data. Check your connection.')).finally(() => { loadedOnce.current = true; setLoading(false) })
  }

  useEffect(() => { load() }, [])

  if (loading && !loadedOnce.current) return <div className="flex h-40 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-ink border-t-transparent" /></div>

  // ── DETAIL VIEW ──
  if (selected) {
    const g = selected
    const gLoans = loans.filter(l => l.guarantorCode === g.code || l.guarantorName === g.name)
    const gSettlements = settlements.filter(s => s['Entity ID'] === g.guarantorId && s['Entity Type'] === 'GuarantorCommission')
    const gCustomers = customers.filter(c => !!gLoans.find(l => l.customerId === c.customerId))
    const totalEarned = gLoans.reduce((s, l) => s + Number(l.guarantorCommission || 0), 0)
    const totalPaid = gSettlements.reduce((s, s2) => s + Number(s2['Amount Submitted'] || 0), 0)
    const balance = totalEarned - totalPaid
    const activeLoans = gLoans.filter(l => l.status === 'Active').length
    const cycle = calcCycle(gLoans, gSettlements)

    const TABS: { key: DetailTab; label: string }[] = [
      { key: 'overview',   label: 'Overview' },
      { key: 'settlement', label: 'Commission Settlement' },
      { key: 'history',    label: 'Payment History' },
      { key: 'commission', label: 'Commission Credits' },
      { key: 'deposits',   label: 'Deposits' },
    ]

    return (
      <div className="space-y-5">
        {toast && <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-2xl bg-ink px-5 py-3 text-sm font-medium text-white shadow-lg">{toast}</div>}

        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => { setSelected(null); setDetailTab('overview') }}
            className="rounded-2xl border border-line bg-white px-4 py-2 text-sm font-semibold">Back</button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="text-lg font-semibold">{g.name}</p>
              <span className="rounded-full bg-mist px-3 py-1 text-xs font-semibold font-mono">{g.code}</span>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${g.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{g.status}</span>
            </div>
            {g.phone && <p className="text-xs text-soft">{g.phone}</p>}
          </div>
        </div>

        {/* Sub tabs */}
        <div className="flex gap-2 flex-wrap">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setDetailTab(t.key)}
              className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${detailTab === t.key ? 'bg-ink text-white' : 'border border-line bg-white text-soft hover:text-ink'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW ── */}
        {detailTab === 'overview' && (
          <div className="space-y-4">
            {cycle && (
              <div className={`flex items-center justify-between rounded-[1.75rem] border px-5 py-4 ${cycle.isOverdue ? 'border-red-300 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
                <div>
                  <p className={`text-sm font-bold ${cycle.isOverdue ? 'text-red-700' : 'text-amber-800'}`}>
                    {cycle.isOverdue ? '⚠ Commission Settlement Overdue' : '📅 Commission Settlement Due'}
                  </p>
                  <p className="text-xs text-soft">
                    Due: {formatDateIN(cycle.settlementDue)} · Cycle from: {formatDateIN(cycle.cycleStart)} · {cycle.loanCount} active loan(s) · Commission: {currency(cycle.totalCommission)}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${cycle.isOverdue ? 'bg-red-200 text-red-800' : 'bg-amber-200 text-amber-800'}`}>
                  {cycle.isOverdue ? `${Math.abs(cycle.daysLeft)}d overdue` : cycle.daysLeft === 0 ? 'Due today' : `${cycle.daysLeft}d left`}
                </span>
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="rounded-[1.5rem] border border-white/70 bg-white p-4 shadow-panel text-center">
                <p className="text-xs text-soft">Total Loans</p>
                <p className="mt-1 text-2xl font-bold">{gLoans.length}</p>
                <p className="text-[10px] text-soft">{activeLoans} active</p>
              </div>
              <div className="rounded-[1.5rem] border border-green-200 bg-green-50 p-4 shadow-panel text-center">
                <p className="text-xs text-green-700 font-medium">Commission Earned</p>
                <p className="mt-1 text-xl font-bold text-green-800">{currency(totalEarned)}</p>
              </div>
              <div className="rounded-[1.5rem] border border-blue-200 bg-blue-50 p-4 shadow-panel text-center">
                <p className="text-xs text-blue-700 font-medium">Commission Paid</p>
                <p className="mt-1 text-xl font-bold text-blue-800">{currency(totalPaid)}</p>
              </div>
              <CommissionBalanceCard balance={balance} />
            </div>

            <div className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel p-6 space-y-4">
              <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-soft">Guarantor Info</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                {[['Name', g.name], ['Code', g.code], ['Phone', g.phone || '—'], ['Status', g.status], ['Guarantor ID', g.guarantorId]].map(([l, v]) => (
                  <div key={l}>
                    <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-soft">{l}</p>
                    <p className="mt-0.5 font-medium font-mono text-xs">{v}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel overflow-hidden">
              <div className="border-b border-black/5 px-5 py-4">
                <p className="text-sm font-semibold">Customers ({gCustomers.length})</p>
              </div>
              <div className="divide-y divide-black/5">
                {gCustomers.map(c => {
                  const loan = gLoans.find(l => l.customerId === c.customerId)
                  return (
                    <div key={c.customerId} className="flex items-center justify-between px-5 py-3 text-xs">
                      <div>
                        <p className="font-medium">{c.name}</p>
                        <p className="text-soft">{c.phone} · <span className="font-mono">{loan?.loanId || '—'}</span></p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${loan?.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-mist text-soft'}`}>
                        {loan?.status || '—'}
                      </span>
                    </div>
                  )
                })}
                {gCustomers.length === 0 && <p className="p-5 text-sm text-soft">No customers.</p>}
              </div>
            </div>
          </div>
        )}

        {/* ── COMMISSION SETTLEMENT ── */}
        {detailTab === 'settlement' && (() => {
          const cycle = calcCycle(gLoans, gSettlements)
          return (
            <div className="space-y-4">
              {cycle ? (
                <div className={`rounded-[1.75rem] border p-5 shadow-panel space-y-3 ${cycle.isOverdue ? 'border-red-300 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
                  <div className="flex items-center justify-between">
                    <p className={`text-sm font-bold ${cycle.isOverdue ? 'text-red-700' : 'text-amber-800'}`}>
                      {cycle.isOverdue ? '⚠ Commission Settlement Overdue' : '📅 Commission Settlement Due'}
                    </p>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${cycle.isOverdue ? 'bg-red-200 text-red-800' : 'bg-amber-200 text-amber-800'}`}>
                      {cycle.isOverdue ? `${Math.abs(cycle.daysLeft)} days overdue` : cycle.daysLeft === 0 ? 'Due today' : `${cycle.daysLeft} days left`}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div>
                      <p className="text-soft">Cycle Start</p>
                      <p className="font-semibold">{formatDateIN(cycle.cycleStart)}</p>
                    </div>
                    <div>
                      <p className="text-soft">Settlement Due (Day 35)</p>
                      <p className={`font-semibold ${cycle.isOverdue ? 'text-red-700' : 'text-amber-800'}`}>{formatDateIN(cycle.settlementDue)}</p>
                    </div>
                    <div>
                      <p className="text-soft">Active Loans</p>
                      <p className="font-semibold">{cycle.loanCount}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-soft mb-2">Commission breakdown for active loans:</p>
                    <div className="space-y-1">
                      {cycle.cycleLoans.map(l => (
                        <div key={l.loanId} className="flex items-center justify-between rounded-xl bg-white/70 px-3 py-2 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{l.customerName}</span>
                            <span className="font-mono text-soft">{l.loanId}</span>
                          </div>
                          <span className="font-bold text-green-700">+{currency(Number(l.guarantorCommission || 0))}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex justify-between rounded-xl bg-white/70 px-3 py-2 text-xs font-bold">
                      <span>Total Commission This Cycle</span>
                      <span className="text-green-700">+{currency(cycle.totalCommission)}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-[1.75rem] border border-line bg-panel p-5 text-sm text-soft">
                  No active loans — no commission cycle to settle.
                </div>
              )}

              <CommissionPaymentForm
                guarantor={g}
                cycle={cycle}
                balance={balance}
                session={session}
                onDone={() => { load(); showToast('Commission payment recorded.'); setDetailTab('history') }}
              />
            </div>
          )
        })()}

        {/* ── PAYMENT HISTORY ── */}
        {detailTab === 'history' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-[1.5rem] border border-white/70 bg-white p-4 shadow-panel text-center">
                <p className="text-xs text-soft">Total Payments</p>
                <p className="mt-1 text-2xl font-bold">{gSettlements.length}</p>
              </div>
              <div className="rounded-[1.5rem] border border-blue-200 bg-blue-50 p-4 shadow-panel text-center">
                <p className="text-xs text-blue-700">Commission Paid</p>
                <p className="mt-1 text-xl font-bold text-blue-800">{currency(totalPaid)}</p>
              </div>
              <CommissionBalanceCard balance={balance} />
            </div>
            <div className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel overflow-hidden">
              <div className="border-b border-black/5 px-5 py-4">
                <p className="text-sm font-semibold">Commission Payment Records</p>
              </div>
              {gSettlements.length === 0 ? (
                <p className="p-5 text-sm text-soft">No payments recorded yet.</p>
              ) : (
                <div className="divide-y divide-black/5">
                  {[...gSettlements].reverse().map(s => (
                    <div key={s['Settlement ID']} className="flex items-center justify-between px-5 py-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold">{formatDateIN(s['Settlement Date'])}</p>
                          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${s['Status'] === 'Settled' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{s['Status']}</span>
                        </div>
                        <p className="text-xs text-soft">Payment date: {formatDateIN(s['Saturday Date'])}</p>
                        {s['Notes'] && <p className="text-xs text-soft">{s['Notes']}</p>}
                      </div>
                      <p className="text-base font-bold text-green-700">+{currency(Number(s['Amount Submitted'] || 0))}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── COMMISSION CREDITS ── */}
        {detailTab === 'commission' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-[1.5rem] border border-green-200 bg-green-50 p-4 shadow-panel text-center">
                <p className="text-xs text-green-700">Total Earned</p>
                <p className="mt-1 text-xl font-bold text-green-800">{currency(totalEarned)}</p>
              </div>
              <div className="rounded-[1.5rem] border border-blue-200 bg-blue-50 p-4 shadow-panel text-center">
                <p className="text-xs text-blue-700">Commission Paid</p>
                <p className="mt-1 text-xl font-bold text-blue-800">{currency(totalPaid)}</p>
              </div>
              <CommissionBalanceCard balance={balance} />
            </div>

            {(() => {
              const months = Array.from(new Set(gLoans.map(l => (l.startDate || '').slice(0, 7)).filter(Boolean))).sort().reverse()
              const statuses = Array.from(new Set(gLoans.map(l => l.status || '').filter(Boolean)))
              const rows = gLoans.filter(l => (!ledgerMonth || (l.startDate || '').startsWith(ledgerMonth)) && (!ledgerStatus || l.status === ledgerStatus))
              const rowsTotal = rows.reduce((s, l) => s + Number(l.guarantorCommission || 0), 0)
              const filterCls = 'rounded-xl border border-line bg-white px-3 py-2 text-xs outline-none focus:border-ink'
              return (
                <div className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/5 px-5 py-4">
                    <p className="text-sm font-semibold">Commission Ledger</p>
                    <div className="flex flex-wrap gap-2">
                      <select value={ledgerMonth} onChange={e => setLedgerMonth(e.target.value)} className={filterCls}>
                        <option value="">All months</option>
                        {months.map(m => <option key={m} value={m}>{formatDateIN(`${m}-01`).replace(/^\d+\s/, '')}</option>)}
                      </select>
                      <select value={ledgerStatus} onChange={e => setLedgerStatus(e.target.value)} className={filterCls}>
                        <option value="">All statuses</option>
                        {statuses.map(st => <option key={st} value={st}>{st}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-left text-sm">
                      <thead className="border-b border-black/5 bg-panel text-soft">
                        <tr>{['Customer', 'Loan ID', 'Status', 'Start date', 'Principal', 'Weeks paid', 'Commission'].map(h => <th key={h} className="px-5 py-3 text-xs font-medium">{h}</th>)}</tr>
                      </thead>
                      <tbody className="divide-y divide-black/5">
                        {rows.map(l => (
                          <tr key={l.loanId}>
                            <td className="px-5 py-3 font-medium">{l.customerName}</td>
                            <td className="px-5 py-3 font-mono text-xs text-soft">{l.loanId}</td>
                            <td className="px-5 py-3"><span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${l.status === 'Active' ? 'bg-green-100 text-green-700' : l.status === 'Completed' ? 'bg-blue-100 text-blue-700' : 'bg-mist text-soft'}`}>{l.status}</span></td>
                            <td className="px-5 py-3 text-xs text-soft">{formatDateIN(l.startDate)}</td>
                            <td className="px-5 py-3 text-xs">{currency(Number(l.principal || 0))}</td>
                            <td className="px-5 py-3 text-xs">{l.paidWeeks}/{l.totalWeeks}</td>
                            <td className="px-5 py-3 font-bold text-green-700">+{currency(Number(l.guarantorCommission || 0))}</td>
                          </tr>
                        ))}
                        {rows.length === 0 && <tr><td colSpan={7} className="p-5 text-sm text-soft">No commission records{gLoans.length ? ' for this filter' : ''}.</td></tr>}
                      </tbody>
                      {rows.length > 0 && (
                        <tfoot className="border-t border-black/5 bg-panel">
                          <tr>
                            <td colSpan={6} className="px-5 py-3 text-sm font-semibold">Total commission ({rows.length} loan{rows.length === 1 ? '' : 's'}{ledgerMonth || ledgerStatus ? ', filtered' : ''})</td>
                            <td className="px-5 py-3 text-base font-bold text-green-700">+{currency(rowsTotal)}</td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {/* ── DEPOSITS ── */}
        {detailTab === 'deposits' && <DepositAdmin guarantorId={g.guarantorId} session={session} />}
      </div>
    )
  }

  // ── GUARANTOR CARDS LIST ──
  const filtered = guarantors.filter(g => {
    if (!search) return true
    const q = search.toLowerCase()
    return g.name?.toLowerCase().includes(q) || g.code?.toLowerCase().includes(q) || g.phone?.includes(search)
  })

  return (
    <div className="space-y-4">
      {toast && <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-2xl bg-ink px-5 py-3 text-sm font-medium text-white shadow-lg">{toast}</div>}

      {/* Scanner modal */}
      {showScanner && (
        <QrPayoutScanner
          guarantors={guarantors}
          session={session}
          onClose={() => setShowScanner(false)}
          onDone={(g) => { setShowScanner(false); load(); showToast(`Payout recorded for ${g.name}`) }}
        />
      )}

      {/* Manual payout modal */}
      {manualPayoutGuarantor && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-[1.75rem] bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-black/5">
              <div>
                <p className="font-semibold">Record Payout</p>
                <p className="text-xs text-soft mt-0.5">{manualPayoutGuarantor.name}</p>
              </div>
              <button onClick={() => setManualPayoutGuarantor(null)} className="rounded-full p-1.5 hover:bg-mist">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <CommissionPaymentForm
              guarantor={manualPayoutGuarantor}
              cycle={calcCycle(loans.filter(l => l.guarantorCode === manualPayoutGuarantor.code || l.guarantorName === manualPayoutGuarantor.name), settlements.filter(s => s['Entity ID'] === manualPayoutGuarantor.guarantorId))}
              balance={(() => { const gl = loans.filter(l => l.guarantorCode === manualPayoutGuarantor.code || l.guarantorName === manualPayoutGuarantor.name); const gs = settlements.filter(s => s['Entity ID'] === manualPayoutGuarantor.guarantorId); return gl.reduce((s,l) => s+Number(l.guarantorCommission||0),0) - gs.reduce((s,s2) => s+Number(s2['Amount Submitted']||0),0) })()}
              session={session}
              onDone={() => { setManualPayoutGuarantor(null); load(); showToast('Payout recorded.') }}
            />
          </div>
        </div>
      )}

      {/* Header row: search + action buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search guarantor name or code…"
          data-no-upper className="flex-1 min-w-0 max-w-sm rounded-2xl border border-line bg-white px-4 py-2.5 text-sm outline-none focus:border-ink" />
        <button onClick={() => setShowScanner(true)}
          className="rounded-2xl bg-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#2d2d4e] transition shrink-0">
          Scan QR
        </button>
        <div className="relative group shrink-0">
          <button className="rounded-2xl border border-line bg-white px-4 py-2.5 text-sm font-semibold hover:bg-mist transition">
            Record Payout ▾
          </button>
          <div className="absolute right-0 top-full mt-1 z-20 hidden group-focus-within:block group-hover:block w-56 rounded-2xl border border-line bg-white shadow-lg overflow-hidden">
            {guarantors.filter(g => g.status === 'Active').map(g => (
              <button key={g.guarantorId} onClick={() => setManualPayoutGuarantor(g)}
                className="w-full px-4 py-2.5 text-left text-sm hover:bg-mist transition">
                <p className="font-medium">{g.name}</p>
                <p className="text-xs text-soft font-mono">{g.code}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map(g => {
          const gLoans = loans.filter(l => l.guarantorCode === g.code || l.guarantorName === g.name)
          const gSettlements = settlements.filter(s => s['Entity ID'] === g.guarantorId && s['Entity Type'] === 'GuarantorCommission')
          const earned = gLoans.reduce((s, l) => s + Number(l.guarantorCommission || 0), 0)
          const paid = gSettlements.reduce((s, s2) => s + Number(s2['Amount Submitted'] || 0), 0)
          const balance = earned - paid
          const activeLoans = gLoans.filter(l => l.status === 'Active').length
          const gCycle = calcCycle(gLoans, gSettlements)
          return (
            <div key={g.guarantorId} className={`rounded-[1.75rem] border bg-white p-5 shadow-panel space-y-4 ${gCycle?.isOverdue ? 'border-red-300' : 'border-white/70'}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{g.name}</p>
                  <p className="text-xs font-mono text-soft">{g.code}</p>
                  {g.phone && <p className="text-xs text-soft">{g.phone}</p>}
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${g.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{g.status}</span>
              </div>
              {gCycle && (
                <div className={`rounded-xl px-3 py-2 text-xs flex items-center justify-between ${gCycle.isOverdue ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                  <span>{gCycle.isOverdue ? '⚠ Commission overdue' : '📅 Commission due'}: {formatDateIN(gCycle.settlementDue)}</span>
                  <span className="font-bold">{gCycle.isOverdue ? `${Math.abs(gCycle.daysLeft)}d late` : `${gCycle.daysLeft}d left`}</span>
                </div>
              )}
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-xl bg-mist p-2.5 text-center">
                  <p className="text-soft">Loans</p>
                  <p className="font-bold mt-0.5">{gLoans.length}</p>
                  <p className="text-[10px] text-soft">{activeLoans} active</p>
                </div>
                <div className="rounded-xl bg-green-50 p-2.5 text-center">
                  <p className="text-soft">Earned</p>
                  <p className="font-bold text-green-700 mt-0.5">{currency(earned)}</p>
                </div>
                <div className={`rounded-xl p-2.5 text-center ${balance > 0 ? 'bg-amber-50' : balance < 0 ? 'bg-gray-50' : 'bg-green-50'}`}>
                  <p className="text-soft">{balance < 0 ? 'Overpaid' : 'Due'}</p>
                  <p className={`font-bold mt-0.5 ${balance > 0 ? 'text-amber-700' : balance < 0 ? 'text-soft' : 'text-green-700'}`}>
                    {balance < 0 ? currency(Math.abs(balance)) : currency(balance)}
                  </p>
                </div>
              </div>
              <button onClick={() => { setSelected(g); setDetailTab('overview') }}
                className="w-full rounded-xl border border-line px-3 py-2 text-xs font-semibold hover:bg-mist transition">
                View
              </button>
            </div>
          )
        })}
        {filtered.length === 0 && <p className="py-10 text-center text-sm text-soft">No guarantors found.</p>}
      </div>
    </div>
  )
}

// ── QR PAYOUT SCANNER (list-level) ──
function QrPayoutScanner({ guarantors, session, onClose, onDone }: {
  guarantors: Guarantor[]; session: Session; onClose: () => void; onDone: (g: Guarantor) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number>(0)
  const [scanned, setScanned] = useState<QrPayload | null>(null)
  const [matchedG, setMatchedG] = useState<Guarantor | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')

  const stopCamera = () => {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  const tick = () => {
    const video = videoRef.current; const canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2 || video.videoWidth === 0) { rafRef.current = requestAnimationFrame(tick); return }
    canvas.width = video.videoWidth; canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) { rafRef.current = requestAnimationFrame(tick); return }
    ctx.drawImage(video, 0, 0)
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const code = jsQR(img.data, img.width, img.height)
    if (code?.data) {
      try {
        const data = JSON.parse(code.data) as QrPayload
        if (data.t === 'NGF_PAYOUT' || data.t === 'NGF_DEPOSIT_PAYOUT') {
          stopCamera()
          const g = guarantors.find(g => g.userId === data.uid) ?? guarantors.find(g => g.name === data.gn) ?? null
          if (!g) { setError(`Guarantor not found for "${data.gn}"`); return }
          setScanned(data); setMatchedG(g); return
        }
      } catch {}
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  useEffect(() => {
    let cancelled = false
    const start = async () => {
      const constraints = [{ video: { facingMode: { exact: 'environment' } } }, { video: { facingMode: 'environment' } }, { video: true }]
      let stream: MediaStream | null = null
      for (const c of constraints) { try { stream = await navigator.mediaDevices.getUserMedia(c); break } catch {} }
      if (cancelled) { stream?.getTracks().forEach(t => t.stop()); return }
      if (!stream) { setError('Camera unavailable. Check permissions.'); return }
      streamRef.current = stream
      const video = videoRef.current
      if (!video) return
      video.srcObject = stream; video.muted = true; video.playsInline = true
      try { await video.play() } catch {}
      rafRef.current = requestAnimationFrame(tick)
    }
    const t = setTimeout(start, 80)
    return () => { cancelled = true; clearTimeout(t); stopCamera() }
  }, [])

  const confirmPayout = async () => {
    if (!scanned || !matchedG) return
    setConfirming(true)

    // Deposit withdrawal receipt → approve the deposit request
    if (scanned.t === 'NGF_DEPOSIT_PAYOUT') {
      const res = await fetch('/api/deposits/request', {
        method: 'PATCH', headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: scanned.rid }),
      }).then(r => r.json()).catch(() => ({ success: false, error: 'Network error' }))
      setConfirming(false)
      if (!res.success) { setError(res.error || 'Failed to approve deposit withdrawal'); return }
      onDone(matchedG); return
    }

    if (!scanned.pid) { setConfirming(false); setError('QR code has no payout ID'); return }

    // Step 1: mark the payout request Paid first. The server only allows this while it is Pending,
    // so a second attempt is refused and money can never be recorded twice.
    let patchRes: { success?: boolean; error?: string }
    try {
      patchRes = await fetch('/api/commissions/payout', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ payoutId: scanned.pid, action: 'approve' }),
      }).then(r => r.json())
    } catch { setConfirming(false); setError('Network error while approving the payout. Nothing was recorded.'); return }
    if (!patchRes.success) { setConfirming(false); setError(patchRes.error || 'Could not approve the payout. Nothing was recorded.'); return }

    // Step 2: record the settlement.
    const today = new Date().toISOString().slice(0, 10)
    let res: { success?: boolean; error?: string }
    try {
      res = await fetch('/api/settlements', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityType: 'GuarantorCommission', entityId: matchedG.guarantorId, entityName: matchedG.name,
          saturdayDate: today, totalCashDue: scanned.amt, totalUpiDue: 0, amountSubmitted: scanned.amt,
          notes: `QR Payout · ${scanned.pid} · Period: ${scanned.pf} to ${scanned.pt}`,
          recordedBy: session.userId,
        }),
      }).then(r => r.json())
    } catch { res = { success: false, error: 'Network error' } }
    setConfirming(false)
    if (!res.success) { setError(`Payout ${scanned.pid} is marked Paid but the settlement was NOT recorded (${res.error || 'unknown error'}). Use Record Payout to add it manually; do not scan again.`); return }
    onDone(matchedG)
  }

  if (scanned && matchedG) {
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-md rounded-[1.75rem] bg-white shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-black/5">
            <p className="font-semibold text-green-700">QR Decoded</p>
            <button onClick={onClose} className="rounded-full p-1.5 hover:bg-mist">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="p-5 space-y-4">
            <div className="rounded-2xl bg-green-50 border border-green-200 p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div><p className="text-[9px] font-bold uppercase tracking-wide text-soft">Guarantor</p><p className="font-semibold mt-0.5">{matchedG.name}</p></div>
                <div><p className="text-[9px] font-bold uppercase tracking-wide text-soft">Amount</p><p className="font-bold text-green-700 text-base mt-0.5">{formatINR(scanned.amt)}</p></div>
                {scanned.t === 'NGF_DEPOSIT_PAYOUT' ? (
                  <>
                    <div><p className="text-[9px] font-bold uppercase tracking-wide text-soft">Withdrawal</p><p className="font-semibold mt-0.5">{scanned.typ}</p></div>
                    <div><p className="text-[9px] font-bold uppercase tracking-wide text-soft">Date</p><p className="font-semibold mt-0.5">{formatDateIN(scanned.rd)}</p></div>
                    <div className="col-span-2"><p className="text-[9px] font-bold uppercase tracking-wide text-soft">Request ID</p><p className="font-mono text-[10px] mt-0.5">{scanned.rid}</p></div>
                  </>
                ) : (
                  <>
                    <div><p className="text-[9px] font-bold uppercase tracking-wide text-soft">Period From</p><p className="font-semibold mt-0.5">{formatDateIN(scanned.pf)}</p></div>
                    <div><p className="text-[9px] font-bold uppercase tracking-wide text-soft">Payout date</p><p className="font-semibold mt-0.5">{formatDateIN(scanned.pt)}</p></div>
                    <div className="col-span-2"><p className="text-[9px] font-bold uppercase tracking-wide text-soft">Payout ID</p><p className="font-mono text-[10px] mt-0.5">{scanned.pid}</p></div>
                  </>
                )}
              </div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-3">
              <button onClick={confirmPayout} disabled={confirming}
                className="flex-1 rounded-2xl bg-green-700 py-3 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-60 transition">
                {confirming ? 'Recording…' : (scanned.t === 'NGF_DEPOSIT_PAYOUT' ? 'Confirm & Pay Withdrawal' : 'Confirm & Record Payment')}
              </button>
              <button onClick={() => { setScanned(null); setMatchedG(null); setError('') }}
                className="rounded-2xl border border-line px-5 py-3 text-sm font-semibold hover:bg-mist transition">
                Rescan
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black" onClick={onClose}>
      <div className="flex items-center justify-between px-4 pt-10 pb-3" onClick={e => e.stopPropagation()}>
        <p className="text-white font-semibold">Scan Payout QR</p>
        <button onClick={onClose} className="rounded-full bg-white/20 px-4 py-1.5 text-sm text-white font-medium">Cancel</button>
      </div>
      <div className="flex-1 relative flex items-center justify-center" onClick={e => e.stopPropagation()}>
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline autoPlay muted />
        <div className="relative z-10 flex flex-col items-center">
          <div className="h-64 w-64 rounded-2xl border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]" />
          <p className="mt-5 text-white/80 text-sm">Point camera at the QR code</p>
        </div>
      </div>
      <canvas ref={canvasRef} className="hidden" />
      {error && <p className="px-5 py-3 text-center text-sm text-red-300 bg-red-900/40">{error}</p>}
      <div className="h-10" />
    </div>
  )
}

// ── COMMISSION BALANCE CARD ──
function CommissionBalanceCard({ balance }: { balance: number }) {
  if (balance > 0) return (
    <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-4 shadow-panel text-center">
      <p className="text-xs font-medium text-amber-700">Commission Due</p>
      <p className="mt-1 text-xl font-bold text-amber-700">{formatINR(balance)}</p>
    </div>
  )
  if (balance < 0) return (
    <div className="rounded-[1.5rem] border border-line bg-panel p-4 shadow-panel text-center">
      <p className="text-xs font-medium text-soft">Overpaid</p>
      <p className="mt-1 text-xl font-bold text-soft">{formatINR(Math.abs(balance))}</p>
    </div>
  )
  return (
    <div className="rounded-[1.5rem] border border-green-200 bg-green-50 p-4 shadow-panel text-center">
      <p className="text-xs font-medium text-green-700">All Settled</p>
      <p className="mt-1 text-xl font-bold text-green-700">₹0</p>
    </div>
  )
}

// ── COMMISSION PAYMENT FORM ──
function CommissionPaymentForm({ guarantor, balance, cycle, session, onDone }: {
  guarantor: Guarantor; balance: number; cycle: Cycle | null; session: Session; onDone: () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const defaultAmount = cycle && cycle.totalCommission > 0
    ? String(cycle.totalCommission)
    : balance > 0 ? String(balance) : '0'

  const [paymentDate, setPaymentDate] = useState(today)
  const [commissionAmount, setCommissionAmount] = useState(defaultAmount)
  const [paymentMethod, setPaymentMethod] = useState('Cash')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFormError('')
    const amount = Number(commissionAmount)
    if (!Number.isFinite(amount) || amount <= 0) { setFormError('Enter an amount greater than zero'); return }
    setSaving(true)
    const fullNotes = `${paymentMethod} payment${notes ? ': ' + notes : ''}`
    let json: { success?: boolean; error?: string }
    try {
    const res = await fetch('/api/settlements', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entityType: 'GuarantorCommission',
        entityId: guarantor.guarantorId,
        entityName: guarantor.name,
        saturdayDate: paymentDate,
        totalCashDue: amount,
        totalUpiDue: 0,
        amountSubmitted: amount,
        notes: fullNotes,
        recordedBy: session.userId,
      }),
    })
    json = await res.json()
    } catch { json = { success: false, error: 'Network error. Payment not recorded.' } }
    setSaving(false)
    if (json.success) onDone(); else setFormError(json.error || 'Failed to record payment')
  }

  return (
    <form onSubmit={submit} className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel divide-y divide-black/5">
      <div className="px-6 py-4">
        <p className="text-sm font-semibold">Record Commission Payment — {guarantor.name}</p>
        {cycle && (
          <p className="mt-1 text-xs text-green-700 font-medium">
            This cycle commission: {formatINR(cycle.totalCommission)}
          </p>
        )}
        {balance < 0 && (
          <p className="mt-1 text-xs text-soft">
            Note: Previous payments exceeded recorded commission by {formatINR(Math.abs(balance))}.
          </p>
        )}
      </div>
      <div className="p-6 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-soft mb-1">Payment Date</p>
          <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)}
            className="w-full rounded-xl border border-line px-3 py-2.5 text-sm outline-none focus:border-ink" />
        </div>
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-soft mb-1">Commission Amount (₹)</p>
          <input type="number" value={commissionAmount} onChange={e => setCommissionAmount(e.target.value)} min="0"
            className="w-full rounded-xl border border-line px-3 py-2.5 text-sm outline-none focus:border-ink" />
        </div>
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-soft mb-1">Payment Method</p>
          <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
            className="w-full rounded-xl border border-line px-3 py-2.5 text-sm outline-none focus:border-ink bg-white">
            <option>Cash</option>
            <option>UPI</option>
            <option>Bank Transfer</option>
          </select>
        </div>
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-soft mb-1">Notes (optional)</p>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any remarks…"
            className="w-full rounded-xl border border-line px-3 py-2.5 text-sm outline-none focus:border-ink" />
        </div>
      </div>
      <div className="px-6 py-4 flex flex-wrap items-center gap-3">
        {formError && <p className="w-full text-sm text-red-600">{formError}</p>}
        <button type="submit" disabled={saving}
          className="rounded-2xl bg-ink px-6 py-3 text-sm font-semibold text-white disabled:opacity-50">
          {saving ? 'Saving…' : 'Record Commission Payment'}
        </button>
      </div>
    </form>
  )
}

// ── DEPOSIT ACCOUNT (admin view per guarantor) ──
function DepositAdmin({ guarantorId, session }: { guarantorId: string; session: Session }) {
  const cur = (n: number) => formatINR(n)
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [type, setType] = useState('Deposit')
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(''), 2500) }
  function load() {
    fetch(`/api/deposits?guarantorId=${guarantorId}`, { headers: { Authorization: `Bearer ${session.token}` } })
      .then(r => r.json()).then(j => { if (j.success) setData(j.data) }).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [guarantorId])

  async function record() {
    const amt = Number(amount || 0)
    if (amt <= 0) { showToast('Enter an amount'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/deposits', {
        method: 'POST', headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ guarantorId, type, amount: amt, notes }),
      }).then(r => r.json())
      if (res.success) { setAmount(''); setNotes(''); showToast('Recorded.'); load() } else showToast(res.error || 'Failed')
    } catch { showToast('Network error. Not recorded.') } finally { setBusy(false) }
  }

  async function approve(requestId: string) {
    if (!confirm('Approve this withdrawal and record the payout?')) return
    const res = await fetch('/api/deposits/request', {
      method: 'PATCH', headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId }),
    }).then(r => r.json()).catch(() => ({ success: false, error: 'Network error' }))
    if (res.success) { showToast('Approved & recorded.'); load() } else showToast(res.error || 'Failed')
  }

  if (loading) return <div className="flex h-32 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-ink border-t-transparent" /></div>
  if (!data) return <p className="p-6 text-center text-sm text-soft">No deposit account.</p>
  const a = data.account
  const pending = (data.requests || []).filter((r: any) => r.status === 'Pending')

  return (
    <div className="space-y-4">
      {toast && <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-2xl bg-ink px-5 py-3 text-sm font-medium text-white shadow-lg">{toast}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-[1.5rem] border border-white/70 bg-white p-4 shadow-panel text-center"><p className="text-xs text-soft">Deposit</p><p className="mt-1 text-xl font-bold">{cur(a.principal)}</p></div>
        <div className="rounded-[1.5rem] border border-green-200 bg-green-50 p-4 shadow-panel text-center"><p className="text-xs text-green-700">Interest Available</p><p className="mt-1 text-xl font-bold text-green-800">{cur(a.availableInterest)}</p></div>
        <div className="rounded-[1.5rem] border border-blue-200 bg-blue-50 p-4 shadow-panel text-center"><p className="text-xs text-blue-700">Interest Paid</p><p className="mt-1 text-xl font-bold text-blue-800">{cur(a.totalInterestPaid)}</p></div>
        <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-4 shadow-panel text-center"><p className="text-xs text-amber-700">Next Withdrawal</p><p className="mt-1 text-lg font-bold text-amber-800">{a.canWithdrawInterest ? 'Available' : `${a.daysRemaining}d`}</p></div>
      </div>

      {pending.length > 0 && (
        <div className="rounded-[1.75rem] border border-amber-200 bg-amber-50 shadow-panel overflow-hidden">
          <div className="px-5 py-3 border-b border-amber-200"><p className="text-sm font-semibold text-amber-800">Pending Withdrawal Requests</p></div>
          <div className="divide-y divide-amber-200">
            {pending.map((r: any) => (
              <div key={r.requestId} className="flex items-center justify-between px-5 py-3">
                <div><p className="text-sm font-semibold">{r.type} · {cur(r.amount)}</p><p className="text-xs text-soft">{formatDateIN(r.requestedAt)}</p></div>
                <button onClick={() => approve(r.requestId)} className="rounded-xl bg-green-700 px-4 py-2 text-xs font-semibold text-white hover:bg-green-800">Approve & Pay</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Record a transaction */}
      <div className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel p-5 space-y-3">
        <p className="text-sm font-semibold">Record Transaction</p>
        <div className="grid gap-3 sm:grid-cols-4">
          <select value={type} onChange={e => setType(e.target.value)} className="rounded-xl border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-ink">
            <option value="Deposit">Deposit</option>
            <option value="Interest Payout">Interest Payout</option>
            <option value="Principal Withdrawal">Principal Withdrawal</option>
          </select>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount" data-no-upper
            className="rounded-xl border border-line bg-mist px-3 py-2.5 text-sm outline-none focus:border-ink" />
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)"
            className="rounded-xl border border-line bg-mist px-3 py-2.5 text-sm outline-none focus:border-ink" />
          <button onClick={record} disabled={busy} className="rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Record'}</button>
        </div>
      </div>

      {/* Passbook */}
      <div className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel overflow-hidden">
        <div className="border-b border-black/5 px-5 py-3"><p className="text-sm font-semibold">Passbook</p></div>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead className="border-b border-black/5 bg-panel text-soft"><tr>{['Date', 'Type', 'Amount', 'Note'].map(h => <th key={h} className="px-5 py-3 font-medium text-xs">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-black/5">
            {data.ledger.length === 0 && <tr><td colSpan={4} className="px-5 py-6 text-center text-sm text-soft">No transactions.</td></tr>}
            {data.ledger.map((t: any) => {
              const isIn = t.type === 'Deposit'
              return (
                <tr key={t.txnId} className="hover:bg-panel">
                  <td className="px-5 py-3 text-soft">{formatDateIN(t.date)}</td>
                  <td className="px-5 py-3 font-medium">{t.type}</td>
                  <td className={`px-5 py-3 font-semibold ${isIn ? 'text-green-700' : 'text-red-600'}`}>{isIn ? '+' : '−'} {cur(t.amount)}</td>
                  <td className="px-5 py-3 text-soft text-xs">{t.notes || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}
