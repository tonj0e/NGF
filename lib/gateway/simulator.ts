import { createHmac, timingSafeEqual } from 'crypto'
import type { GatewayProvider, GatewayEvent, CreateLinkInput } from './types'

// PRACTICE gateway for development only (never active on the live site: see lib/gateway/index.ts).
// It behaves like a bank gateway: a hosted pay page, then a signed webhook. Used to test the whole flow without real money.
const secret = () => process.env.GATEWAY_WEBHOOK_SECRET || `practice:${process.env.JWT_SECRET || 'dev'}`
export const sign = (body: string) => createHmac('sha256', secret()).update(body).digest('hex')

export const simulator: GatewayProvider = {
  name: 'simulator', isLive: false,
  async createLink(i: CreateLinkInput) {
    const base = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '')
    return { providerRef: `SIM-${i.linkId}`, url: `${base}/pay-sim/${i.linkId}` }
  },
  verifyWebhook(rawBody, headers): GatewayEvent | null {
    const got = headers.get('x-gateway-signature') || ''
    const want = sign(rawBody)
    if (got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) return null
    try {
      const j = JSON.parse(rawBody)
      if (!j.linkId || !j.gatewayPaymentId) return null
      return { linkId: String(j.linkId), status: j.status === 'paid' ? 'paid' : 'failed', gatewayPaymentId: String(j.gatewayPaymentId), amount: Number(j.amount), method: j.method || 'upi', paidAt: j.paidAt || new Date().toISOString() }
    } catch { return null }
  },
}
