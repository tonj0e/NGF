import { NextRequest } from 'next/server'
import { apiHandler, requireRole, ok, err } from '@/lib/api'
import { readTable, appendRow, updateById, deleteRow, findRecord, makeId, nowIso, deleteById, invalidateCache } from '@/lib/supabase-db'

export const GET = apiHandler(async (_req: NextRequest) => {
  const opts = await readTable('ReviewOptions', { forceFresh: true })
  return ok({ options: opts })
})

export const POST = apiHandler(async (req: NextRequest) => {
  await requireRole(req, ['Admin'])
  const { label, category } = await req.json()
  if (!label) return err('label required')
  await appendRow('ReviewOptions', {
    'Option ID': makeId('RVW'),
    'Label': label,
    'Category': category || 'General',
    'Created At': nowIso(),
  })
  return ok({ success: true })
})

export const PATCH = apiHandler(async (req: NextRequest) => {
  await requireRole(req, ['Admin'])
  const { optionId, label } = await req.json()
  if (!optionId || !label) return err('optionId and label required')
  const opts = await readTable('ReviewOptions', { forceFresh: true })
  const opt = findRecord(opts, 'Option ID', optionId)
  if (!opt) return err('Option not found')
  await updateById('ReviewOptions', optionId, { 'Label': label })
  invalidateCache('ReviewOptions')
  return ok({ success: true })
})

export const DELETE = apiHandler(async (req: NextRequest) => {
  await requireRole(req, ['Admin'])
  const { optionId } = await req.json()
  if (!optionId) return err('optionId required')
  const opts = await readTable('ReviewOptions')
  const opt = findRecord(opts, 'Option ID', optionId)
  if (!opt) return err('Option not found')
  await deleteById('ReviewOptions', optionId)
  return ok({ success: true })
})
