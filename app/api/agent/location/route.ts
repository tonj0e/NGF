import { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getBranchAccess, canSeeBranch } from '@/lib/branchAccess'
import { apiHandler, requireRole, ok, err } from '@/lib/api'
import { readTable, updateById, getRowById, formatDateYmd } from '@/lib/supabase-db'

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

// POST - Agent sends their current location (called every 5-10s from agent)
export const POST = apiHandler(async (req: NextRequest) => {
  await requireRole(req, ['NGF AGENT'])
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

  // Find agent by userId
  const agents = await readTable('Agents', { forceFresh: true })
  const agent = agents.find(a => a['User ID'] === session.userId)
  if (!agent) return err('Agent not found')

  // Tracking runs from marking attendance until punch-out
  const today = (await readTable('AgentAttendance')).find(r => r['Agent ID'] === agent['Agent ID'] && r['Date'] === formatDateYmd(new Date()))
  if (!today) return err('Mark attendance to start tracking', 409)
  if (today['Punched Out At']) return err('You have punched out for today', 409)

  // Update agent with location
  await updateById('Agents', agent['Agent ID'], {
    'Latitude': String(latitude),
    'Longitude': String(longitude),
    'Location Accuracy': String(accuracy),
    'Location Updated At': new Date(timestamp).toISOString(),
    'Is Tracking': 'true',
    'Updated At': new Date().toISOString(),
  })

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
  const session = await requireRole(req, ['Admin', 'Staff'])
  const access = await getBranchAccess(session)   // Admin: every branch; Staff: only the branches where they hold a role

  const url = new URL(req.url)
  const activeOnly = url.searchParams.get('activeOnly') !== 'false'
  const maxAgeMinutes = Number(url.searchParams.get('maxAge') || '5')

  const agents = await readTable('Agents', { forceFresh: true })
  const users = await readTable('Users', { forceFresh: true })

  const now = Date.now()
  const maxAgeMs = maxAgeMinutes * 60 * 1000

  const locations = agents
    .filter(a => a['Status'] === 'Active' && canSeeBranch(access, String(a['Branch ID'] || '')))
    .map(a => {
      const user = users.find(u => u['User ID'] === a['User ID'])
      const lat = a['Latitude'] ? Number(a['Latitude']) : null
      const lng = a['Longitude'] ? Number(a['Longitude']) : null
      const accuracy = a['Location Accuracy'] ? Number(a['Location Accuracy']) : null
      const locationUpdatedAt = a['Location Updated At'] ? new Date(a['Location Updated At']).getTime() : null
      const isTracking = String(a['Is Tracking']).toLowerCase() === 'true' // the column is a boolean, so compare as text
      const ageMs = locationUpdatedAt ? now - locationUpdatedAt : null
      const isRecent = locationUpdatedAt && ageMs !== null && ageMs <= maxAgeMs

      return {
        agentId: a['Agent ID'],
        name: a['Name'],
        phone: a['Phone'] || '',
        agentType: a['Agent Type'] || '',
        userId: a['User ID'],
        username: user?.['Username'] || '',
        latitude: lat,
        longitude: lng,
        accuracy,
        locationUpdatedAt: a['Location Updated At'] || null,
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
  const session = await requireRole(req, ['Admin', 'Staff'])
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