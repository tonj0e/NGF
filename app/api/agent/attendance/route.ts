import { NextRequest } from 'next/server'
import { apiHandler, requireRole, ok, err, getSession } from '@/lib/api'
import { requireFeature } from '@/lib/access'
import { readTable, appendRow, makeId, nowIso, formatDateYmd, invalidateCache, updateById } from '@/lib/supabase-db'
import { validateBody, attendanceSchema } from '@/lib/validation'
import { createAuditLogger, AUDIT_ACTIONS } from '@/lib/audit'
import { csrfProtection } from '@/lib/csrf'
import { onAttendance } from '@/lib/routes'
import { getTodayIST } from '@/lib/dateUtils'
import { getBranchAccess, canSeeBranch } from '@/lib/branchAccess'

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

  // Marking attendance starts live tracking; the phone keeps it going until punch-out
  try { await updateById('Agents', agent['Agent ID'], { 'Is Tracking': 'true', 'Updated At': nowIso() }) } catch (e) { console.error('Could not switch tracking on:', e instanceof Error ? e.message : e) }

  // Re-order today's visit route from where the agent is starting the day
  try {
    await onAttendance(agent['Agent ID'], getTodayIST(), Number(latitude), Number(longitude), session.userId)
  } catch (e) { console.error('Route re-order on attendance failed:', e instanceof Error ? e.message : e) }

  return ok({ success: true, message: 'Attendance marked successfully' })
})

export const GET = apiHandler(async (req: NextRequest) => {
  const session = await requireFeature(req, ['agentTracking', 'verificationPlanning'], ['NGF AGENT', 'Admin', 'Staff'])
  const { searchParams } = new URL(req.url)
  const agentId = searchParams.get('agentId') || ''
  const date = searchParams.get('date') || ''

  // The agent's own state for today: has attendance been marked, has the day been punched out
  if (searchParams.get('me') === '1' && session.role === 'NGF AGENT') {
    const me = (await readTable('Agents')).find(a => a['User ID'] === session.userId)
    if (!me) return err('Agent not found')
    const rec = (await readTable('AgentAttendance', { forceFresh: true })).find(r => r['Agent ID'] === me['Agent ID'] && r['Date'] === formatDateYmd(new Date()))
    return ok({ markedIn: !!rec, punchedOut: !!rec?.['Punched Out At'], punchedOutAt: rec?.['Punched Out At'] || null, markedAt: rec?.['Created At'] || null })
  }

  const agents = await readTable('Agents')
  const agent = agents.find(a => a['User ID'] === session.userId)
  if (!agent && session.role === 'NGF AGENT') return err('Agent not found')

  // An agent sees only their own history; Admin and Staff may ask for any agent
  const targetAgentId = session.role === 'NGF AGENT' ? agent?.['Agent ID'] : (agentId || agent?.['Agent ID'])
  if (!targetAgentId) return err('Agent ID required')
  if (session.role === 'Staff') {
    // Staff: only agents of their own branches
    const target = agents.find(a => a['Agent ID'] === targetAgentId)
    if (!canSeeBranch(await getBranchAccess(session), String(target?.['Branch ID'] || ''))) return err('This agent belongs to another branch', 403)
  }

  let records = await readTable('AgentAttendance')
  records = records.filter(r => r['Agent ID'] === targetAgentId)
  if (date) {
    records = records.filter(r => r['Date'] === date)
  }
  records.sort((a, b) => new Date(b['Created At']).getTime() - new Date(a['Created At']).getTime())

  return ok({ records })
})

// Punch out: ends the day. Live tracking stops and the phone stops sending its location.
export const PATCH = apiHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ['NGF AGENT'])  // bearer-token API: the token is never sent by the browser on its own
  const body = await req.json().catch(() => ({}))
  const lat = Number(body.latitude), lng = Number(body.longitude)
  const hasPos = Number.isFinite(lat) && Number.isFinite(lng) && body.latitude != null && body.longitude != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180

  const agent = (await readTable('Agents')).find(a => a['User ID'] === session.userId)
  if (!agent) return err('Agent not found')
  const rec = (await readTable('AgentAttendance', { forceFresh: true })).find(r => r['Agent ID'] === agent['Agent ID'] && r['Date'] === formatDateYmd(new Date()))
  if (!rec) return err('Mark attendance first')
  if (rec['Punched Out At']) return err('Already punched out for today')

  const attendanceId = rec['Attendance Id'] || rec['Attendance ID'] // read back as "Attendance Id": the column is not in the name map
  if (!attendanceId) return err('Could not find today\'s attendance record', 500)
  await updateById('AgentAttendance', attendanceId, {
    'Punched Out At': nowIso(),
    ...(hasPos ? { 'Out Latitude': String(lat), 'Out Longitude': String(lng) } : {}),
  })
  invalidateCache('AgentAttendance')
  await updateById('Agents', agent['Agent ID'], { 'Is Tracking': 'false', 'Updated At': nowIso() })
  await createAuditLogger(req, { userId: session.userId, username: session.username, role: session.role }).success(
    'ATTENDANCE_PUNCH_OUT', 'Attendance', attendanceId, { agentId: agent['Agent ID'], date: rec['Date'] }
  )
  return ok({ success: true, message: 'Punched out. Tracking stopped.' })
})
