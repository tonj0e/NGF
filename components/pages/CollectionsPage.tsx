'use client'
import { useEffect, useState } from 'react'
import { Session } from '@/types'
import Pager from '@/components/ui/Pager'

function currency(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

export default function CollectionsPage({ session }: { session: Session }) {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 })

  // paid weeks, newest first, one page at a time
  useEffect(() => {
    setLoading(true)
    fetch(`/api/repayments?mode=history&page=${page}&pageSize=50`, { headers: { Authorization: `Bearer ${session.token}` } })
      .then(r => r.json()).then(j => { if (j.success) { setRows(j.data.rows || []); setPagination(j.data.pagination) } }).finally(() => setLoading(false))
  }, [page])

  if (loading) return <div className="flex h-40 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-ink border-t-transparent" /></div>

  return (
    <div className="overflow-hidden rounded-[1.75rem] border border-white/70 bg-white shadow-panel">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-black/5 bg-[#fafafa] text-soft">
          <tr>{['Customer','Loan ID','Week','Due Date','Paid Date','Amount','Mode'].map(h => <th key={h} className="px-5 py-4 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-black/5">
          {rows.map(r => (
            <tr key={r['Repayment ID']} className="hover:bg-[#fafafa]">
              <td className="px-5 py-4 font-medium">{r.customerName}</td>
              <td className="px-5 py-4 text-soft">{r['Loan ID']}</td>
              <td className="px-5 py-4 text-soft">{r['Week No']}</td>
              <td className="px-5 py-4 text-soft">{r['Due Date']}</td>
              <td className="px-5 py-4 text-soft">{r['Paid Date']}</td>
              <td className="px-5 py-4 font-semibold">{currency(Number(r['Amount']))}</td>
              <td className="px-5 py-4 text-soft">{r['Payment Mode'] || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="p-8 text-center text-sm text-soft">No collections recorded.</p>}
      <div className="px-5 pb-4"><Pager page={page} totalPages={pagination.totalPages} total={pagination.total} noun="payments" pageSize={50} onPage={setPage} /></div>
    </div>
  )
}
