import { NextRequest } from 'next/server'
import { apiHandler, getSession, ok, err } from '@/lib/api'
import { getLink, sendLinkWhatsApp, LinkError } from '@/lib/paymentLinks'
import { csrfProtection } from '@/lib/csrf'
import { createAuditLogger } from '@/lib/audit'

// Current state of one link (the screen polls this until it says Paid)
export const GET = apiHandler(async (req: NextRequest, ctx?: { params: Promise<{ linkId: string }> }) => {
  const session = await getSession(req)
  const { linkId } = await ctx!.params
  try { return ok(await getLink(session, linkId)) } catch (e) { if (e instanceof LinkError) return err(e.message, 404); throw e }
})

// Send this link to the customer on WhatsApp from the server
export const POST = apiHandler(async (req: NextRequest, ctx?: { params: Promise<{ linkId: string }> }) => {
  const session = await getSession(req)
  const csrfError = csrfProtection(req, session.userId)
  if (csrfError) return csrfError
  const { linkId } = await ctx!.params
  try {
    const r = await sendLinkWhatsApp(session, linkId)
    await createAuditLogger(req, session).log('PAYMENT_LINK_WHATSAPP_SENT', 'PaymentLink', linkId, { to: r.to })
    return ok(r)
  } catch (e) { if (e instanceof LinkError) return err(e.message); throw e }
})
