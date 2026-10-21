import type { GatewayProvider } from './types'
import { makeSimulator, practiceSecret } from './simulator'
import { getConfig } from '../integrations'
import { bank } from './bank'
import { isProductionEnv } from '../devOnly'

/** GATEWAY_PROVIDER = bank | simulator. The practice gateway can never run on the live site. */
export async function getGateway(): Promise<GatewayProvider | null> {
  const p = (await getConfig('GATEWAY_PROVIDER')).toLowerCase()
  if (p === 'simulator' && !isProductionEnv()) return makeSimulator(await practiceSecret())
  if (p === 'bank') return bank
  return null
}
export type { GatewayProvider, GatewayEvent, GatewayMethod } from './types'
