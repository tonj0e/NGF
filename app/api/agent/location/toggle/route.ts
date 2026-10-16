import { NextRequest } from 'next/server'
import { apiHandler, requireRole, ok, err } from '@/lib/api'
import { readTable, updateById } from '@/lib/supabase-db'

// POST - Agent toggles tracking on/off
export const POST = apiHandler(async (req: NextRequest) => {
  await requireRole(req, ['NGF AGENT'])
  const session = await requireRole(req, ['NGF AGENT'])

  const body = await req.json().catch(() => ({}))
  const isTracking = body.isTracking === true

  // Find agent by userId
  const agents = await readTable('Agents', { forceFresh: true })
  const agent = agents.find(a => a['User ID'] === session.userId)
  if (!agent) return err('Agent not found')

  // Update tracking status
  await updateById('Agents', agent['Agent ID'], {
    'Is Tracking': isTracking ? 'true' : 'false',
    'Updated At': new Date().toISOString(),
  })

  return ok({ success: true, isTracking, message: isTracking ? 'Tracking started' : 'Tracking stopped' })
})