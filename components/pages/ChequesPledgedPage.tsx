'use client'
import { useEffect, useState } from 'react'
import { Session } from '@/types'

function getProxyUrl(url: string): string {
  if (!url.startsWith('http')) return url
  const idMatch = url.match(/[?&]id=([^&]+)/)
  if (idMatch) return `/api/drive/${idMatch[1]}`
  const dMatch = url.match(/\/d\/([^/]+)/)
  if (dMatch) return `/api/drive/${dMatch[1]}`
  return url
}

export default function ChequesPledgedPage({ session }: { session: Session }) {
  const [leads, setLeads] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/leads?cheque=1&pageSize=200', { headers: { Authorization: `Bearer ${session.token}` } })
      .then(r => r.json()).then(j => {
        if (j.success) {
          setLeads(j.data.rows || [])
        }
      }).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex h-40 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-ink border-t-transparent" /></div>

  return (
    <div className="overflow-hidden rounded-[1.75rem] border border-white/70 bg-white shadow-panel">
      <div className="border-b border-black/5 px-5 py-4">
        <p className="text-sm font-semibold">Cheques Pledged</p>
        <p className="text-xs text-soft mt-0.5">Track pledged cheque metadata and lifecycle</p>
      </div>
      <table className="w-full text-left text-sm">
        <thead className="border-b border-black/5 bg-panel text-soft">
          <tr>
            {['Customer', 'Phone', 'Cheque No', 'Loan Product', 'Status', 'Cheque Photo'].map(h => (
              <th key={h} className="px-5 py-3 font-medium text-xs">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-black/5">
          {leads.map(l => (
            <tr key={l.leadId} className="hover:bg-panel">
              <td className="px-5 py-3 font-medium">{l.customerName}</td>
              <td className="px-5 py-3 text-soft">{l.phone}</td>
              <td className="px-5 py-3 font-mono">{l.chequeNumber || '—'}</td>
              <td className="px-5 py-3 text-soft">{l.loanProduct}</td>
              <td className="px-5 py-3">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${l.status === 'Converted' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                  {l.status === 'Converted' ? 'Active' : 'Pledged'}
                </span>
              </td>
              <td className="px-5 py-3">
                {l.chequePhotoUrl ? (
                  <a href={getProxyUrl(l.chequePhotoUrl)} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 underline">View</a>
                ) : (
                  <span className="text-xs text-soft">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {leads.length === 0 && <p className="p-8 text-center text-sm text-soft">No pledged cheques recorded.</p>}
    </div>
  )
}