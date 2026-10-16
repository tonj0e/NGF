'use client'
import { useEffect, useState } from 'react'
import { Session } from '@/types'

function currency(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

export default function CollectionsPage({ session }: { session: Session }) {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/repayments?mode=history', { headers: { Authorization: `Bearer ${session.token}` } })
      .then(r => r.json()).then(j => { if (j.success) setRows(j.data.rows) }).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex h-40 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-[#1a1a2e] border-t-transparent" /></div>

  return (
    <div className="overflow-hidden rounded-[1.75rem] border border-white/70 bg-white shadow-panel">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-black/5 bg-[#fafafa] text-[#697586]">
          <tr>{['Customer','Loan ID','Week','Due Date','Paid Date','Amount','Mode'].map(h => <th key={h} className="px-5 py-4 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-black/5">
          {rows.filter(r => r['Status'] === 'Paid').map(r => (
            <tr key={r['Repayment ID']} className="hover:bg-[#fafafa]">
              <td className="px-5 py-4 font-medium">{r.customerName}</td>
              <td className="px-5 py-4 text-[#697586]">{r['Loan ID']}</td>
              <td className="px-5 py-4 text-[#697586]">{r['Week No']}</td>
              <td className="px-5 py-4 text-[#697586]">{r['Due Date']}</td>
              <td className="px-5 py-4 text-[#697586]">{r['Paid Date']}</td>
              <td className="px-5 py-4 font-semibold">{currency(Number(r['Amount']))}</td>
              <td className="px-5 py-4 text-[#697586]">{r['Payment Mode'] || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.filter(r => r['Status'] === 'Paid').length === 0 && <p className="p-8 text-center text-sm text-[#697586]">No collections recorded.</p>}
    </div>
  )
}
