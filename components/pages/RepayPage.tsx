'use client'
import { useEffect, useRef, useState } from 'react'
import { Session } from '@/types'
import StatusPill from '@/components/ui/StatusPill'

function currency(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

async function fileToPayload(file: File): Promise<string> {
  return new Promise(resolve => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.readAsDataURL(file)
  })
}

export default function RepayPage({ session, mode }: { session: Session; mode: 'all' | 'today' | 'saturday' }) {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const loadedFor = useRef<string | null>(null)
  const [toast, setToast] = useState('')

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(''), 3000) }

  async function load() {
    if (loadedFor.current !== mode) setLoading(true)
    const url = `/api/repayments?mode=${mode === 'all' ? '' : mode}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${session.token}` } })
    const json = await res.json()
    if (json.success) setRows(json.data.rows)
    loadedFor.current = mode
    setLoading(false)
  }

  useEffect(() => { load() }, [mode])

  async function markPaid(e: React.FormEvent<HTMLFormElement>, repaymentId: string) {
    e.preventDefault()
    const f = e.currentTarget
    const btn = f.querySelector('button[type="submit"]') as HTMLButtonElement
    if (btn) { btn.disabled = true; btn.textContent = 'Saving...' }
    const proofFile = (f.elements.namedItem('paymentProof') as HTMLInputElement)?.files?.[0]
    const proof = proofFile ? await fileToPayload(proofFile) : null
    try {
      await fetch('/api/repayments', {
        method: 'POST', headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repaymentId,
          paymentMode: (f.elements.namedItem('paymentMode') as HTMLInputElement)?.value || '',
          notes: (f.elements.namedItem('notes') as HTMLTextAreaElement)?.value || '',
          paymentProof: proof,
        }),
      })
      showToast('Marked as paid.'); load()
    } finally { if (btn) { btn.disabled = false; btn.textContent = 'Mark as paid' } }
  }

  if (loading && loadedFor.current !== mode) return <div className="flex h-40 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-[#1a1a2e] border-t-transparent" /></div>

  return (
    <div className="space-y-4">
      {toast && <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-2xl bg-[#1a1a2e] px-5 py-3 text-sm font-medium text-white shadow-lg">{toast}</div>}
      {rows.length === 0 && <p className="rounded-2xl border border-dashed border-[#e5e7eb] bg-white p-8 text-center text-sm text-[#697586]">No repayments found.</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        {rows.map(r => (
          <div key={r['Repayment ID']} className="rounded-[1.6rem] border border-white/70 bg-white p-5 shadow-panel">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{r.customerName}</p>
                <p className="text-sm text-[#697586]">{r['Loan ID']} &bull; Week {r['Week No']}</p>
                <p className="text-sm text-[#697586]">Due: {r['Due Date']}</p>
              </div>
              <div className="text-right">
                <p className="text-xl font-semibold">{currency(Number(r['Amount']))}</p>
                <StatusPill status={r['Status']} />
              </div>
            </div>
            {r['Status'] !== 'Paid' && (
              <form onSubmit={e => markPaid(e, r['Repayment ID'])} className="mt-4 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <input name="paymentMode" placeholder="Cash / UPI / Bank" className="rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none focus:border-[#1a1a2e]" />
                  <input name="paymentProof" type="file" className="rounded-2xl border border-[#e5e7eb] px-3 py-2.5 text-sm" />
                </div>
                <textarea name="notes" placeholder="Payment notes" className="min-h-[72px] w-full rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none focus:border-[#1a1a2e]" />
                <button type="submit" className="w-full rounded-2xl bg-[#1a1a2e] px-4 py-3 text-sm font-semibold text-white">Mark as paid</button>
              </form>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
