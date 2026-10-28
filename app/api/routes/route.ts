import { NextRequest } from 'next/server'
import { apiHandler, getSession, ok, err } from '@/lib/api'
import { createAuditLogger } from '@/lib/audit'
import { routeConfig, board, mine, setVisit, assign, reopen, optimize, reorder, pin, unplan, stopStatus, replan, RouteError } from '@/lib/routes'

// Verification Day Routes. Access is decided in lib/routes.ts from the session, never from the request body.
export const GET = apiHandler(async (req: NextRequest) => {
  const session = await getSession(req)
  const sp = new URL(req.url).searchParams
  const view = sp.get('view') || 'config'
  try {
    if (view === 'config') return ok(await routeConfig())
    if (view === 'board') return ok(await board(session, { branchId: sp.get('branchId') || '', date: sp.get('date') || '' }))
    if (view === 'mine') return ok(await mine(session, { date: sp.get('date') || '' }))
    return err('Unknown view')
  } catch (e) {
    if (e instanceof RouteError) return err(e.message)
    throw e
  }
})

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await getSession(req)
  const body = await req.json()
  const audit = createAuditLogger(req, session)
  try {
    switch (body.action) {
      case 'setVisit': {
        const r = await setVisit(session, body)
        await audit.log('VISIT_PLANNED', 'Lead', String(body.leadId), { date: body.date, place: body.place, callOutcome: body.callOutcome })
        return ok(r)
      }
      case 'assign': {
        const r = await assign(session, body)
        await audit.log('VISIT_ASSIGNED', 'Lead', String(body.leadId), { agentId: body.agentId, date: body.date })
        return ok(r)
      }
      case 'optimize': {
        const r = await optimize(session, body)
        await audit.log('ROUTE_OPTIMIZED', 'Route', `${body.agentId}:${body.date}`, { km: r.km, min: r.min })
        return ok(r)
      }
      case 'reorder': {
        const r = await reorder(session, body)
        await audit.log('ROUTE_REORDERED', 'Route', `${body.agentId}:${body.date}`, { order: body.order })
        return ok(r)
      }
      case 'pin': {
        const r = await pin(session, body)
        await audit.log('ROUTE_PINNED', 'Lead', String(body.leadId), { pin: body.pin })
        return ok(r)
      }
      case 'reopen': {
        const r = await reopen(session, body)
        await audit.log('VISIT_REOPENED', 'Lead', String(body.leadId), {})
        return ok(r)
      }
      case 'unplan': {
        const r = await unplan(session, body)
        await audit.log('VISIT_UNPLANNED', 'Lead', String(body.leadId), {})
        return ok(r)
      }
      case 'stopStatus': return ok(await stopStatus(session, body))
      case 'replan': {
        const r = await replan(session, body)
        await audit.log('ROUTE_REPLANNED', 'Route', session.userId, { km: r.km, min: r.min })
        return ok(r)
      }
      default: return err('Unknown action')
    }
  } catch (e) {
    if (e instanceof RouteError) return err(e.message)
    throw e
  }
})
