import { NextRequest } from 'next/server'
import { apiHandler, requireRole, ok, err } from '@/lib/api'
import { clearTable } from '@/lib/supabase-db'

const CLEARABLE = ['Customers', 'Loans', 'Repayments', 'Collections', 'Settlements', 'Notifications', 'Logs', 'Leads', 'Agents', 'Guarantors', 'ReviewOptions', 'Capital'] as const
type ClearableTable = typeof CLEARABLE[number]

export const POST = apiHandler(async (req: NextRequest) => {
  await requireRole(req, ['Admin'])
  const { tables, confirm } = await req.json()

  if (confirm !== 'CLEAR ALL') return err('Invalid confirmation phrase')
  if (!Array.isArray(tables) || tables.length === 0) return err('No tables selected')

  const invalid = tables.filter((t: string) => !(CLEARABLE as readonly string[]).includes(t))
  if (invalid.length > 0) return err(`Cannot clear: ${invalid.join(', ')}`)

  const results: Record<string, 'ok' | string> = {}
  await Promise.all(
    tables.map(async (table: ClearableTable) => {
      try {
        await clearTable(table)
        results[table] = 'ok'
      } catch (e: any) {
        results[table] = e?.message || 'error'
      }
    })
  )

  return ok({ results })
})
