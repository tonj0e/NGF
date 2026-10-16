'use client'
import { useEffect, useState } from 'react'
import { Session } from '@/types'

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

export default function SettlementsPage({ session }: { session: Session }) {
  const [tab, setTab] = useState<'today' | 'unsettled' | 'history'>('today')
  const saturday = thisSaturday()

  const [summaries, setSummaries] = useState<CollectionSummary[]>([])
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const [detailSummary, setDetailSummary] = useState<CollectionSummary | null>(null)
  const [submitAmount, setSubmitAmount] = useState('')
  const [submitNotes, setSubmitNotes] = useState('')
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())
  const setSaving = (id: string, val: boolean) => setSavingIds(prev => { const s = new Set(prev); val ? s.add(id) : s.delete(id); return s })
  const isSaving = (id: string) => savingIds.has(id)

  const [histLoading, setHistLoading] = useState(false)
  const [allSettlements, setAllSettlements] = useState<Settlement[]>([])
  const [guarantors, setGuarantors] = useState<Guarantor[]>([])

  // Unsettled tab state
  const [unsettledLoading, setUnsettledLoading] = useState(false)
  const [unsettledWeeks, setUnsettledWeeks] = useState<Array<{
    saturdayDate: string
    summaries: CollectionSummary[]
    settlements: Settlement[]
  }>>([])


  // Load all unsettled weeks from past
  async function loadUnsettled() {
    setUnsettledLoading(true)
    try {
      // Fetch all settlements and all repayments
      const [stlRes, gRes, repRes] = await Promise.all([
        fetch('/api/settlements', { headers: { Authorization: `Bearer ${session.token}` } }),
        fetch('/api/staff', { headers: { Authorization: `Bearer ${session.token}` } }),
        fetch('/api/settlements/due?all=true', { headers: { Authorization: `Bearer ${session.token}` } }),
      ])
      const [stlJson, gJson, repJson] = await Promise.all([stlRes.json(), gRes.json(), repRes.json()])
      
      const gs: Guarantor[] = gJson.success ? gJson.data.guarantors || [] : []
      setGuarantors(gs)
      const allStls: Settlement[] = stlJson.success ? stlJson.data.settlements || [] : []
      const allRepayments = repJson.success ? repJson.data || [] : []
      
      // Group repayments by Saturday Date and Guarantor
      const weekMap = new Map<string, Map<string, {
        repayments: any[],
        settlement: Settlement | null
      }>>()
      
      for (const r of allRepayments) {
        const satDate = r.dueDate || r['Due Date']
        if (!satDate || satDate >= saturday) continue // Only past weeks
        
        // API now returns guarantorId directly, no need for extra API call
        const gId = r.guarantorId
        if (!gId) continue
        
        if (!weekMap.has(satDate)) weekMap.set(satDate, new Map())
        const gMap = weekMap.get(satDate)!
        if (!gMap.has(gId)) gMap.set(gId, { repayments: [], settlement: null })
        gMap.get(gId)!.repayments.push(r)
      }
      
      // Add settlements to week map
      for (const s of allStls) {
        const satDate = s['Saturday Date']
        if (!satDate || satDate >= saturday) continue
        const gId = s['Entity ID']
        if (!weekMap.has(satDate)) weekMap.set(satDate, new Map())
        const gMap = weekMap.get(satDate)!
        if (!gMap.has(gId)) gMap.set(gId, { repayments: [], settlement: null })
        gMap.get(gId)!.settlement = s
      }
      
      // Build unsettled weeks data
      const weeks: Array<{
        saturdayDate: string
        summaries: CollectionSummary[]
        settlements: Settlement[]
      }> = []
      
      for (const [satDate, gMap] of weekMap.entries()) {
        const summaries: CollectionSummary[] = []
        const settlements: Settlement[] = []
        
        for (const [gId, { repayments, settlement }] of gMap.entries()) {
          const g = gs.find(g => g.guarantorId === gId)
          if (!g) continue
          
          let cashDue = 0, upiDue = 0, totalDue = 0, unpaid = 0
          const staffBreakdown = new Map<string, StaffBreakdown>()
          
          for (const r of repayments) {
            const amt = Number(r.amount) || 0
            const isPaid = r.status === 'Paid'
            const mode = (r.paymentMode || '').toLowerCase()
            const isUpi = mode.includes('upi') || mode.includes('qr') || mode.includes('bank')
            
            totalDue += amt
            if (!isPaid) {
              unpaid += amt
            } else {
              const collectorKey = r.collectorUserId || '__guarantor__'
              if (!staffBreakdown.has(collectorKey)) {
                staffBreakdown.set(collectorKey, {
                  collectorUserId: r.collectorUserId || '',
                  collectorName: r.collectorUserId ? (r.collectorName || 'Unknown') : 'Guarantor',
                  collectorCode: r.collectorCode || '',
                  collectorRole: r.collectorUserId ? (r.collectorRole || '') : 'Guarantor',
                  cash: 0, upi: 0, transactions: [],
                })
              }
              const sb = staffBreakdown.get(collectorKey)!
              if (isUpi) { sb.upi += amt; upiDue += amt }
              else { sb.cash += amt }
              sb.transactions.push({
                customerName: r.customerName || 'Unknown Customer',
                amount: amt,
                paymentMode: r.paymentMode || 'Cash',
                paidAt: r.paidAt || r.updatedAt || r.createdAt || '',
              })
              if (!isUpi && (!r.collectorUserId || r.collectorRole === 'Guarantor')) {
                cashDue += amt
              }
            }
            
            // Check if there's a settlement and if it's fully settled
            const isSettled = settlement && settlement['Status'] === 'Settled'
            const balance = settlement ? Number(settlement['Balance']) : 0
            
            // Only add to unsettled if there's unpaid or balance > 0
            if (unpaid > 0 || balance > 0 || !isSettled) {
              summaries.push({
                guarantorId: gId, guarantorName: g?.name || gId,
                guarantorCode: g?.code || '', guarantorPhone: g?.phone || '',
                cashDue, upiDue, totalDue, unpaid,
                staffBreakdown,
              })
              if (settlement) settlements.push(settlement)
            }
          }
        }
        
        if (summaries.length > 0) {
          weeks.push({
            saturdayDate: satDate,
            summaries,
            settlements,
          })
        }
      }
      
      // Sort by date descending (most recent first)
      weeks.sort((a, b) => b.saturdayDate.localeCompare(a.saturdayDate))
      setUnsettledWeeks(weeks)
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

  async function loadToday() {
    setLoading(true)
    const [repRes, stlRes, gRes] = await Promise.all([
      fetch(`/api/settlements/due?saturday=${saturday}`, { headers: { Authorization: `Bearer ${session.token}` } }),
      fetch(`/api/settlements?saturday=${saturday}`, { headers: { Authorization: `Bearer ${session.token}` } }),
      fetch('/api/staff', { headers: { Authorization: `Bearer ${session.token}` } }),
    ])
    const [repJson, stlJson, gJson] = await Promise.all([repRes.json(), stlRes.json(), gRes.json()])

    const gs: Guarantor[] = gJson.success ? gJson.data.guarantors || [] : []
    setGuarantors(gs)
    const repayments = repJson.success ? repJson.data || [] : []
    const stls: Settlement[] = stlJson.success ? stlJson.data.settlements || [] : []
    setSettlements(stls)

    const map = new Map<string, CollectionSummary>()
    for (const g of gs) {
      map.set(g.guarantorId, {
        guarantorId: g.guarantorId, guarantorName: g.name,
        guarantorCode: g.code, guarantorPhone: g.phone,
        cashDue: 0, upiDue: 0, totalDue: 0, unpaid: 0,
        staffBreakdown: new Map(),
      })
    }

    for (const r of repayments) {
      const gId = r.guarantorId || ''
      if (!gId) continue
      const s = map.get(gId)
      if (!s) continue
      const amt = Number(r.amount) || 0
      const isPaid = r.status === 'Paid'
      const mode = (r.paymentMode || '').toLowerCase()
      const isUpi = mode.includes('upi') || mode.includes('qr') || mode.includes('bank')

      s.totalDue += amt
      if (!isPaid) {
        s.unpaid += amt
      } else {
        // Track breakdown per collector
        const collectorKey = r.collectorUserId || '__guarantor__'
        if (!s.staffBreakdown.has(collectorKey)) {
          s.staffBreakdown.set(collectorKey, {
            collectorUserId: r.collectorUserId || '',
            collectorName: r.collectorUserId ? (r.collectorName || 'Unknown') : s.guarantorName,
            collectorCode: r.collectorCode || '',
            collectorRole: r.collectorUserId ? (r.collectorRole || '') : 'Guarantor',
            cash: 0, upi: 0, transactions: [],
          })
        }
        const sb = s.staffBreakdown.get(collectorKey)!
        if (isUpi) { sb.upi += amt; s.upiDue += amt }
        else { sb.cash += amt }
        sb.transactions.push({
          customerName: r.customerName || 'Unknown Customer',
          amount: amt,
          paymentMode: r.paymentMode || 'Cash',
          paidAt: r.paidAt || r.updatedAt || r.createdAt || '',
        })

        // Cash Due = only cash collected by the guarantor themselves
        if (!isUpi && (!r.collectorUserId || r.collectorRole === 'Guarantor')) {
          s.cashDue += amt
        }
      }
    }

    setSummaries(Array.from(map.values()).filter(s => s.totalDue > 0 || s.unpaid > 0))
    setLoading(false)
  }

  async function loadHistory() {
    setHistLoading(true)
    const [stlRes, gRes] = await Promise.all([
      fetch('/api/settlements', { headers: { Authorization: `Bearer ${session.token}` } }),
      fetch('/api/staff', { headers: { Authorization: `Bearer ${session.token}` } }),
    ])
    const [stlJson, gJson] = await Promise.all([stlRes.json(), gRes.json()])
    const gs: Guarantor[] = gJson.success ? gJson.data.guarantors || [] : []
    setGuarantors(gs)
    setAllSettlements(stlJson.success ? stlJson.data.settlements || [] : [])
    setHistLoading(false)
  }

  useEffect(() => { loadToday() }, [])
  useEffect(() => { if (tab === 'history') loadHistory() }, [tab])
  useEffect(() => { if (tab === 'unsettled') loadUnsettled() }, [tab])

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
      await loadHistory()
    } else {
      showToast('Failed to record. Please try again.')
    }
    setSaving(guarantorId, false)
  }

  async function settleNow(guarantorId: string, guarantorName: string, upiDue: number) {
    setSaving(guarantorId, true)
    const res = await fetch('/api/settlements', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entityType: 'Guarantor', entityId: guarantorId, entityName: guarantorName,
        saturdayDate: saturday, totalCashDue: 0, totalUpiDue: upiDue,
        amountSubmitted: upiDue, notes: 'Auto-settled: cash due is ₹0',
        recordedBy: session.userId,
      }),
    })
    const json = await res.json()
    if (json.success && json.data?.success !== false) {
      showToast('✓ Settled successfully.')
      setAllSettlements([])
      await loadToday()
      await loadHistory()
    } else {
      const errMsg = json.error || json.data?.error || 'Unknown error'
      showToast(`Failed: ${errMsg}`)
    }
    setSaving(guarantorId, false)
  }

  const getSettlement = (gId: string) => settlements.find(s => s['Entity ID'] === gId)

  // Build unique guarantors directly from settlements — no dependency on guarantors state
  const histGuarantorMap = new Map<string, { guarantorId: string; name: string; code: string; phone: string }>()
  for (const s of allSettlements) {
    if (!histGuarantorMap.has(s['Entity ID'])) {
      const g = guarantors.find(g => g.guarantorId === s['Entity ID'])
      histGuarantorMap.set(s['Entity ID'], {
        guarantorId: s['Entity ID'],
        name: g?.name || s['Entity Name'] || s['Entity ID'],
        code: g?.code || '',
        phone: g?.phone || '',
      })
    }
  }
  const histGuarantors = Array.from(histGuarantorMap.values())

  const getGuarantorHistory = (gId: string) =>
    allSettlements
      .filter(s => s['Entity ID'] === gId)
      .sort((a, b) => a['Saturday Date'].localeCompare(b['Saturday Date']))

  async function loadHistWeekDetail(stl: Settlement) {
    setHistWeekLoading(true)
    const repRes = await fetch(`/api/settlements/due?saturday=${stl['Saturday Date']}`, {
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
      <div className="rounded-[1.6rem] border border-[#e5e7eb] bg-white overflow-hidden shadow-sm">
        <div className="grid grid-cols-2 divide-x divide-[#e5e7eb] border-b border-[#e5e7eb]">
          <div className="p-5">
            <p className="text-xs text-[#697586] mb-1">Total Collection</p>
            <p className="text-2xl font-bold text-[#1a1a2e]">{currency(summary.totalDue)}</p>
          </div>
          <div className="p-5">
            <p className="text-xs text-[#697586] mb-1">Balance to Collect / Unpaid</p>
            <p className={`text-2xl font-bold ${summary.unpaid > 0 ? 'text-red-600' : 'text-green-600'}`}>{currency(summary.unpaid)}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 divide-x divide-[#e5e7eb] border-b border-[#e5e7eb] bg-[#f9fafb]">
          <div className="p-4 text-center">
            <p className="text-xs text-[#697586] mb-1">Cash Due</p>
            <p className="text-lg font-bold text-[#1a1a2e]">{currency(summary.cashDue)}</p>
          </div>
          <div className="p-4 text-center">
            <p className="text-xs text-[#697586] mb-1">UPI / QR</p>
            <p className="text-lg font-bold text-[#1a1a2e]">{currency(totalUpi)}</p>
          </div>
          <div className="p-4 text-center">
            <p className="text-xs text-[#697586] mb-1">Not Paid</p>
            <p className={`text-lg font-bold ${summary.unpaid > 0 ? 'text-red-600' : 'text-[#697586]'}`}>{currency(summary.unpaid)}</p>
          </div>
        </div>
        {sorted.length === 0 ? (
          <p className="p-6 text-sm text-center text-[#697586]">No payment breakdown available.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  {sorted.map(sb => (
                    <th key={sb.collectorUserId || sb.collectorName}
                      className="px-4 py-3 text-left bg-[#f4f5f7] border-b border-r border-[#e5e7eb] last:border-r-0 min-w-[150px] align-top">
                      <p className="text-sm font-bold text-[#1a1a2e] leading-tight">{sb.collectorName}</p>
                      {sb.collectorCode && <p className="text-xs text-[#697586] font-normal mt-0.5">{sb.collectorCode}</p>}
                      <span className={`inline-block mt-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${roleBadge[sb.collectorRole] ?? roleBadge['Other']}`}>
                        {roleLabel[sb.collectorRole] ?? 'Staff'}
                      </span>
                      <div className="mt-2 pt-2 border-t border-[#e5e7eb]">
                        <div className="flex items-end gap-5">
                          <div>
                            <p className="text-[10px] text-[#697586] uppercase tracking-wide mb-1">Total</p>
                            <p className="font-bold text-base text-[#1a1a2e]">{currency(sb.cash + sb.upi)}</p>
                          </div>
                          <div className="flex gap-4 pb-px">
                            <div>
                              <p className="text-[10px] text-[#697586] uppercase tracking-wide mb-1">Cash</p>
                              <p className={`text-sm font-bold ${sb.cash > 0 ? 'text-[#1a1a2e]' : 'text-[#9ca3af]'}`}>{currency(sb.cash)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-[#697586] uppercase tracking-wide mb-1">UPI / QR</p>
                              <p className={`text-sm font-bold ${sb.upi > 0 ? 'text-[#1a1a2e]' : 'text-[#9ca3af]'}`}>{currency(sb.upi)}</p>
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
                      className="px-0 border-r border-[#e5e7eb] last:border-r-0 align-top">
                      {sb.transactions.length === 0 ? (
                        <p className="px-4 py-3 text-xs text-[#9ca3af]">No transactions</p>
                      ) : (
                        <div className="divide-y divide-[#f4f5f7]">
                          {sb.transactions.map((tx, i) => {
                            const isUpi = tx.paymentMode.toLowerCase().includes('upi') || tx.paymentMode.toLowerCase().includes('qr') || tx.paymentMode.toLowerCase().includes('bank')
                            return (
                              <div key={i} className="px-4 py-3">
                                <p className="text-sm font-semibold text-[#1a1a2e] leading-tight">{tx.customerName}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${isUpi ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                                    {tx.paymentMode}
                                  </span>
                                  <span className="text-sm font-bold text-[#1a1a2e]">{currency(tx.amount)}</span>
                                </div>
                                {tx.paidAt && (
                                  <p className="text-[10px] text-[#9ca3af] mt-1">
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
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#1a1a2e] border-t-transparent" />
      </div>
    )

    // Level 3: Week detail
    if (histWeekDetail) {
      const { settlement: wstl, summary: ws } = histWeekDetail
      return (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setHistWeekDetail(null)}
              className="rounded-2xl border border-[#e5e7eb] bg-white px-4 py-2 text-sm font-semibold flex items-center gap-1.5 hover:bg-[#f4f5f7] transition">
              ← Back
            </button>
            <div>
              <p className="font-bold text-base text-[#1a1a2e]">{ws.guarantorName}</p>
              <p className="text-xs text-[#697586]">{ws.guarantorCode} &bull; {wstl['Saturday Date']}</p>
            </div>
          </div>
          {renderCollectorTable(ws)}
          <div className="rounded-[1.6rem] border border-[#e5e7eb] bg-white p-5 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#697586]">Settlement Record</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-[#f4f5f7] p-3 text-center">
                <p className="text-xs text-[#697586] mb-1">Submitted</p>
                <p className="font-bold text-sm">{currency(Number(wstl['Amount Submitted']))}</p>
              </div>
              <div className="rounded-xl bg-[#f4f5f7] p-3 text-center">
                <p className="text-xs text-[#697586] mb-1">Balance</p>
                <p className={`font-bold text-sm ${Number(wstl['Balance']) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {currency(Number(wstl['Balance']))}
                </p>
              </div>
              <div className="rounded-xl bg-[#f4f5f7] p-3 text-center">
                <p className="text-xs text-[#697586] mb-1">Status</p>
                <p className={`font-bold text-sm ${wstl['Status'] === 'Settled' ? 'text-green-700' : 'text-amber-600'}`}>
                  {wstl['Status']}
                </p>
              </div>
            </div>
            {wstl['Notes'] && <p className="text-xs text-[#697586] pt-1">{wstl['Notes']}</p>}
            <p className="text-xs text-[#697586]">Recorded by {wstl['Recorded By']} &bull; {wstl['Created At']?.slice(0, 16)}</p>
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
              className="rounded-2xl border border-[#e5e7eb] bg-white px-4 py-2 text-sm font-semibold flex items-center gap-1.5 hover:bg-[#f4f5f7] transition">
              ← Back
            </button>
            <div>
              <p className="font-bold text-base text-[#1a1a2e]">{histView.name}</p>
              <p className="text-xs text-[#697586]">{histView.code} &bull; {histView.phone}</p>
            </div>
          </div>
          {weeks.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[#e5e7eb] bg-white p-8 text-center text-sm text-[#697586]">
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
                        <div className="shrink-0 rounded-xl bg-[#f4f5f7] px-3 py-2 text-center">
                          <p className="text-[10px] text-[#697586] leading-none uppercase">
                            {satDate.toLocaleDateString('en-IN', { month: 'short' })}
                          </p>
                          <p className="font-bold text-lg text-[#1a1a2e] leading-none mt-0.5">
                            {satDate.getDate()}
                          </p>
                          <p className="text-[10px] text-[#697586] leading-none mt-0.5">
                            {satDate.getFullYear()}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-semibold leading-tight">{stl['Saturday Date']}</p>
                          <p className="text-xs text-[#697586]">Submitted: {currency(Number(stl['Amount Submitted']))}</p>
                        </div>
                      </div>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold shrink-0 ${isSettled ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                        {stl['Status']}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-[#f4f5f7] px-2 py-2">
                      <div className="text-center">
                        <p className="text-[10px] text-[#697586]">Cash Due</p>
                        <p className="font-semibold text-xs">{currency(Number(stl['Total Cash Due']))}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-[#697586]">Balance</p>
                        <p className={`font-semibold text-xs ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>{currency(balance)}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => loadHistWeekDetail(stl)}
                      disabled={histWeekLoading}
                      className="w-full rounded-xl border border-[#e5e7eb] bg-[#f4f5f7] px-3 py-1.5 text-xs font-semibold text-[#697586] hover:bg-[#1a1a2e] hover:text-white transition disabled:opacity-50">
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
      <p className="rounded-2xl border border-dashed border-[#e5e7eb] bg-white p-8 text-center text-sm text-[#697586]">
        No settlement history found.
      </p>
    )
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {histGuarantors.map(g => {
          const history = getGuarantorHistory(g.guarantorId)
          const lastWeek = history[history.length - 1]
          return (
            <div key={g.guarantorId} className="rounded-2xl border border-white/70 bg-white px-4 py-3 shadow-panel space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold leading-tight">{g.name}</p>
                  <p className="text-xs text-[#697586]">{g.code} &bull; {g.phone}</p>
                </div>
                <span className="rounded-full bg-[#f4f5f7] px-2.5 py-0.5 text-xs font-semibold text-[#697586] shrink-0">
                  {history.length} week{history.length !== 1 ? 's' : ''}
                </span>
              </div>
              {lastWeek && (
                <div className="rounded-xl bg-[#f4f5f7] px-3 py-2 text-xs flex justify-between items-center">
                  <span className="text-[#697586]">Last: {lastWeek['Saturday Date']}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${lastWeek['Status'] === 'Settled' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                    {lastWeek['Status']}
                  </span>
                </div>
              )}
              <button
                onClick={() => { setHistView(g); setHistWeekDetail(null) }}
                className="w-full rounded-xl border border-[#e5e7eb] bg-[#f4f5f7] px-3 py-1.5 text-xs font-semibold text-[#697586] hover:bg-[#1a1a2e] hover:text-white transition">
                View
              </button>
            </div>
          )
        })}
      </div>
    )
  }

  if (detailSummary) {
    const stl = getSettlement(detailSummary.guarantorId)
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setDetailSummary(null)}
            className="rounded-2xl border border-[#e5e7eb] bg-white px-4 py-2 text-sm font-semibold flex items-center gap-1.5 hover:bg-[#f4f5f7] transition">
            ← Back
          </button>
          <div>
            <p className="font-bold text-base text-[#1a1a2e]">{detailSummary.guarantorName}</p>
            <p className="text-xs text-[#697586]">{detailSummary.guarantorCode} &bull; {saturday}</p>
          </div>
        </div>
        {renderCollectorTable(detailSummary)}
        {stl && (
          <div className="rounded-[1.6rem] border border-[#e5e7eb] bg-white p-5 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#697586]">Settlement Record</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-[#f4f5f7] p-3 text-center">
                <p className="text-xs text-[#697586] mb-1">Submitted</p>
                <p className="font-bold text-sm">{currency(Number(stl['Amount Submitted']))}</p>
              </div>
              <div className="rounded-xl bg-[#f4f5f7] p-3 text-center">
                <p className="text-xs text-[#697586] mb-1">Balance</p>
                <p className={`font-bold text-sm ${Number(stl['Balance']) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {currency(Number(stl['Balance']))}
                </p>
              </div>
              <div className="rounded-xl bg-[#f4f5f7] p-3 text-center">
                <p className="text-xs text-[#697586] mb-1">Status</p>
                <p className={`font-bold text-sm ${stl['Status'] === 'Settled' ? 'text-green-700' : 'text-amber-600'}`}>
                  {stl['Status']}
                </p>
              </div>
            </div>
            {stl['Notes'] && <p className="text-xs text-[#697586] pt-1">{stl['Notes']}</p>}
            <p className="text-xs text-[#697586]">Recorded by {stl['Recorded By']} &bull; {stl['Created At']?.slice(0, 16)}</p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {toast && (
        <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-2xl bg-[#1a1a2e] px-5 py-3 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={() => setTab('today')}
          className={`rounded-2xl px-5 py-2.5 text-sm font-semibold transition ${tab === 'today' ? 'bg-[#1a1a2e] text-white' : 'border border-[#e5e7eb] bg-white text-[#697586]'}`}>
          This Saturday
        </button>
        <button onClick={() => setTab('unsettled')}
          className={`rounded-2xl px-5 py-2.5 text-sm font-semibold transition ${tab === 'unsettled' ? 'bg-[#1a1a2e] text-white' : 'border border-[#e5e7eb] bg-white text-[#697586]'}`}>
          Unsettled
        </button>
        <button onClick={() => setTab('history')}
          className={`rounded-2xl px-5 py-2.5 text-sm font-semibold transition ${tab === 'history' ? 'bg-[#1a1a2e] text-white' : 'border border-[#e5e7eb] bg-white text-[#697586]'}`}>
          History
        </button>
      </div>

      {tab === 'today' && (
        <p className="text-sm text-[#697586]">
          Showing settlements for <span className="font-semibold text-[#1a1a2e]">{saturday}</span>
        </p>
      )}

      {tab === 'unsettled' && (
        <p className="text-sm text-[#697586]">
          Showing all past weeks with missed or partial settlements.
        </p>
      )}

      {/* TODAY TAB */}
      {tab === 'today' && (
        loading ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#1a1a2e] border-t-transparent" />
          </div>
        ) : summaries.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[#e5e7eb] bg-white p-8 text-center text-sm text-[#697586]">
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
                      <p className="text-xs text-[#697586]">{s.guarantorCode} &bull; {s.guarantorPhone}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold shrink-0 ${isSettled ? 'bg-green-100 text-green-700' : stl ? 'bg-amber-100 text-amber-700' : 'bg-[#f4f5f7] text-[#697586]'}`}>
                      {isSettled ? 'Settled' : stl ? 'Partial' : 'Pending'}
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5 rounded-xl bg-[#f4f5f7] px-2 py-2">
                    <div className="text-center">
                      <p className="text-[10px] text-[#697586]">Cash Due</p>
                      <p className="font-semibold text-xs">{currency(s.cashDue)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-[#697586]">UPI / QR</p>
                      <p className="font-semibold text-xs">{currency(s.upiDue)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-[#697586]">Collection</p>
                      <p className="font-semibold text-xs text-green-700">{currency(s.totalDue)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-[#697586]">Unpaid</p>
                      <p className={`font-semibold text-xs ${s.unpaid > 0 ? 'text-red-600' : 'text-[#697586]'}`}>{currency(s.unpaid)}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => setDetailSummary(s)}
                    className="w-full rounded-xl border border-[#e5e7eb] bg-[#f4f5f7] px-3 py-1.5 text-xs font-semibold text-[#697586] hover:bg-[#1a1a2e] hover:text-white transition">
                    View Details
                  </button>

                  {stl && (
                    <div className="rounded-xl bg-[#f4f5f7] px-3 py-2 text-xs space-y-1">
                      <div className="flex justify-between">
                        <span className="text-[#697586]">Submitted</span>
                        <span className="font-semibold">{currency(Number(stl['Amount Submitted']))}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#697586]">Balance</span>
                        <span className={`font-semibold ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>{currency(balance)}</span>
                      </div>
                      {stl['Notes'] && <p className="text-[10px] text-[#697586]">{stl['Notes']}</p>}
                      <p className="text-[10px] text-[#697586]">Recorded: {stl['Created At']?.slice(0, 16)}</p>
                    </div>
                  )}

                  {!isSettled && (
                    openId === s.guarantorId ? (
                      <div className="space-y-2 rounded-xl border border-[#e5e7eb] p-3">
                        <input
                          type="number" placeholder="Amount submitted"
                          value={submitAmount} onChange={e => setSubmitAmount(e.target.value)}
                          className="w-full rounded-xl border border-[#e5e7eb] px-3 py-2 text-xs outline-none focus:border-[#1a1a2e]"
                        />
                        <textarea
                          placeholder="Notes (optional)" value={submitNotes}
                          onChange={e => setSubmitNotes(e.target.value)} rows={2}
                          className="w-full rounded-xl border border-[#e5e7eb] px-3 py-2 text-xs outline-none focus:border-[#1a1a2e] resize-none"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => recordSettlement(s.guarantorId, s.guarantorName, s.cashDue, s.upiDue)}
                            disabled={isSaving(s.guarantorId)}
                            className="flex-1 rounded-xl bg-[#1a1a2e] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
                            {isSaving(s.guarantorId) ? 'Saving...' : 'Record'}
                          </button>
                          <button onClick={() => setOpenId(null)}
                            className="rounded-xl border border-[#e5e7eb] px-3 py-2 text-xs font-semibold text-[#697586]">
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        {s.cashDue > 0 && (
                          <button
                            onClick={() => { setOpenId(s.guarantorId); setSubmitAmount(''); setSubmitNotes('') }}
                            className="flex-1 rounded-xl border border-[#e5e7eb] bg-[#f4f5f7] px-3 py-1.5 text-xs font-semibold text-[#1a1a2e] hover:bg-[#1a1a2e] hover:text-white transition">
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
                          className={`flex-1 rounded-xl px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${s.cashDue === 0 ? 'bg-green-600 text-white hover:bg-green-700' : 'border border-[#e5e7eb] bg-[#f4f5f7] text-[#9ca3af]'}`}>
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


      {/* UNSETTLED TAB */}
      {tab === 'unsettled' && (
        unsettledLoading ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#1a1a2e] border-t-transparent" />
          </div>
        ) : unsettledWeeks.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[#e5e7eb] bg-white p-8 text-center text-sm text-[#697586]">
            No missed or partial settlements in past weeks.
          </p>
        ) : (
          <div className="space-y-4">
            {unsettledWeeks.map(week => (
              <div key={week.saturdayDate} className="rounded-2xl border border-white/70 bg-white p-4 shadow-panel space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[#1a1a2e]">
                      Week of {new Date(week.saturdayDate).toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                    <p className="text-xs text-[#697586]">
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
                            <p className="text-xs text-[#697586]">{s.guarantorCode} &bull; {s.guarantorPhone}</p>
                          </div>
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold shrink-0 ${s.unpaid > 0 ? 'bg-red-100 text-red-700' : balance > 0 ? 'bg-amber-100 text-amber-700' : 'bg-[#f4f5f7] text-[#697586]'}`}>
                            {s.unpaid > 0 ? 'Unpaid' : balance > 0 ? 'Partial' : 'Missed'}
                          </span>
                        </div>

                        <div className="grid grid-cols-4 gap-1.5 rounded-xl bg-[#f4f5f7] px-2 py-2">
                          <div className="text-center">
                            <p className="text-[10px] text-[#697586]">Cash Due</p>
                            <p className="font-semibold text-xs">{currency(s.cashDue)}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-[10px] text-[#697586]">UPI / QR</p>
                            <p className="font-semibold text-xs">{currency(s.upiDue)}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-[10px] text-[#697586]">Total Due</p>
                            <p className="font-semibold text-xs text-green-700">{currency(s.totalDue)}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-[10px] text-[#697586]">Unpaid</p>
                            <p className={`font-semibold text-xs ${s.unpaid > 0 ? 'text-red-600' : 'text-[#697586]'}`}>{currency(s.unpaid)}</p>
                          </div>
                        </div>

                        {stl && (
                          <div className="rounded-xl bg-[#f4f5f7] px-3 py-2 text-xs space-y-1">
                            <div className="flex justify-between">
                              <span className="text-[#697586]">Submitted</span>
                              <span className="font-semibold">{currency(Number(stl['Amount Submitted']))}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[#697586]">Balance</span>
                              <span className={`font-semibold ${Number(stl['Balance']) > 0 ? 'text-red-600' : 'text-green-600'}`}>{currency(Number(stl['Balance']))}</span>
                            </div>
                            {stl['Notes'] && <p className="text-[10px] text-[#697586]">{stl['Notes']}</p>}
                            <p className="text-[10px] text-[#697586]">Recorded: {stl['Created At']?.slice(0, 16)}</p>
                          </div>
                        )}

                        {!isSettled && (
                          <div className="flex gap-2">
                            {s.cashDue > 0 && (
                              <button
                                onClick={() => { setOpenId(s.guarantorId); setSubmitAmount(''); setSubmitNotes('') }}
                                className="flex-1 rounded-xl border border-[#e5e7eb] bg-[#f4f5f7] px-3 py-1.5 text-xs font-semibold text-[#1a1a2e] hover:bg-[#1a1a2e] hover:text-white transition">
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
                              className={`flex-1 rounded-xl px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${s.cashDue === 0 ? 'bg-green-600 text-white hover:bg-green-700' : 'border border-[#e5e7eb] bg-[#f4f5f7] text-[#9ca3af]'}`}>
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

      {/* HISTORY TAB */}
      {tab === 'history' && renderHistory()}
    </div>
  )
}
