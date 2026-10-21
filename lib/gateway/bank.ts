import type { GatewayProvider } from './types'

// The bank's real gateway. NOT WRITTEN YET: it needs the bank's API documentation and sandbox (practice) credentials.
// When they arrive, implement createLink (call the bank's "create payment link" API) and verifyWebhook (check the bank's
// signature on the callback and map its fields to GatewayEvent), keeping this file the only place that knows the bank's format.
export const bank: GatewayProvider = {
  name: 'bank', isLive: true,
  async createLink() { throw new Error('The bank gateway is not connected yet. Waiting for the bank API details.') },
  verifyWebhook() { return null },
}
