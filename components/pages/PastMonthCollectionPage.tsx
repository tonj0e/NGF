'use client'
import { useEffect, useState } from 'react'
import { Session } from '@/types'
import Pager from '@/components/ui/Pager'

function currency(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

export default function PastMonthCollectionPage({ session }: { session: Session }) {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 })
  const [summary, setSummary] = useState({ paidCount: 0, paidTotal: 0 })
  const lastMonth = new Date(); lastMonth.setMonth(lastMonth.getMonth() - 1)
  const lastMonthStr = lastMonth.toISOString().slice(0, 7)

  // the server picks last month's paid weeks, totals them and sends one page at a time
  useEffect(() => {
    setLoading(true)
    fetch(`/api/repayments?mode=history&month=${lastMonthStr}&page=${page}&pageSize=50`, { headers: { Authorization: `Bearer ${session.token}` } })
      .then(r => r.json()).then(j => {
        if (!j.success) return
        setRows(j.data.rows || []); setPagination(j.data.pagination); setSummary(j.data.summary || { paidCount: 0, paidTotal: 0 })
      }).finally(() => setLoading(false))
  }, [page])

  const paid = rows

  const total = summary.paidTotal
  const avg = summary.paidCount ? total / summary.paidCount : 0

  if (loading) return <div className="flex h-40 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-ink border-t-transparent" /></div>

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-[1.5rem] border border-white/70 bg-white p-5 shadow-panel">
          <p className="text-xs text-soft">Total Collected</p>
          <p className="mt-2 text-3xl font-semibold">{currency(total)}</p>
          <p className="mt-1 text-xs text-soft">{lastMonthStr}</p>
        </div>
        <div className="rounded-[1.5rem] border border-white/70 bg-white p-5 shadow-panel">
          <p className="text-xs text-soft">Avg Ticket</p>
          <p className="mt-2 text-3xl font-semibold">{currency(avg)}</p>
        </div>
        <div className="rounded-[1.5rem] border border-white/70 bg-white p-5 shadow-panel">
          <p className="text-xs text-soft">Collection Count</p>
          <p className="mt-2 text-3xl font-semibold">{summary.paidCount}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-[1.75rem] border border-white/70 bg-white shadow-panel">
        <div className="border-b border-black/5 px-5 py-4">
          <p className="text-sm font-semibold">Past Month Transactions — {lastMonthStr}</p>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-black/5 bg-panel text-soft">
            <tr>{['Customer', 'Loan ID', 'Week', 'Paid Date', 'Amount', 'Mode'].map(h => <th key={h} className="px-5 py-3 font-medium text-xs">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {paid.map(r => (
              <tr key={r['Repayment ID']} className="hover:bg-panel">
                <td className="px-5 py-3 font-medium">{r.customerName}</td>
                <td className="px-5 py-3 font-mono text-xs text-soft">{r['Loan ID']}</td>
                <td className="px-5 py-3 text-soft">{r['Week No']}</td>
                <td className="px-5 py-3 text-soft">{r['Paid Date']}</td>
                <td className="px-5 py-3 font-semibold">{currency(Number(r['Amount']))}</td>
                <td className="px-5 py-3 text-soft">{r['Payment Mode'] || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {paid.length === 0 && <p className="p-8 text-center text-sm text-soft">No collections for last month.</p>}
        <div className="px-5 pb-4"><Pager page={page} totalPages={pagination.totalPages} total={pagination.total} noun="payments" pageSize={50} onPage={setPage} /></div>
      </div>
    </div>
  )
}
