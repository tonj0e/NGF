import { NextRequest } from 'next/server'
import { apiHandler, getSession, ok, err } from '@/lib/api'
import { csrfProtection } from '@/lib/csrf'
import { needFeature } from '@/lib/access'
import { lead } from '@/lib/features'
import { rateLimitKey } from '@/lib/rate-limiter'
import { selectRows } from '@/lib/supabase-db'
import { pickProvider, slipReaderConfigured } from '@/lib/slipReader'
import { slipSettings } from '@/lib/paymentChat'
import { readAadhaar, type AadhaarImage } from '@/lib/aadhaarReader'

// New Lead > Scan Aadhaar: reads the front and back of the card and returns name, number and address to pre-fill the form.
// Usage is logged on the AI page under its own category ("Aadhaar"), apart from payment screenshots.
const MAX_B64 = 3_000_000   // about 2.2 MB of image per side; the browser already shrinks photos to about 1 MB

function parseImage(v: unknown): AadhaarImage | null {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(v || ''))
  return m && m[2].length <= MAX_B64 ? { media: m[1] as AadhaarImage['media'], base64: m[2] } : null
}

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await getSession(req)
  const csrfError = csrfProtection(req, session.userId)
  if (csrfError) return csrfError
  if (!['Guarantor', 'Admin', 'Staff'].includes(session.role)) return err('No permission', 403)
  await needFeature(session, lead('leadsEdit'))
  const rl = rateLimitKey(`aadhaar:${session.userId}`, 12, 60_000)
  if (!rl.success) return err(`Too many reads. Wait ${rl.retryAfterSec} seconds and try again.`, 429)

  const body = await req.json().catch(() => ({}))
  const images = [parseImage(body.front), parseImage(body.back)].filter((i): i is AadhaarImage => !!i)
  if (!images.length) return err('Add a clear photo of the Aadhaar front and back')

  if (!(await slipReaderConfigured())) return err('The AI reader is not set up yet. Please enter the details manually.')
  const prov = await pickProvider((await slipSettings()).provider)
  if (!prov || prov === 'nvidia') return err('The AI reader is not set up yet. Please enter the details manually.')

  let guarantorId: string | null = null
  if (session.role === 'Guarantor') guarantorId = (await selectRows('Guarantors', qb => qb.eq('user_id', session.userId).limit(1))).rows[0]?.['Guarantor ID'] || null

  try {
    const r = await readAadhaar(images, prov, { purpose: 'aadhaar', guarantorId, userId: session.userId })
    if (!r.isAadhaar) return err('This does not look like an Aadhaar card. Take the photo again.')
    return ok({ ...r })
  } catch {
    return err('Could not read the card. Take clearer photos or enter the details manually.')
  }
})
