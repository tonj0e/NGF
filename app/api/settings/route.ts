import { NextRequest } from 'next/server'
import { apiHandler, requireRole, ok, err } from '@/lib/api'
import { readTable, appendRow, updateById, findRecord, nowIso, invalidateCache } from '@/lib/supabase-db'
import { createAuditLogger } from '@/lib/audit'

const QR_LOGIN_ROLES = ['Guarantor', 'NGF AGENT', 'Staff']

export const GET = apiHandler(async (req: NextRequest) => {
  await requireRole(req, ['Admin'])
  const rows = await readTable('Settings')
  const val = (k: string, d: string) => rows.find(r => r['Key'] === k)?.['Value'] ?? d
  const qrLogin: Record<string, boolean> = {}
  for (const role of QR_LOGIN_ROLES) {
    qrLogin[role] = val(`qrlogin:${role}`, '0') === '1'
  }
  const deposit = {
    rate: Number(val('deposit:rate', '4')) || 4,
    cycleDays: Number(val('deposit:cycleDays', '122')) || 122,
    principalWithdraw: val('deposit:principalWithdraw', '0') === '1',
  }
  const agent = {
    enabled: val('agent:enabled', '1') === '1',
    voice: val('agent:voice', '1') === '1',
    finance: val('agent:finance', '1') === '1',
    collections: val('agent:collections', '1') === '1',
    payouts: val('agent:payouts', '1') === '1',
    capital: val('agent:capital', '1') === '1',
    reports: val('agent:reports', '1') === '1',
    approvals: val('agent:approvals', '1') === '1',
  }
  // Testing switch: while on, every password-recovery code goes to this one mailbox (switches itself off at the end time)
  const until = val('recovery:testUntil', '')
  const recovery = { testEmail: val('recovery:testEmail', ''), testUntil: until, testOn: !!until && Date.parse(until) > Date.now() }
  return ok({ qrLogin, deposit, agent, recovery })
})

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ['Admin'])
  const { key, value } = await req.json()
  if (!key) return err('key required')
  if (key === 'recovery:testEmail' && value && !/^\S+@\S+\.\S+$/.test(String(value).trim())) return err('Enter a valid email address')
  if (key === 'recovery:testUntil' && value && !(Date.parse(String(value)) > 0)) return err('Invalid end time')
  if (String(key).startsWith('recovery:')) {
    await createAuditLogger(req, session).log('RECOVERY_TEST_SETTING_CHANGED', 'Setting', String(key), { value: key === 'recovery:testEmail' ? '(email)' : String(value) })
  }
  const rows = await readTable('Settings')
  const existing = findRecord(rows, 'Key', key)
  if (existing) {
    await updateById('Settings', key, { 'Value': String(value), 'Updated At': nowIso() })
  } else {
    await appendRow('Settings', { 'Key': key, 'Value': String(value), 'Updated At': nowIso() })
  }
  invalidateCache('Settings')
  return ok({ success: true })
})
