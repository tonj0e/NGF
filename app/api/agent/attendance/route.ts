import { NextRequest } from 'next/server'
import { apiHandler, requireRole, ok, err, getSession } from '@/lib/api'
import { readTable, appendRow, makeId, nowIso, formatDateYmd, invalidateCache, updateById } from '@/lib/supabase-db'
import { validateBody, attendanceSchema } from '@/lib/validation'
import { createAuditLogger, AUDIT_ACTIONS } from '@/lib/audit'
import { csrfProtection } from '@/lib/csrf'
import { onAttendance } from '@/lib/routes'
import { getTodayIST } from '@/lib/dateUtils'

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await getSession(req)

  const csrfError = csrfProtection(req, session.userId)
  if (csrfError) return csrfError

  const validation = await validateBody(attendanceSchema)(req)
  if (!validation.success) return validation.response
  const body = validation.data

  const sessionRole = await requireRole(req, ['NGF AGENT'])
  const { latitude, longitude, accuracy } = body

  const agents = await readTable('Agents')
  const agent = agents.find(a => a['User ID'] === session.userId)
  if (!agent) return err('Agent not found')

  const today = formatDateYmd(new Date())
  
  // Check if already marked attendance today
  const attendanceRecords = await readTable('AgentAttendance')
  const existing = attendanceRecords.find(
    a => a['Agent ID'] === agent['Agent ID'] && a['Date'] === today
  )

  if (existing) {
    return err('Attendance already marked for today')
  }

  const attendanceId = makeId('ATT')
  await appendRow('AgentAttendance', {
    'Attendance ID': attendanceId,
    'Agent ID': agent['Agent ID'],
    'Date': today,
    'Latitude': String(latitude),
    'Longitude': String(longitude),
    'Accuracy': String(accuracy || 0),
    'Status': 'Present',
    'Created At': nowIso(),
  })
  invalidateCache('AgentAttendance')

  await createAuditLogger(req, { userId: session.userId, username: session.username, role: session.role }).success(
    AUDIT_ACTIONS.ATTENDANCE_MARK,
    'Attendance',
    attendanceId,
    { agentId: agent['Agent ID'], latitude, longitude, date: today }
  )

  // Re-order today's visit route from where the agent is starting the day
  try {
    await onAttendance(agent['Agent ID'], getTodayIST(), Number(latitude), Number(longitude), session.userId)
  } catch (e) { console.error('Route re-order on attendance failed:', e instanceof Error ? e.message : e) }

  return ok({ success: true, message: 'Attendance marked successfully' })
})

export const GET = apiHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ['NGF AGENT', 'Admin', 'Staff'])
  const { searchParams } = new URL(req.url)
  const agentId = searchParams.get('agentId') || ''
  const date = searchParams.get('date') || ''

  const agents = await readTable('Agents')
  const agent = agents.find(a => a['User ID'] === session.userId)
  if (!agent && session.role === 'NGF AGENT') return err('Agent not found')

  // An agent sees only their own history; Admin and Staff may ask for any agent
  const targetAgentId = session.role === 'NGF AGENT' ? agent?.['Agent ID'] : (agentId || agent?.['Agent ID'])
  if (!targetAgentId) return err('Agent ID required')

  let records = await readTable('AgentAttendance')
  records = records.filter(r => r['Agent ID'] === targetAgentId)
  if (date) {
    records = records.filter(r => r['Date'] === date)
  }
  records.sort((a, b) => new Date(b['Created At']).getTime() - new Date(a['Created At']).getTime())

  return ok({ records })
})