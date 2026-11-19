'use client'
// Office side of a partial verification: the agent visited, the customer was not at home, and the agent saved the house photo,
// the landmark photo and the home location (lead status "Partially Verified"). When the customer comes to the office, Admin or
// branch staff open this form from Leads, add the rest (customer photo, Aadhaar, cheque, passbook, bank, KYC, risk, recommendation),
// confirm the customer's OTP, and submit. Same rules as the agent's full submit; the lead becomes "Verification Submitted".
// API: PATCH /api/leads/:id { action: 'completeVerification' } (app/api/leads/[leadId]/route.ts).
import { useRef, useState } from 'react'
import type { Session, Lead } from '@/types'
import DriveImage from '@/components/ui/DriveImage'
import OtpPanel, { type OtpState } from './OtpPanel'
import { apiSend } from '@/lib/clientApi'
import { fileToPayload } from '@/lib/imageCompress'
import { parseVisitNotes } from '@/lib/partialVerification'

const OFFICE_PHOTOS = [
  { key: 'customerPhoto', label: 'Customer Photo', col: 'customerPhotoUrl' },
  { key: 'aadhaarFront', label: 'Aadhaar Front', col: 'aadhaarFrontUrl' },
  { key: 'aadhaarBack', label: 'Aadhaar Back', col: 'aadhaarBackUrl' },
  { key: 'chequePhoto', label: 'Cheque Photo', col: 'chequePhotoUrl' },
  { key: 'passbookPhoto', label: 'Bank Passbook Photo (first page)', col: 'passbookPhotoUrl' },
] as const
type OfficePhoto = typeof OFFICE_PHOTOS[number]['key']

const box = 'w-full rounded-2xl border border-line bg-mist px-4 py-3 text-sm outline-none focus:border-ink focus:bg-white transition'
const cap = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-soft'

export default function CompleteVerificationForm({ session, lead, onClose, onDone }: {
  session: Session; lead: Lead; onClose: () => void; onDone: (message: string) => void
}) {
  const agentNotes = parseVisitNotes(lead.verificationNotes)
  const [phone, setPhone] = useState(lead.phone || '')
  const [otp, setOtp] = useState<OtpState>({ verified: false, overridden: false })
  const [files, setFiles] = useState<Partial<Record<OfficePhoto, File>>>({})
  const [previews, setPreviews] = useState<Partial<Record<OfficePhoto, string>>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const formRef = useRef<HTMLFormElement>(null)

  function pick(key: OfficePhoto, f: File) {
    setFiles(p => ({ ...p, [key]: f }))
    setPreviews(p => ({ ...p, [key]: URL.createObjectURL(f) }))
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = e.currentTarget
    const g = (k: string) => (f.elements.namedItem(k) as HTMLInputElement | null)?.value || ''
    setBusy(true); setError('')
    const payload: Record<string, string> = { action: 'completeVerification' }
    for (const k of ['recommendationStatus', 'riskLevel', 'riskNotes', 'customerName', 'phone', 'aadhaarNo', 'address', 'place', 'houseName', 'landmark',
      'accountNumber', 'ifscCode', 'accountHolder', 'nomineeName', 'nomineePhone', 'occupation', 'panNo', 'chequeNumber']) payload[k] = g(k)
    for (const { key } of OFFICE_PHOTOS) { const file = files[key]; if (file) payload[key] = await fileToPayload(file) }
    const r = await apiSend(session.token, 'PATCH', `/api/leads/${lead.leadId}`, payload)
    setBusy(false)
    if (!r.ok) { setError(r.error || 'Could not complete the verification'); return }
    onDone('Verification completed. It is now waiting for approval.')
  }

  const fields: [string, string, string | undefined][] = [
    ['customerName', 'Full Name *', lead.customerName], ['phone', 'Phone *', lead.phone], ['aadhaarNo', 'Aadhaar No', lead.aadhaarNo],
    ['address', 'Address', lead.address], ['houseName', 'House Name', lead.houseName], ['place', 'Place', lead.place], ['landmark', 'Landmark', lead.landmark],
    ['accountNumber', 'Account Number', lead.accountNumber], ['ifscCode', 'IFSC Code', lead.ifscCode],
    ['accountHolder', 'Name in bank account (as in the passbook)', lead.accountHolder || lead.customerName],
    ['panNo', 'PAN No', lead.panNo], ['chequeNumber', 'Cheque Number', lead.chequeNumber], ['nomineeName', 'Nominee Name', lead.nomineeName], ['nomineePhone', 'Nominee Phone', lead.nomineePhone],
  ]
  const ready = otp.verified || otp.overridden

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onClose} className="rounded-2xl border border-line bg-white px-4 py-2 text-sm font-semibold">Back</button>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold">Complete verification: {lead.customerName}</p>
          <p className="text-sm text-soft">{lead.leadId} &bull; partially verified by {lead.assignedAgentName || 'the agent'}{lead.partialVerifiedAt ? ` on ${String(lead.partialVerifiedAt).slice(0, 10)}` : ''} (customer was not at home)</p>
        </div>
      </div>

      {/* what the agent saved at the house: read-only */}
      <div className="rounded-[1.75rem] border border-white/70 border-l-4 border-l-amber-400 bg-amber-50/30 p-5 shadow-panel space-y-4">
        <p className="text-xs font-bold uppercase tracking-widest text-amber-700">Saved by the agent at the house (read-only)</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <DriveImage url={lead.housePhotoUrl} label="House Photo" token={session.token} />
          <DriveImage url={lead.landmarkPhotoUrl} label="Landmark Photo" token={session.token} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className={cap}>Home location</p>
            {agentNotes.mapsLink
              ? <a href={agentNotes.mapsLink} target="_blank" rel="noreferrer" className="break-all text-sm text-blue-600 underline">{agentNotes.mapsLink}</a>
              : <p className="text-sm">{agentNotes.gpsCoordinates || '—'}</p>}
          </div>
          {agentNotes.riskNotes && <div><p className={cap}>Agent&apos;s field notes</p><p className="rounded-xl bg-panel px-3 py-2 text-sm">{agentNotes.riskNotes}</p></div>}
        </div>
      </div>

      <form ref={formRef} onSubmit={submit} className="space-y-6 rounded-[1.75rem] border border-white/70 bg-white p-6 shadow-panel">
        <section>
          <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-soft">Borrower Details</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {fields.map(([k, l, v]) => (
              <label key={k} className="block">
                <span className={cap}>{l}</span>
                <input name={k} defaultValue={String(v || '')} required={l.endsWith('*')} onChange={k === 'phone' ? (e => setPhone(e.target.value)) : undefined} className={box} />
              </label>
            ))}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className={cap}>Occupation</span>
              <select name="occupation" defaultValue={lead.occupation || ''} className={box}>
                <option value="">Select</option>
                {['House Wife', 'Daily Wages', 'Business Running Shop', 'Employed in Private Firm'].map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
            <label className="block">
              <span className={cap}>Risk Level *</span>
              <select name="riskLevel" required defaultValue={['Low', 'Medium', 'High'].includes(lead.riskLevel) ? lead.riskLevel : ''} className={box}>
                <option value="">Select</option><option>Low</option><option>Medium</option><option>High</option>
              </select>
            </label>
            <label className="block">
              <span className={cap}>Recommendation *</span>
              <select name="recommendationStatus" required defaultValue={['Verified', 'Suspicious', 'Rejected Recommendation'].includes(lead.recommendationStatus) ? lead.recommendationStatus : ''} className={box}>
                <option value="">Select</option><option>Verified</option><option>Suspicious</option><option>Rejected Recommendation</option>
              </select>
            </label>
          </div>
        </section>

        <section>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-soft">Customer OTP (required)</p>
          <p className="mb-3 text-sm text-soft">The customer is here: send the code to their phone and type what they read out.</p>
          <OtpPanel token={session.token} leadId={lead.leadId} purpose="lead_verification" phone={phone} onChange={setOtp} />
        </section>

        <section>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-soft">Documents</p>
          <p className="mb-4 text-sm text-soft">Upload what the customer brought. A photo already on the lead is kept unless you choose a new one.</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {OFFICE_PHOTOS.map(({ key, label, col }) => (
              <div key={key}>
                {previews[key]
                  ? <div><p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-wider text-soft">{label} (new)</p><img src={previews[key]} alt={label} className="h-64 w-full rounded-2xl border border-line object-cover" /></div>
                  : <DriveImage url={String(lead[col] || '')} label={label} token={session.token} />}
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="cursor-pointer rounded-2xl bg-ink px-3 py-2.5 text-center text-sm font-semibold text-white">
                    Take photo
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) pick(key, f); e.target.value = '' }} />
                  </label>
                  <label className="cursor-pointer rounded-2xl border border-line px-3 py-2.5 text-center text-sm font-semibold">
                    From files
                    <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) pick(key, f); e.target.value = '' }} />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-soft">Notes</p>
          <textarea name="riskNotes" rows={3} defaultValue={agentNotes.riskNotes} className={box} />
        </section>

        {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/5 pt-5">
          <p className="text-sm text-soft">Lead ID {lead.leadId}</p>
          <button type="submit" disabled={busy || !ready} title={ready ? '' : 'Verify the customer OTP first'} className="rounded-2xl bg-ink px-6 py-3 text-sm font-semibold text-white disabled:opacity-40">
            {busy ? 'Saving…' : ready ? 'Complete verification' : 'Verify OTP to complete'}
          </button>
        </div>
      </form>
    </div>
  )
}
