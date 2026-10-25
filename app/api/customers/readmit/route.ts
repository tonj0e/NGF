import { NextRequest } from 'next/server'
import { apiHandler, requireRole, ok, err } from '@/lib/api'
import { requireFeature } from '@/lib/access'
import { getRowById, updateById, nowIso, invalidateCache, getSupabase } from '@/lib/supabase-db'
import { csrfProtection } from '@/lib/csrf'
import { createAuditLogger } from '@/lib/audit'

// Re-admit a permanently closed customer. Admin only, with a written note of the verification done (several checks).
export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requireFeature(req, ['customersReadmit'])
  const csrfError = csrfProtection(req, session.userId)
  if (csrfError) return csrfError
  const { customerId, reason } = await req.json().catch(() => ({})) as { customerId?: string; reason?: string }
  const note = String(reason || '').trim()
  if (!customerId) return err('customerId required')
  if (note.length < 20) return err('Describe the verification done before re-admitting (at least 20 characters)')
  const c = await getRowById('Customers', customerId)
  if (!c) return err('Customer not found', 404)
  if (String(c['Permanent Block']) !== 'true') return err('This customer is not permanently closed')
  await updateById('Customers', customerId, { 'Permanent Block': 'false', 'Block Reason': null, 'Hold Until': null, 'Updated At': nowIso() })
  await getSupabase().from('loan_closures').update({ readmitted_at: nowIso(), readmitted_by: session.userId, readmit_reason: note.slice(0, 500) })
    .eq('customer_id', customerId).eq('mode', 'permanent').is('readmitted_at', null)
  invalidateCache('Customers')
  await createAuditLogger(req, session).log('CUSTOMER_READMITTED', 'Customer', customerId, { note: note.slice(0, 200) })
  return ok({ readmitted: true })
})
