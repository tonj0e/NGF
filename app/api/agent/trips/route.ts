import { NextRequest } from 'next/server'
import { apiHandler, requireRole, ok, err, getSession } from '@/lib/api'
import { requireFeature } from '@/lib/access'
import { readTable, appendRow, makeId, nowIso, formatDateYmd, addDays, getNextSaturday, invalidateCache, queryTable } from '@/lib/supabase-db'
import { validateBody, tripSchema } from '@/lib/validation'
import { createAuditLogger, AUDIT_ACTIONS } from '@/lib/audit'
import { csrfProtection } from '@/lib/csrf'
import { APP_CONFIG } from '@/lib/config'
import { agentRouteDays } from '@/lib/routes'

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

  // the agent's road distance is required; a straight line is never used as a distance
  if (!(typeof manualDistance === 'number' && manualDistance > 0)) return err('Enter the road distance in km')
  const distanceKm = manualDistance
  const tripDate = new Date()
  const weekStart = getWeekStart(tripDate)

  const tripId = makeId('TRIP')
  await appendRow('AgentTrips', {
    'Trip ID': tripId,
    'Agent ID': agent['Agent ID'],
    'Lead ID': (leadId || null) as any,   // empty text breaks the leads foreign key
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

  return ok({ tripId, distanceKm: distanceKm.toFixed(2) })
})

export const GET = apiHandler(async (req: NextRequest) => {
  const session = await requireFeature(req, ['agentTracking', 'verificationPlanning'], ['NGF AGENT', 'Admin', 'Staff'])
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

  // customer name and place for each trip's lead (only the leads that appear, not the whole table)
  const leadIds = Array.from(new Set(trips.map(t => t['Lead ID']).filter(Boolean)))
  const who: Record<string, { name: string; place: string }> = {}
  if (leadIds.length) {
    const rows = await queryTable('Leads', qb => qb.in('lead_id', leadIds))
    rows.forEach(r => { who[r['Lead ID']] = { name: r['Customer Name'] || '', place: r['Place'] || '' } })
  }

  // Real road kilometres of the last 8 weeks, from the finished stops of each day's route (what the allowance is paid on)
  const from = formatDateYmd(new Date(Date.now() - 56 * 86400_000))
  const routeDays = await agentRouteDays(targetAgentId, from)

  // The Trip Details page expects camelCase fields (it crashed on the raw column names)
  return ok({ ratePerKm: APP_CONFIG.TRIP_RATE_PER_KM, routeDays, trips: trips.map(t => ({
    tripId: t['Trip ID'], agentId: t['Agent ID'], leadId: t['Lead ID'] || '',
    customerName: who[t['Lead ID']]?.name || '', place: who[t['Lead ID']]?.place || '',
    startLatitude: Number(t['Start Latitude']), startLongitude: Number(t['Start Longitude']),
    endLatitude: Number(t['End Latitude']), endLongitude: Number(t['End Longitude']),
    distanceKm: Number(t['Distance Km']) || 0, tripDate: t['Trip Date'], weekStart: t['Week Start'], createdAt: t['Created At'],
  })) })
})
