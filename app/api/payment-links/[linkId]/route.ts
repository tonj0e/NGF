import { NextRequest } from 'next/server'
import { apiHandler, getSession, ok, err } from '@/lib/api'
import { getLink, LinkError } from '@/lib/paymentLinks'

// Current state of one link (the screen polls this until it says Paid)
export const GET = apiHandler(async (req: NextRequest, ctx?: { params: Promise<{ linkId: string }> }) => {
  const session = await getSession(req)
  const { linkId } = await ctx!.params
  try { return ok(await getLink(session, linkId)) } catch (e) { if (e instanceof LinkError) return err(e.message, 404); throw e }
})
