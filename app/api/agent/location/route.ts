import { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getBranchAccess, canSeeBranch } from '@/lib/branchAccess'
import { apiHandler, requireRole, ok, err } from '@/lib/api'
import { requireFeature } from '@/lib/access'
import { readTable, getSupabase, formatDateYmd } from '@/lib/supabase-db'

// In-memory connections for SSE (in production, use Redis or similar)
const connections = new Map<string, Set<ReadableStreamDefaultController>>()

function addConnection(agentId: string, controller: ReadableStreamDefaultController) {
  if (!connections.has(agentId)) {
    connections.set(agentId, new Set())
  }
  connections.get(agentId)!.add(controller)
}

function removeConnection(agentId: string, controller: ReadableStreamDefaultController) {
  connections.get(agentId)?.delete(controller)
}

function broadcastToAgent(agentId: string, data: any) {
  const conns = connections.get(agentId)
  if (!conns) return
  const message = `data: ${JSON.stringify(data)}\n\n`
  conns.forEach(controller => {
    try {
      controller.enqueue(new TextEncoder().encode(message))
    } catch {
      conns.delete(controller)
    }
  })
}

// POST - Agent sends their current location (called every 10s per tracking agent, lib/agentTracker.ts)
// Kept to two database round trips: one read (agent + today's attendance together) and one write.
export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ['NGF AGENT'])

  const body = await req.json().catch(() => ({}))
  const latitude = Number(body.latitude)
  const longitude = Number(body.longitude)
  const accuracy = Number(body.accuracy || 0)
  const speed = Number(body.speed || 0)
  const heading = Number(body.heading || 0)
  const timestamp = body.timestamp ? new Date(body.timestamp).getTime() : Date.now()

  if (isNaN(latitude) || isNaN(longitude)) {
    return err('Valid latitude and longitude are required')
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return err('Invalid coordinates')
  }

  // The agent (by user id) with today's attendance row embedded (unique agent_id + date), in one query.
  // The date stays the same UTC date that mark-attendance, ?me=1 and punch-out use (app/api/agent/attendance/route.ts);
  // switching only this route to IST would make the phone loop between a 409 here and "still marked in" there.
  const sb = getSupabase()
  const { data: found, error: findErr } = await sb.from('agents')
    .select('agent_id, name, phone, agent_type, agent_attendance(punched_out_at)')
    .eq('user_id', session.userId)
    .eq('agent_attendance.date', formatDateYmd(new Date()))
    .order('agent_id', { ascending: true })
    .limit(1)
  if (findErr) throw new Error(`Failed to read Agents: ${findErr.message}`)
  const row = found?.[0]
  if (!row) return err('Agent not found')
  const agent = { 'Agent ID': row.agent_id, 'Name': row.name, 'Phone': row.phone, 'Agent Type': row.agent_type }

  // Tracking runs from marking attendance until punch-out
  const today = (row.agent_attendance as { punched_out_at: string | null }[] | null)?.[0]
  if (!today) return err('Mark attendance to start tracking', 409)
  if (today.punched_out_at) return err('You have punched out for today', 409)

  // Save the location with a direct update. It does not clear the shared readTable('Agents') cache: nothing reads live
  // location from that cache (GET below and lib/routes.ts read the agents table directly), so other pages keep their cached copy.
  const { error: upErr } = await sb.from('agents').update({
    latitude: String(latitude),
    longitude: String(longitude),
    location_accuracy: String(accuracy),
    location_updated_at: new Date(timestamp).toISOString(),
    is_tracking: 'true',
    updated_at: new Date().toISOString(),
  }).eq('agent_id', agent['Agent ID'])
  if (upErr) throw new Error(`Failed to update Agents: ${upErr.message}`)

  // Broadcast to admin SSE connections
  broadcastToAgent(agent['Agent ID'], {
    type: 'location_update',
    agentId: agent['Agent ID'],
    latitude,
    longitude,
    accuracy,
    speed,
    heading,
    timestamp,
    name: agent['Name'],
    phone: agent['Phone'],
    agentType: agent['Agent Type'],
  })

  return ok({ success: true, message: 'Location updated' })
})

// GET - Admin/Staff fetch all agent locations (initial load)
export const GET = apiHandler(async (req: NextRequest) => {
  const session = await requireFeature(req, ['agentTracking', 'verificationPlanning'])

  const url = new URL(req.url)
  const activeOnly = url.searchParams.get('activeOnly') !== 'false'
  const maxAgeMinutes = Number(url.searchParams.get('maxAge') || '5')

  // Active agents only, only the columns shown, with each agent's username embedded (never the whole Users table / password hashes).
  // Runs in parallel with the branch lookup: one database round trip instead of two sequential full-table reads.
  const [access, agentsRes] = await Promise.all([
    getBranchAccess(session),   // Admin: every branch; Staff: only the branches where they hold a role
    getSupabase().from('agents')
      .select('agent_id, user_id, name, phone, agent_type, status, branch_id, latitude, longitude, location_accuracy, location_updated_at, is_tracking, users(username)')
      .eq('status', 'Active')
      .order('agent_id', { ascending: true }),
  ])
  if (agentsRes.error) throw new Error(`Failed to read Agents: ${agentsRes.error.message}`)
  type AgentLoc = {
    agent_id: string; user_id: string; name: string; phone: string | null; agent_type: string | null; branch_id: string | null
    latitude: number | string | null; longitude: number | string | null; location_accuracy: number | string | null
    location_updated_at: string | null; is_tracking: boolean | string | null; users: { username?: string } | { username?: string }[] | null
  }
  const agents = (agentsRes.data || []) as unknown as AgentLoc[]

  const now = Date.now()
  const maxAgeMs = maxAgeMinutes * 60 * 1000

  const locations = agents
    .filter(a => canSeeBranch(access, String(a.branch_id || '')))
    .map(a => {
      const user = Array.isArray(a.users) ? a.users[0] : a.users
      const lat = a.latitude ? Number(a.latitude) : null
      const lng = a.longitude ? Number(a.longitude) : null
      const accuracy = a.location_accuracy ? Number(a.location_accuracy) : null
      const locationUpdatedAt = a.location_updated_at ? new Date(a.location_updated_at).getTime() : null
      const isTracking = String(a.is_tracking).toLowerCase() === 'true' // the column is a boolean, so compare as text
      const ageMs = locationUpdatedAt ? now - locationUpdatedAt : null
      const isRecent = locationUpdatedAt && ageMs !== null && ageMs <= maxAgeMs

      return {
        agentId: a.agent_id,
        name: a.name,
        phone: a.phone || '',
        agentType: a.agent_type || '',
        userId: a.user_id,
        username: user?.username || '',
        latitude: lat,
        longitude: lng,
        accuracy,
        locationUpdatedAt: a.location_updated_at || null,
        isTracking,
        isOnline: isRecent && isTracking,
        ageMinutes: ageMs !== null ? Math.round(ageMs / 60000) : null,
        speed: null,
        heading: null,
      }
    })
    .filter(loc => !activeOnly || loc.isOnline)

  return ok({ locations })
})

// SSE endpoint for real-time updates
export const PATCH = apiHandler(async (req: NextRequest) => {
  const session = await requireFeature(req, ['agentTracking', 'verificationPlanning'])
  const access = await getBranchAccess(session)

  const url = new URL(req.url)
  const agentId = url.searchParams.get('agentId') // optional: specific agent
  // Staff may only listen to agents of their own branches
  const allAgents = await readTable('Agents', { forceFresh: true })
  const visible = new Set(allAgents.filter(a => canSeeBranch(access, String(a['Branch ID'] || ''))).map(a => a['Agent ID']))
  if (agentId && !access.admin && !visible.has(agentId)) return err('This agent belongs to another branch', 403)
  const eventStream = new ReadableStream({
    start(controller) {
      // Send initial connection message
      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'connected' })}\n\n`))

      const agentIds = agentId ? [agentId] : Array.from(connections.keys()).filter(id => visible.has(id))
      agentIds.forEach(id => addConnection(id, controller))

      // Heartbeat every 30s
      const heartbeat = setInterval(() => {
        controller.enqueue(new TextEncoder().encode(': heartbeat\n\n'))
      }, 30000)

      req.signal.addEventListener('abort', () => {
        clearInterval(heartbeat)
        agentIds.forEach(id => removeConnection(id, controller))
      })
    },
  })

  return new NextResponse(eventStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
})