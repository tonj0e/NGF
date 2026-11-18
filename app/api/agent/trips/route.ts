import { NextRequest } from 'next/server'
import { apiHandler, requireRole, ok, err, getSession } from '@/lib/api'
import { requireFeature } from '@/lib/access'
import { readTable, appendRow, makeId, nowIso, formatDateYmd, addDays, getNextSaturday, invalidateCache, getSupabase } from '@/lib/supabase-db'
import { fetchAllPages } from '@/lib/paginate'
import { agentIdOfUser } from '@/lib/agentOfUser'
import { validateBody, tripSchema } from '@/lib/validation'
import { createAuditLogger, AUDIT_ACTIONS } from '@/lib/audit'
import { csrfProtection } from '@/lib/csrf'
import { APP_CONFIG } from '@/lib/config'
import { agentRouteDays } from '@/lib/routes'

// GET reads only these columns of agent_trips, plus the trip lead's name and place (lead_id references leads)
const TRIP_COLS = 'trip_id, agent_id, lead_id, start_latitude, start_longitude, end_latitude, end_longitude, distance_km, trip_date, week_start, created_at, leads(customer_name, place)'
type TripRow = {
  trip_id: string; agent_id: string; lead_id: string | null; start_latitude: string | number; start_longitude: string | number
  end_latitude: string | number; end_longitude: string | number; distance_km: string | number | null; trip_date: string; week_start: string; created_at: string
  leads: { customer_name: string | null; place: string | null } | null
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

  // The caller's own agent id: one row, not the whole Agents table (Admin/Staff asking for a named agent do not need it)
  const ownAgentId = session.role === 'NGF AGENT' || !agentId ? await agentIdOfUser(session.userId) : ''
  if (!ownAgentId && session.role === 'NGF AGENT') return err('Agent not found')

  // An agent sees only their own trips; Admin and Staff may ask for any agent
  const targetAgentId = session.role === 'NGF AGENT' ? ownAgentId : (agentId || ownAgentId)
  if (!targetAgentId) return err('Agent ID required')

  // That agent's trips only (index idx_agent_trips_agent_id), with each trip lead's customer name and place joined in,
  // read at the same time as the route kilometres: one database wait instead of three.
  // Real road kilometres of the last 8 weeks, from the finished stops of each day's route (what the allowance is paid on)
  const from = formatDateYmd(new Date(Date.now() - 56 * 86400_000))
  const sb = getSupabase()
  const [rows, routeDays] = await Promise.all([
    fetchAllPages<TripRow>(async (lo, hi) => {
      const { data, error } = await sb.from('agent_trips').select(TRIP_COLS).eq('agent_id', targetAgentId).order('trip_id', { ascending: true }).range(lo, hi)
      if (error) throw new Error(`Failed to read AgentTrips: ${error.message}`)
      return (data || []) as unknown as TripRow[]
    }),
    agentRouteDays(targetAgentId, from),
  ])
  const trips = weekStart ? rows.filter(t => t.week_start === weekStart) : rows
  trips.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  // The Trip Details page expects camelCase fields (it crashed on the raw column names)
  return ok({ ratePerKm: APP_CONFIG.TRIP_RATE_PER_KM, routeDays, trips: trips.map(t => ({
    tripId: t.trip_id, agentId: t.agent_id, leadId: t.lead_id || '',
    customerName: (t.lead_id && t.leads?.customer_name) || '', place: (t.lead_id && t.leads?.place) || '',
    startLatitude: Number(t.start_latitude), startLongitude: Number(t.start_longitude),
    endLatitude: Number(t.end_latitude), endLongitude: Number(t.end_longitude),
    distanceKm: Number(t.distance_km) || 0, tripDate: t.trip_date, weekStart: t.week_start, createdAt: t.created_at,
  })) })
})
