import type { GatewayProvider } from './types'
import { simulator } from './simulator'
import { bank } from './bank'
import { isProductionEnv } from '../devOnly'

/** GATEWAY_PROVIDER = bank | simulator. The practice gateway can never run on the live site. */
export function getGateway(): GatewayProvider | null {
  const p = (process.env.GATEWAY_PROVIDER || '').toLowerCase()
  if (p === 'simulator' && !isProductionEnv()) return simulator
  if (p === 'bank') return bank
  return null
}
export type { GatewayProvider, GatewayEvent, GatewayMethod } from './types'
