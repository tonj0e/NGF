'use client'
// Dev > Payments: online payment gateway status, the fee percentage added for the customer, the webhook address for the bank, recent links.
import { useEffect, useState } from 'react'
import { Session } from '@/types'
import { apiGet, apiSend } from '@/lib/clientApi'

type Data = { chosen: string; provider: string; live: boolean; feePercent: number; webhookUrl: string; recent: { link_id: string; kind: string; loan_id: string; base_amount: number; fee_amount: number; total_amount: number; status: string; provider: string; created_by_name: string | null; created_at: string }[] }

export default function GatewayPanel({ session }: { session: Session }) {
  const [d, setD] = useState<Data | null>(null)
  const [pct, setPct] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [error, setError] = useState('')

  async function load() { const r = await apiGet<Data>(session.token, '/api/gateway'); if (r.ok) { setD(r.data!); setPct(String(r.data!.feePercent)); setError('') } else setError(r.error || 'Could not load') }
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setMsg(null)
    const r = await apiSend(session.token, 'POST', '/api/gateway', { feePercent: Number(pct) })
    setMsg(r.ok ? { ok: true, text: `Saved. Customers now pay ${r.data.feePercent}% extra on online payments.` } : { ok: false, text: r.error || 'Could not save' })
    if (r.ok) load()
  }
  const inr = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n)

  return (
    <div className="space-y-4">
      <div className="rounded-[1.75rem] border border-white/70 bg-white p-6 shadow-panel space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><p className="text-sm font-semibold">Online payment gateway</p><p className="text-xs text-[#697586]">Payment links and QR for weekly payments and for closing a loan.</p></div>
          {d && <span className={`rounded-full px-3 py-1 text-xs font-bold ${d.provider === 'none' ? 'bg-amber-100 text-amber-700' : d.live ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{d.provider === 'none' ? 'Not connected' : d.live ? `Connected: ${d.provider}` : 'Practice mode (no real money)'}</span>}
        </div>
        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
        {d && d.provider === 'none' && (
          <div className="rounded-2xl bg-amber-50 p-4 text-xs text-amber-900 space-y-1">
            <p>The bank&apos;s gateway is not connected yet. When the bank sends its API details, the connection is added and <b>GATEWAY_PROVIDER=bank</b> is set on Hostinger.</p>
            <p>To try the whole flow without real money on your own computer, set <b>GATEWAY_PROVIDER=simulator</b> in <b>.env.local</b> (the practice gateway never runs on the live site).</p>
          </div>
        )}
        {d && d.webhookUrl && <div className="rounded-2xl bg-[#f9fafb] p-3 text-xs"><p className="font-semibold">Webhook address to give the bank</p><p className="mt-1 break-all font-mono">{d.webhookUrl}</p><p className="mt-1 text-[#697586]">The bank calls this when a payment succeeds. It is checked with the bank&apos;s signature, so nobody else can use it.</p></div>}
      </div>

      <div className="rounded-[1.75rem] border border-white/70 bg-white p-6 shadow-panel space-y-3">
        <p className="text-sm font-semibold">Gateway fee added for the customer</p>
        <p className="text-xs text-[#697586]">This percentage is added to what the customer pays online and is shown to them before they pay. The loan is credited the normal amount only. Set 0 for no extra fee. Please confirm with your bank or lawyer that charging this is allowed for your loans.</p>
        <div className="flex flex-wrap items-center gap-2">
          <input value={pct} onChange={e => setPct(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" data-no-upper className="w-28 rounded-2xl border border-[#e5e7eb] bg-[#f4f5f7] px-4 py-3 text-sm outline-none focus:border-[#1a1a2e] focus:bg-white" />
          <span className="text-sm">%</span>
          <button onClick={save} disabled={pct === '' || Number(pct) < 0 || Number(pct) > 10} className="rounded-2xl bg-[#1a1a2e] px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">Save</button>
          {d && Number(pct) >= 0 && <span className="text-xs text-[#697586]">Example: a ₹1,000 week costs the customer {inr(1000 + Math.round(1000 * (Number(pct) || 0)) / 100)}</span>}
        </div>
        {msg && <p className={`rounded-xl px-3 py-2 text-xs ${msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>{msg.text}</p>}
      </div>

      {d && d.recent.length > 0 && (
        <div className="rounded-[1.75rem] border border-white/70 bg-white p-6 shadow-panel">
          <p className="mb-2 text-sm font-semibold">Recent payment links</p>
          <div className="overflow-x-auto"><table className="w-full text-left text-xs">
            <thead className="text-[#697586]"><tr><th className="py-1 pr-3">Link</th><th className="pr-3">Loan</th><th className="pr-3">Type</th><th className="pr-3">Total</th><th className="pr-3">Fee</th><th className="pr-3">Status</th><th>By</th></tr></thead>
            <tbody>{d.recent.map(r => <tr key={r.link_id} className="border-t border-[#f0f0f0]"><td className="py-1 pr-3 font-mono">{r.link_id}</td><td className="pr-3">{r.loan_id}</td><td className="pr-3">{r.kind === 'closure' ? 'Close' : 'Weeks'}</td><td className="pr-3">{inr(Number(r.total_amount))}</td><td className="pr-3">{inr(Number(r.fee_amount))}</td><td className="pr-3">{r.status}</td><td>{r.created_by_name || ''}</td></tr>)}</tbody>
          </table></div>
        </div>
      )}
    </div>
  )
}
