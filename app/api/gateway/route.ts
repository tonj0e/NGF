import { NextRequest } from 'next/server'
import { apiHandler, requireRole, ok, err } from '@/lib/api'
import { getGateway } from '@/lib/gateway'
import { getFeePercent, recentLinks } from '@/lib/paymentLinks'
import { updateById, appendRow, readTable, nowIso, invalidateCache } from '@/lib/supabase-db'
import { csrfProtection } from '@/lib/csrf'
import { createAuditLogger } from '@/lib/audit'

// Admin: gateway status, the fee percentage added to the customer's payment, recent links
export const GET = apiHandler(async (req: NextRequest) => {
  await requireRole(req, ['Admin'])
  const g = getGateway()
  const wanted = (process.env.GATEWAY_PROVIDER || '').toLowerCase()
  return ok({
    chosen: wanted, provider: g?.name || 'none', live: !!g?.isLive, feePercent: await getFeePercent(),
    webhookUrl: `${(process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/+$/, '')}/api/gateway/webhook`,
    recent: await recentLinks(25),
  })
})

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ['Admin'])
  const csrfError = csrfProtection(req, session.userId)
  if (csrfError) return csrfError
  const { feePercent } = await req.json().catch(() => ({})) as { feePercent?: number }
  const n = Number(feePercent)
  if (!Number.isFinite(n) || n < 0 || n > 10) return err('The fee must be between 0 and 10 percent')
  const value = String(Math.round(n * 100) / 100)
  const rows = await readTable('Settings', { forceFresh: true })
  if (rows.some(r => r['Key'] === 'gateway:feePercent')) await updateById('Settings', 'gateway:feePercent', { 'Value': value, 'Updated At': nowIso() })
  else await appendRow('Settings', { 'Key': 'gateway:feePercent', 'Value': value, 'Updated At': nowIso() })
  invalidateCache('Settings')
  await createAuditLogger(req, session).log('GATEWAY_FEE_CHANGED', 'Setting', 'gateway:feePercent', { value })
  return ok({ feePercent: Number(value) })
})
