'use client'
// Branch staff approve a renewal: phone the customer, they read out the OTP sent to their registered mobile, then approve.
import { useState } from 'react'
import { Session, Lead } from '@/types'
import OtpPanel, { OtpState } from './OtpPanel'
import { apiSend } from '@/lib/clientApi'

export default function RenewalApproveModal({ session, lead, onClose, onDone }: { session: Session; lead: Lead; onClose: () => void; onDone: (msg: string) => void }) {
  const [otp, setOtp] = useState<OtpState>({ verified: false, overridden: false })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const ready = otp.verified || otp.overridden

  async function approve() {
    setBusy(true); setError('')
    const r = await apiSend(session.token, 'PATCH', `/api/leads/${lead.leadId}`, { action: 'adminReview', decision: 'Approve Loan' })
    setBusy(false)
    if (!r.ok) { setError(r.error || 'Could not approve'); return }
    onDone(`${lead.customerName}: renewal approved. It is now in the Disbursement list.`)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-[1.75rem] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-black/5 px-6 py-4">
          <div>
            <p className="text-sm font-semibold">Approve renewal</p>
            <p className="mt-0.5 text-xs text-soft">{lead.customerName} · {lead.phone} · guarantor {lead.guarantorName}</p>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold text-soft hover:bg-mist">✕</button>
        </div>
        <div className="space-y-4 p-6">
          <OtpPanel token={session.token} leadId={lead.leadId} purpose="renewal_approval" onChange={setOtp} />
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button onClick={approve} disabled={!ready || busy} className="flex-1 rounded-2xl bg-green-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">{busy ? 'Approving…' : 'Approve renewal'}</button>
            <button onClick={onClose} className="rounded-2xl border border-line px-4 py-3 text-sm font-semibold">Cancel</button>
          </div>
          {!ready && <p className="text-center text-xs text-soft">Approval unlocks after the customer&apos;s OTP is verified.</p>}
        </div>
      </div>
    </div>
  )
}
