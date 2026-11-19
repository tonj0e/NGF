// Partial verification (2026-11-20): the agent visits, the customer is not at home. The agent can still take the house photo,
// the landmark photo and the home location, and submit a PARTIAL verification (lead status "Partially Verified"). The customer
// later comes to the office, where Admin / branch staff complete the rest (customer photo, Aadhaar, bank, OTP ...) and the lead
// becomes "Verification Submitted" as after a full visit. Pure rules only (no database), so they can be unit tested.
// Used by app/api/leads/[leadId]/route.ts (submitPartialVerification, completeVerification) and the two forms.

export const PARTIAL_STATUS = 'Partially Verified'

// The agent's visit OTP stays valid for submitting for 12 hours (same window for the office completion)
export const OTP_VISIT_FRESH_MS = 12 * 60 * 60 * 1000

/** A home location is a "lat,lng" pair from the Locate button, or a pasted Google Maps link. */
export function hasHomeLocation(gpsCoordinates?: string | null, mapsLink?: string | null): boolean {
  const gps = String(gpsCoordinates || '').trim()
  if (/^-?\d{1,2}(\.\d+)?\s*,\s*-?\d{1,3}(\.\d+)?$/.test(gps)) return true
  return /^https?:\/\/\S+$/i.test(String(mapsLink || '').trim())
}

/** What is still missing before a partial verification can be submitted (empty = ready). */
export function partialMissing(p: { housePhoto: boolean; landmarkPhoto: boolean; gpsCoordinates?: string | null; mapsLink?: string | null }): string[] {
  const out: string[] = []
  if (!p.housePhoto) out.push('house photo')
  if (!p.landmarkPhoto) out.push('landmark photo')
  if (!hasHomeLocation(p.gpsCoordinates, p.mapsLink)) out.push('home location (press Locate or paste the Google Maps link)')
  return out
}

/** The agent may submit a visit (full or partial) only for a lead assigned to them that is waiting in Agent Assigned. */
export function agentVisitBlock(p: { status: string; assignedAgentId?: string | null; myAgentId?: string | null }): { error: string; status: number } | null {
  if (!p.myAgentId || p.assignedAgentId !== p.myAgentId) return { error: 'No permission', status: 403 }
  if (p.status !== 'Agent Assigned') return { error: 'This lead is not waiting for verification', status: 400 }
  return null
}

/** The office may complete only a new-customer lead that is Partially Verified. */
export function officeCompleteBlock(p: { status: string; loanProduct?: string | null }): string | null {
  if (p.loanProduct === 'RENEWAL') return 'A renewal has no field verification'
  if (p.status !== PARTIAL_STATUS) return 'This lead is not waiting for the office to complete its verification'
  return null
}

/** The customer OTP rule of the full verification (agent at the house, or office completing a partial one):
 *  a code verified in the last 12 hours for this same phone number, or a recorded override reason. `phone` is already normalised. */
export function visitOtpBlock(p: { otpVerifiedAt?: string | null; otpPhone?: string | null; overrideReason?: string | null; phone: string | null; now?: number }): string | null {
  const now = p.now ?? Date.now()
  const fresh = !!p.otpVerifiedAt && now - Date.parse(p.otpVerifiedAt) < OTP_VISIT_FRESH_MS
  if (fresh) {
    if (!p.phone || p.otpPhone !== p.phone) return 'The phone number was changed after the OTP was verified. Verify the OTP again for the new number.'
    return null
  }
  if (!p.overrideReason) return 'Customer OTP is required: ask the customer for the code sent to their phone, or record why it could not be done.'
  return null
}

/** Reads the agent's saved notes ({riskNotes, gpsCoordinates, mapsLink} as JSON); old plain-text notes become riskNotes. */
export function parseVisitNotes(raw?: string | null): { riskNotes: string; gpsCoordinates: string; mapsLink: string } {
  const empty = { riskNotes: '', gpsCoordinates: '', mapsLink: '' }
  if (!raw) return empty
  try {
    const n = JSON.parse(raw)
    if (n && typeof n === 'object') return { riskNotes: String(n.riskNotes || ''), gpsCoordinates: String(n.gpsCoordinates || ''), mapsLink: String(n.mapsLink || '') }
  } catch { /* plain text */ }
  return { ...empty, riskNotes: String(raw) }
}
