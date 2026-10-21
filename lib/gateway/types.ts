// A payment gateway adapter. The bank gives us its own API; we write ONE adapter file for it that implements this interface.
export type GatewayMethod = 'upi' | 'card' | 'netbanking' | 'other'

export interface CreateLinkInput {
  linkId: string          // our id, sent to the gateway as the merchant reference
  amount: number          // total the customer pays (rupees)
  customerName: string
  phone: string           // 10 digits
  description: string
  expiresAt: string       // ISO
  callbackUrl: string     // our webhook
}
export interface CreatedLink { providerRef: string; url: string }

/** What a verified webhook tells us */
export interface GatewayEvent {
  linkId: string
  status: 'paid' | 'failed'
  gatewayPaymentId: string   // UPI RRN / transaction id: becomes the UTR in Payment Matching
  amount: number
  method: GatewayMethod
  paidAt: string
}

export interface GatewayProvider {
  name: string
  /** false for the practice gateway: no real money moves */
  isLive: boolean
  createLink(input: CreateLinkInput): Promise<CreatedLink>
  /** Returns the event only when the signature is valid, otherwise null */
  verifyWebhook(rawBody: string, headers: Headers): GatewayEvent | null
}
