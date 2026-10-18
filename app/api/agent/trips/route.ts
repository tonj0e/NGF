import { NextRequest } from 'next/server'
import { apiHandler, requireRole, ok, err, getSession } from '@/lib/api'
import { readTable, appendRow, makeId, nowIso, formatDateYmd, addDays, getNextSaturday, invalidateCache, queryTable } from '@/lib/supabase-db'
import { validateBody, tripSchema } from '@/lib/validation'
import { createAuditLogger, AUDIT_ACTIONS } from '@/lib/audit'
import { csrfProtection } from '@/lib/csrf'

function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function getWeekStart(date: Date): Date {
  const d = new Date(date)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  d.setHours(0, 0, 0, 0)
  return d
}

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await getSession(req)

  const csrfError = csrfProtection(req, session.userId)
  if (csrfError) return csrfError

  const validation = await validateBody(tripSchema)(req)
  if (!validation.success) return validation.response
  const body = validation.data

  const sessionRole = await requireRole(req, ['NGF AGENT'])
  const { startLatitude, startLongitude, endLatitude, endLongitude, leadId, manualDistance } = body

  const agents = await readTable('Agents')
  const agent = agents.find(a => a['User ID'] === session.userId)
  if (!agent) return err('Agent not found')

  const autoDistanceKm = getDistanceKm(startLatitude, startLongitude, endLatitude, endLongitude)
  const distanceKm = typeof manualDistance === 'number' && manualDistance > 0 ? manualDistance : autoDistanceKm
  const tripDate = new Date()
  const weekStart = getWeekStart(tripDate)

  const tripId = makeId('TRIP')
  await appendRow('AgentTrips', {
    'Trip ID': tripId,
    'Agent ID': agent['Agent ID'],
    'Lead ID': leadId || '',
    'Start Latitude': String(startLatitude),
    'Start Longitude': String(startLongitude),
    'End Latitude': String(endLatitude),
    'End Longitude': String(endLongitude),
    'Distance Km': String(distanceKm.toFixed(2)),
    'Trip Date': formatDateYmd(tripDate),
    'Week Start': formatDateYmd(weekStart),
    'Created At': nowIso(),
  })
  invalidateCache('AgentTrips')

  await createAuditLogger(req, { userId: session.userId, username: session.username, role: session.role }).success(
    AUDIT_ACTIONS.TRIP_LOG,
    'Trip',
    tripId,
    { agentId: agent['Agent ID'], leadId, distanceKm, manualDistance: !!manualDistance, startLatitude, startLongitude, endLatitude, endLongitude }
  )

  return ok({ tripId, distanceKm: distanceKm.toFixed(2), autoDistanceKm: autoDistanceKm.toFixed(2) })
})

export const GET = apiHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ['NGF AGENT', 'Admin', 'Staff'])
  const { searchParams } = new URL(req.url)
  const weekStart = searchParams.get('weekStart') || ''
  const agentId = searchParams.get('agentId') || ''

  const agents = await readTable('Agents')
  const agent = agents.find(a => a['User ID'] === session.userId)
  if (!agent && session.role === 'NGF AGENT') return err('Agent not found')

  // An agent sees only their own trips; Admin and Staff may ask for any agent
  const targetAgentId = session.role === 'NGF AGENT' ? agent?.['Agent ID'] : (agentId || agent?.['Agent ID'])
  if (!targetAgentId) return err('Agent ID required')

  let trips = await readTable('AgentTrips')
  trips = trips.filter(t => t['Agent ID'] === targetAgentId)
  if (weekStart) {
    trips = trips.filter(t => t['Week Start'] === weekStart)
  }
  trips.sort((a, b) => new Date(b['Created At']).getTime() - new Date(a['Created At']).getTime())

  return ok({ trips })
})