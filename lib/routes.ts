// Verification Day Routes: staff fix a visit location + day per lead after phoning the customer, the system orders each agent's day
// by road distance, staff can drag it into a different order, and the agent follows the numbered list.
// Tables: leads (visit_* / route_* columns), route_plans, route_dist_cache (see migrations/2026-10-19-verification-routes.sql).
// All access control lives here and in app/api/routes/route.ts; the browser is never trusted.
import { getSupabase, readTable, invalidateCache } from './supabase-db'
import { notifyUser } from './notifications'
import { getTodayIST } from './dateUtils'
import {
  type LatLng, type Matrix, MAX_STOPS, WINDOWS, resolveMapsLink, parseLatLng, estimateLeg, pairKey, googleKey, googleMatrix,
  optimizeOrder, legsFor, type OrderInput,
} from './routeMath'
import type { Session } from '../types'
import { reportError } from './monitor'
import { normalizeIndianMobile } from './phone'

export const PERM_PLAN = 'verificationPlanning'
const PLANNER_ROLES = ['manager', 'assistant_manager', 'accountant']
const CALL_OUTCOMES = ['Reached', 'Not reachable', 'Call back later']
const STOP_STATUSES = ['On the way', 'Reached', 'Absent']
const DONE_LEAD_STATUSES = new Set(['Verification Submitted', 'Approved', 'Rejected', 'Converted'])

export class RouteError extends Error {}

const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
const permsOf = (raw: unknown): string[] => (Array.isArray(raw) ? (raw as string[]) : String(raw || '').split(',').map(s => s.trim()).filter(Boolean))

// ─── Settings (Dev page switches) ─────────────────────────────────────────────

export async function routeConfig(): Promise<{ enabled: boolean; windows: boolean; googleReady: boolean }> {
  const { data } = await getSupabase().from('settings').select('key, value').in('key', ['route:enabled', 'route:windows'])
  const val = (k: string) => (data || []).find(r => r.key === k)?.value
  return { enabled: (val('route:enabled') ?? '1') === '1', windows: (val('route:windows') ?? '1') === '1', googleReady: !!googleKey() }
}

async function requireEnabled() {
  const cfg = await routeConfig()
  if (!cfg.enabled) throw new RouteError('Route planning is switched off in Dev settings')
  return cfg
}

// ─── Access ───────────────────────────────────────────────────────────────────

export type RouteAccess = { isAdmin: boolean; isAgent: boolean; agentId: string; branchId: string; canPlan: boolean }

export async function getRouteAccess(session: Session): Promise<RouteAccess> {
  if (session.role === 'Admin') return { isAdmin: true, isAgent: false, agentId: '', branchId: '', canPlan: true }
  if (session.role === 'NGF AGENT') {
    const { data } = await getSupabase().from('agents').select('agent_id').eq('user_id', session.userId).maybeSingle()
    return { isAdmin: false, isAgent: true, agentId: data?.agent_id || '', branchId: '', canPlan: false }
  }
  if (session.role === 'Staff') {
    const { data } = await getSupabase().from('staff_access').select('branch_id, permissions').eq('user_id', session.userId).maybeSingle()
    const canPlan = permsOf(data?.permissions).includes(PERM_PLAN)
    return { isAdmin: false, isAgent: false, agentId: '', branchId: data?.branch_id || '', canPlan }
  }
  return { isAdmin: false, isAgent: false, agentId: '', branchId: '', canPlan: false }
}

function needPlanner(a: RouteAccess) {
  if (!a.canPlan) throw new Error('No permission')
}

// A planner with a branch only sees that branch. Admin (and a planner without a branch) sees every branch.
function branchAllowed(a: RouteAccess, branchId: string) {
  return a.isAdmin || !a.branchId || a.branchId === branchId
}

// ─── Branch helpers ───────────────────────────────────────────────────────────

// guarantor_id -> branch_id (first active link)
async function guarantorBranchMap(): Promise<Map<string, string>> {
  const { data, error } = await getSupabase().from('guarantor_branches').select('guarantor_id, branch_id, is_active')
  if (error) throw new Error(error.message)
  const m = new Map<string, string>()
  for (const r of data || []) if (r.is_active !== false && !m.has(r.guarantor_id)) m.set(r.guarantor_id, r.branch_id)
  return m
}

export async function branchOfGuarantor(guarantorId: string): Promise<string> {
  if (!guarantorId) return ''
  return (await guarantorBranchMap()).get(guarantorId) || ''
}

// Branch manager, assistant manager and accountant of a branch, plus anyone given the planning permission there.
export async function branchPlannerUserIds(branchId: string): Promise<string[]> {
  if (!branchId) return []
  const sb = getSupabase()
  const [roles, access] = await Promise.all([
    sb.from('branch_staff_roles').select('user_id, role_in_branch, is_active').eq('branch_id', branchId),
    sb.from('staff_access').select('user_id, permissions').eq('branch_id', branchId),
  ])
  const ids = new Set<string>()
  for (const r of roles.data || []) if (r.is_active !== false && PLANNER_ROLES.includes(r.role_in_branch)) ids.add(r.user_id)
  for (const a of access.data || []) if (permsOf(a.permissions).includes(PERM_PLAN)) ids.add(a.user_id)
  return Array.from(ids)
}

// Tells the branch team (and nobody outside it) that a lead needs a phone call and a visit plan.
export async function notifyBranchOfLead(guarantorId: string, title: string, message: string, leadId: string): Promise<void> {
  const branchId = await branchOfGuarantor(guarantorId)
  const ids = await branchPlannerUserIds(branchId)
  await Promise.all(ids.map(id => notifyUser(id, 'Staff', title, message, 'Lead', leadId)))
}

// ─── Lead rows ────────────────────────────────────────────────────────────────

const LEAD_COLS = 'lead_id, customer_name, phone, alt_phone, alt_phone_label, place, address, landmark, house_name, pinned_location, status, guarantor_id, assigned_agent_id, submitted_date, visit_lat, visit_lng, visit_place, visit_date, visit_window, visit_note, call_outcome, visit_status, route_seq, route_pin, leg_km, leg_min'

type LeadRow = {
  lead_id: string; customer_name: string; phone: string | null; alt_phone: string | null; alt_phone_label: string | null; place: string | null; address: string | null; landmark: string | null
  house_name: string | null; pinned_location: string | null; status: string; guarantor_id: string | null; assigned_agent_id: string | null
  submitted_date: string | null; visit_lat: number | string | null; visit_lng: number | string | null; visit_place: string | null
  visit_date: string | null; visit_window: string | null; visit_note: string | null; call_outcome: string | null; visit_status: string | null
  route_seq: number | null; route_pin: string | null; leg_km: number | string | null; leg_min: number | null
}

const num = (v: unknown) => (v == null || v === '' ? null : Number(v))

function isDone(l: LeadRow) {
  return DONE_LEAD_STATUSES.has(l.status) || l.visit_status === 'Absent'
}

function stopOf(l: LeadRow, guarantorName: string, branchId: string, branchName: string) {
  const lat = num(l.visit_lat), lng = num(l.visit_lng)
  const suggested = lat == null ? parseLatLng(l.pinned_location || '') : null
  return {
    leadId: l.lead_id, customerName: l.customer_name, phone: l.phone || '', altPhone: l.alt_phone || '', altPhoneLabel: l.alt_phone_label || '', place: l.place || '', address: l.address || '',
    landmark: l.landmark || '', houseName: l.house_name || '', status: l.status, submittedDate: l.submitted_date || '',
    guarantorName, branchId, branchName,
    agentId: l.assigned_agent_id || '',
    visitLat: lat, visitLng: lng, visitPlace: l.visit_place || '', visitDate: l.visit_date || '', visitWindow: l.visit_window || '',
    visitNote: l.visit_note || '', callOutcome: l.call_outcome || '', visitStatus: l.visit_status || '',
    seq: l.route_seq, pin: l.route_pin || '', legKm: num(l.leg_km), legMin: l.leg_min,
    done: isDone(l),
    hasLocation: lat != null && lng != null,
    guarantorPin: suggested ? { lat: suggested.lat, lng: suggested.lng } : null,
  }
}

async function loadLead(leadId: string): Promise<LeadRow> {
  const { data, error } = await getSupabase().from('leads').select(LEAD_COLS).eq('lead_id', leadId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new RouteError('Lead not found')
  return data as LeadRow
}

async function assertLeadAccess(a: RouteAccess, l: LeadRow) {
  if (a.isAdmin || !a.branchId) return
  const b = await branchOfGuarantor(l.guarantor_id || '')
  if (b !== a.branchId) throw new Error('No permission')
}

async function agentInScope(a: RouteAccess, agentId: string) {
  const { data } = await getSupabase().from('agents').select('agent_id, user_id, name, branch_id').eq('agent_id', agentId).maybeSingle()
  if (!data) throw new RouteError('Agent not found')
  if (!a.isAdmin && a.branchId && data.branch_id && data.branch_id !== a.branchId) throw new Error('No permission')
  return data
}

// ─── Start point ──────────────────────────────────────────────────────────────

export type Start = { lat: number; lng: number; source: string }

// Where the agent's day begins: the place they marked attendance from (usually home), else their last known live location.
async function startFor(agentId: string, date: string): Promise<Start | null> {
  const sb = getSupabase()
  const { data: att } = await sb.from('agent_attendance').select('latitude, longitude, date').eq('agent_id', agentId).lte('date', date)
    .not('latitude', 'is', null).order('date', { ascending: false }).limit(1)
  const a = att?.[0]
  if (a && num(a.latitude) != null && num(a.longitude) != null) {
    return { lat: Number(a.latitude), lng: Number(a.longitude), source: a.date === date ? 'Attendance today' : 'Last attendance' }
  }
  const { data: ag } = await sb.from('agents').select('latitude, longitude').eq('agent_id', agentId).maybeSingle()
  if (ag && num(ag.latitude) != null && num(ag.longitude) != null) return { lat: Number(ag.latitude), lng: Number(ag.longitude), source: 'Live location' }
  return null
}

// ─── Road distances ───────────────────────────────────────────────────────────

async function buildMatrix(points: LatLng[]): Promise<{ m: Matrix; source: string }> {
  const n = points.length
  const keys: string[] = []
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j) keys.push(pairKey(points[i], points[j]))
  const sb = getSupabase()
  const cached = new Map<string, { km: number; min: number }>()
  for (let c = 0; c < keys.length; c += 120) {
    const { data } = await sb.from('route_dist_cache').select('pair_key, km, minutes').in('pair_key', keys.slice(c, c + 120))
    for (const r of data || []) cached.set(r.pair_key, { km: Number(r.km), min: r.minutes })
  }
  const complete = keys.every(k => cached.has(k))
  const fromCache = (): Matrix => points.map((p, i) => points.map((q, j) => (i === j ? { km: 0, min: 0 } : cached.get(pairKey(p, q))!)))
  if (complete) return { m: fromCache(), source: 'Google (saved)' }

  if (googleKey()) {
    try {
      const m = await googleMatrix(points)
      const rows = [] as { pair_key: string; km: number; minutes: number; source: string }[]
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j) rows.push({ pair_key: pairKey(points[i], points[j]), km: m[i][j].km, minutes: m[i][j].min, source: 'google' })
      for (let c = 0; c < rows.length; c += 300) await sb.from('route_dist_cache').upsert(rows.slice(c, c + 300), { onConflict: 'pair_key' })
      return { m, source: 'Google' }
    } catch (e) {
      reportError('Google routes failed, using straight-line estimate', e)
    }
  }
  const m = points.map((p, i) => points.map((q, j) => (i === j ? { km: 0, min: 0 } : cached.get(pairKey(p, q)) || estimateLeg(p, q))))
  return { m, source: 'Estimate (straight line)' }
}

// ─── Re-ordering a day ────────────────────────────────────────────────────────

type Recalc = { optimize: boolean; order?: string[]; startOverride?: Start | null; manual?: boolean; actorId: string; useWindows: boolean }

// Recomputes one agent's day: orders the remaining stops (or applies the given order), refreshes the distance of each leg,
// and saves everything. Stops that are already done keep their place at the front.
export async function recalcRoute(agentId: string, date: string, o: Recalc) {
  const sb = getSupabase()
  const { data, error } = await sb.from('leads').select(LEAD_COLS).eq('assigned_agent_id', agentId).eq('visit_date', date)
  if (error) throw new Error(error.message)
  const leads = ((data || []) as LeadRow[]).filter(l => num(l.visit_lat) != null && num(l.visit_lng) != null)
  if (leads.length > MAX_STOPS) throw new RouteError(`At most ${MAX_STOPS} stops can be planned for one agent in a day`)

  const { data: planRow } = await sb.from('route_plans').select('manual').eq('agent_id', agentId).eq('plan_date', date).maybeSingle()
  const start = o.startOverride !== undefined ? o.startOverride : await startFor(agentId, date)

  const done = leads.filter(isDone).sort((a, b) => (a.route_seq ?? 1e9) - (b.route_seq ?? 1e9))
  const rest = leads.filter(l => !isDone(l))
  const pts = (l: LeadRow): LatLng => ({ lat: Number(l.visit_lat), lng: Number(l.visit_lng) })
  const all = [...done, ...rest]
  const points = all.map(pts)
  if (start) points.push({ lat: start.lat, lng: start.lng })
  if (!all.length) {
    await sb.from('route_plans').upsert({ agent_id: agentId, plan_date: date, start_lat: start?.lat ?? null, start_lng: start?.lng ?? null, start_source: start?.source ?? null,
      total_km: 0, total_min: 0, manual: false, updated_by: o.actorId, updated_at: new Date().toISOString() }, { onConflict: 'agent_id,plan_date' })
    return { km: 0, min: 0, source: '' }
  }
  const { m, source } = await buildMatrix(points)
  const n = all.length
  const stops: Matrix = m.slice(0, n).map(r => r.slice(0, n))
  const fromStart = start ? m[n].slice(0, n) : null
  const inp: OrderInput = { stops, fromStart, windows: all.map(l => l.visit_window), pins: all.map(l => l.route_pin) }

  let finalOrder: number[]
  const doneIdx = done.map((_, i) => i)
  const restIdx = rest.map((_, i) => done.length + i)
  if (o.order) {
    const byId = new Map(all.map((l, i) => [l.lead_id, i]))
    const given = o.order.map(id => byId.get(id)).filter((x): x is number => x != null)
    const left = restIdx.filter(i => !given.includes(i))
    finalOrder = [...doneIdx, ...given.filter(i => !doneIdx.includes(i)), ...left]
  } else if (o.optimize && restIdx.length) {
    // Optimise only the remaining stops, beginning from the last finished stop (or the start point)
    const sub = restIdx
    const lastDone = doneIdx.length ? doneIdx[doneIdx.length - 1] : -1
    const subInp: OrderInput = {
      stops: sub.map(i => sub.map(j => stops[i][j])),
      fromStart: lastDone >= 0 ? sub.map(j => stops[lastDone][j]) : fromStart ? sub.map(j => fromStart[j]) : null,
      windows: sub.map(i => all[i].visit_window), pins: sub.map(i => all[i].route_pin),
    }
    finalOrder = [...doneIdx, ...optimizeOrder(subInp, o.useWindows).map(k => sub[k])]
  } else {
    finalOrder = all.map((_, i) => i).sort((a, b) => (all[a].route_seq ?? 1e9) - (all[b].route_seq ?? 1e9))
  }

  const { legs, totalKm, totalMin } = legsFor(finalOrder, inp)
  await Promise.all(finalOrder.map((idx, k) => sb.from('leads').update({ route_seq: k + 1, leg_km: legs[k].km, leg_min: legs[k].min }).eq('lead_id', all[idx].lead_id)))
  const manual = o.manual !== undefined ? o.manual : (o.optimize ? false : !!planRow?.manual)
  await sb.from('route_plans').upsert({
    agent_id: agentId, plan_date: date, start_lat: start?.lat ?? null, start_lng: start?.lng ?? null, start_source: start?.source ?? null,
    total_km: totalKm, total_min: totalMin, distance_src: source, manual, updated_by: o.actorId, updated_at: new Date().toISOString(),
  }, { onConflict: 'agent_id,plan_date' })
  invalidateCache('Leads')
  return { km: totalKm, min: totalMin, source }
}

// ─── Planner board ────────────────────────────────────────────────────────────

export async function board(session: Session, q: { branchId?: string; date?: string }) {
  const a = await getRouteAccess(session)
  needPlanner(a)
  const cfg = await requireEnabled()
  const date = isDate(q.date) ? q.date : getTodayIST()
  const wantBranch = a.isAdmin ? (q.branchId || '') : (a.branchId || q.branchId || '')
  if (wantBranch && !branchAllowed(a, wantBranch)) throw new Error('No permission')

  const sb = getSupabase()
  const [leadsRes, branches, guarantors, agentsRes, gbMap, plansRes] = await Promise.all([
    sb.from('leads').select(LEAD_COLS).in('status', ['Pending', 'Under Review', 'Agent Assigned', 'Verification In Progress', 'Verification Submitted']),
    readTable('Branches'), readTable('Guarantors'),
    sb.from('agents').select('agent_id, user_id, name, phone, status, branch_id, latitude, longitude, location_updated_at'),
    guarantorBranchMap(),
    sb.from('route_plans').select('*').eq('plan_date', date),
  ])
  if (leadsRes.error) throw new Error(leadsRes.error.message)
  const bName = new Map(branches.map(b => [b['Branch ID'], b['Name']]))
  const gName = new Map(guarantors.map(g => [g['Guarantor ID'], g['Name']]))
  const toStop = (l: LeadRow) => {
    const b = gbMap.get(l.guarantor_id || '') || ''
    return stopOf(l, gName.get(l.guarantor_id || '') || '', b, bName.get(b) || '')
  }
  const inScope = (l: LeadRow) => !wantBranch || (gbMap.get(l.guarantor_id || '') || '') === wantBranch
  const leads = ((leadsRes.data || []) as LeadRow[]).filter(inScope)

  const toPlan = leads
    .filter(l => (l.status === 'Pending' || l.status === 'Under Review') ? !l.assigned_agent_id || !l.visit_date : (!l.visit_date && l.status !== 'Verification Submitted'))
    .sort((x, y) => String(x.submitted_date || '').localeCompare(String(y.submitted_date || '')))
    .map(toStop)

  const agents = (agentsRes.data || []).filter(g => (g.status || 'Active') === 'Active' && (!wantBranch || !g.branch_id || g.branch_id === wantBranch))
  const plans = new Map((plansRes.data || []).map(p => [p.agent_id, p]))
  const routes = agents.map(ag => {
    const stops = leads.filter(l => l.assigned_agent_id === ag.agent_id && l.visit_date === date)
      .sort((x, y) => (x.route_seq ?? 1e9) - (y.route_seq ?? 1e9)).map(toStop)
    const p = plans.get(ag.agent_id)
    return {
      agentId: ag.agent_id, name: ag.name, phone: ag.phone || '', branchId: ag.branch_id || '',
      plan: p ? { startLat: num(p.start_lat), startLng: num(p.start_lng), startSource: p.start_source || '', totalKm: num(p.total_km), totalMin: p.total_min, source: p.distance_src || '', manual: !!p.manual } : null,
      stops,
    }
  })

  return {
    date, branchId: wantBranch,
    branches: branches.filter(b => a.isAdmin || !a.branchId || b['Branch ID'] === a.branchId).map(b => ({ branchId: b['Branch ID'], name: b['Name'] })),
    config: cfg, maxStops: MAX_STOPS, windows: cfg.windows ? WINDOWS : [], toPlan, routes,
  }
}

// ─── Planner actions ──────────────────────────────────────────────────────────

export async function setVisit(session: Session, b: {
  leadId: string; mapsLink?: string; lat?: number; lng?: number; place?: string; altPhone?: string; altPhoneLabel?: string; date?: string; window?: string; note?: string; callOutcome?: string
}) {
  const a = await getRouteAccess(session); needPlanner(a); const cfg = await requireEnabled()
  const lead = await loadLead(b.leadId)
  await assertLeadAccess(a, lead)
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (b.mapsLink && b.mapsLink.trim()) {
    const p = await resolveMapsLink(b.mapsLink)
    if (!p) throw new RouteError('Could not read a location from that link. Open it in Google Maps, tap Share, and paste the link, or send "lat,lng".')
    patch.visit_lat = p.lat; patch.visit_lng = p.lng
  } else if (typeof b.lat === 'number' && typeof b.lng === 'number') {
    if (!Number.isFinite(b.lat) || !Number.isFinite(b.lng) || Math.abs(b.lat) > 90 || Math.abs(b.lng) > 180) throw new RouteError('Invalid location')
    patch.visit_lat = b.lat; patch.visit_lng = b.lng
  }
  if (b.altPhone !== undefined) {
    const t = String(b.altPhone).trim()
    if (!t) { patch.alt_phone = null; patch.alt_phone_label = null }
    else {
      const m = normalizeIndianMobile(t)
      if (!m) throw new RouteError('The second contact number must be a valid 10-digit mobile number')
      patch.alt_phone = m; patch.alt_phone_label = String(b.altPhoneLabel || 'Other').trim().slice(0, 30) || 'Other'
    }
  }
  if (b.place !== undefined) patch.visit_place = String(b.place).trim().slice(0, 120) || null
  if (b.note !== undefined) patch.visit_note = String(b.note).trim().slice(0, 500) || null
  if (b.date !== undefined) {
    if (b.date && !isDate(b.date)) throw new RouteError('Invalid date')
    patch.visit_date = b.date || null
  }
  if (b.window !== undefined) {
    if (b.window && !cfg.windows) throw new RouteError('Time windows are switched off in Dev settings')
    if (b.window && !WINDOWS.includes(b.window as typeof WINDOWS[number])) throw new RouteError('Invalid time window')
    patch.visit_window = b.window || null
  }
  if (b.callOutcome !== undefined) {
    if (b.callOutcome && !CALL_OUTCOMES.includes(b.callOutcome)) throw new RouteError('Invalid call outcome')
    patch.call_outcome = b.callOutcome || null
  }
  const { error } = await getSupabase().from('leads').update(patch).eq('lead_id', b.leadId)
  if (error) throw new Error(error.message)
  invalidateCache('Leads')

  // If this lead is already on a route, refresh that route
  const fresh = await loadLead(b.leadId)
  if (fresh.assigned_agent_id && fresh.visit_date) {
    await recalcRoute(fresh.assigned_agent_id, fresh.visit_date, { optimize: false, actorId: session.userId, useWindows: cfg.windows })
  }
  return { success: true }
}

// Puts a lead on an agent's day (moving it off any earlier agent/day) and re-orders that day.
export async function assign(session: Session, b: { leadId: string; agentId: string; date: string }) {
  const a = await getRouteAccess(session); needPlanner(a); const cfg = await requireEnabled()
  if (!isDate(b.date)) throw new RouteError('Pick the visit date')
  const lead = await loadLead(b.leadId)
  await assertLeadAccess(a, lead)
  if (num(lead.visit_lat) == null) throw new RouteError('Fix the visit location (after the phone call) before assigning')
  if (isDone(lead)) throw new RouteError('This verification is already finished')
  const agent = await agentInScope(a, b.agentId)

  const prevAgent = lead.assigned_agent_id, prevDate = lead.visit_date
  const { error } = await getSupabase().from('leads').update({
    assigned_agent_id: b.agentId, visit_date: b.date, status: lead.status === 'Verification In Progress' ? lead.status : 'Agent Assigned',
    route_seq: 9999, visit_status: null, updated_at: new Date().toISOString(),
  }).eq('lead_id', b.leadId)
  if (error) throw new Error(error.message)
  invalidateCache('Leads')

  // A day that staff ordered by hand keeps its order: the new stop simply goes to the end
  const { data: plan } = await getSupabase().from('route_plans').select('manual').eq('agent_id', b.agentId).eq('plan_date', b.date).maybeSingle()
  const res = await recalcRoute(b.agentId, b.date, { optimize: !plan?.manual, actorId: session.userId, useWindows: cfg.windows })
  if (prevAgent && prevDate && (prevAgent !== b.agentId || prevDate !== b.date)) {
    await recalcRoute(prevAgent, prevDate, { optimize: true, actorId: session.userId, useWindows: cfg.windows })
  }
  if (prevAgent !== b.agentId || prevDate !== b.date) {
    await notifyUser(agent.user_id, 'NGF AGENT', 'Visit scheduled', `${lead.customer_name} on ${b.date}. Open My Route to see your order.`, 'Lead', b.leadId)
  }
  return { success: true, ...res }
}

export async function optimize(session: Session, b: { agentId: string; date: string }) {
  const a = await getRouteAccess(session); needPlanner(a); const cfg = await requireEnabled()
  if (!isDate(b.date)) throw new RouteError('Invalid date')
  const agent = await agentInScope(a, b.agentId)
  const res = await recalcRoute(b.agentId, b.date, { optimize: true, actorId: session.userId, useWindows: cfg.windows })
  await notifyUser(agent.user_id, 'NGF AGENT', 'Route updated', `Your route for ${b.date} was re-ordered. Open My Route.`, 'Route', `${b.agentId}:${b.date}`)
  return { success: true, ...res }
}

export async function reorder(session: Session, b: { agentId: string; date: string; order: string[] }) {
  const a = await getRouteAccess(session); needPlanner(a); const cfg = await requireEnabled()
  if (!isDate(b.date) || !Array.isArray(b.order)) throw new RouteError('Invalid request')
  const agent = await agentInScope(a, b.agentId)
  const res = await recalcRoute(b.agentId, b.date, { optimize: false, order: b.order.map(String), manual: true, actorId: session.userId, useWindows: cfg.windows })
  await notifyUser(agent.user_id, 'NGF AGENT', 'Route updated', `Your route for ${b.date} was re-ordered. Open My Route.`, 'Route', `${b.agentId}:${b.date}`)
  return { success: true, ...res }
}

export async function pin(session: Session, b: { leadId: string; pin: string }) {
  const a = await getRouteAccess(session); needPlanner(a); const cfg = await requireEnabled()
  if (!['', 'first', 'last'].includes(b.pin || '')) throw new RouteError('Invalid pin')
  const lead = await loadLead(b.leadId)
  await assertLeadAccess(a, lead)
  if (!lead.assigned_agent_id || !lead.visit_date) throw new RouteError('Lead is not on a route')
  const sb = getSupabase()
  if (b.pin) await sb.from('leads').update({ route_pin: null }).eq('assigned_agent_id', lead.assigned_agent_id).eq('visit_date', lead.visit_date).eq('route_pin', b.pin)
  await sb.from('leads').update({ route_pin: b.pin || null }).eq('lead_id', b.leadId)
  const res = await recalcRoute(lead.assigned_agent_id, lead.visit_date, { optimize: true, actorId: session.userId, useWindows: cfg.windows })
  return { success: true, ...res }
}

export async function unplan(session: Session, b: { leadId: string }) {
  const a = await getRouteAccess(session); needPlanner(a); const cfg = await requireEnabled()
  const lead = await loadLead(b.leadId)
  await assertLeadAccess(a, lead)
  if (isDone(lead) || lead.status === 'Verification In Progress') throw new RouteError('Verification already started for this lead')
  const { error } = await getSupabase().from('leads').update({
    assigned_agent_id: null, visit_date: null, route_seq: null, route_pin: null, leg_km: null, leg_min: null, visit_status: null,
    status: lead.status === 'Agent Assigned' ? 'Under Review' : lead.status, updated_at: new Date().toISOString(),
  }).eq('lead_id', b.leadId)
  if (error) throw new Error(error.message)
  invalidateCache('Leads')
  if (lead.assigned_agent_id && lead.visit_date) await recalcRoute(lead.assigned_agent_id, lead.visit_date, { optimize: false, actorId: session.userId, useWindows: cfg.windows })
  return { success: true }
}

// ─── Agent side ───────────────────────────────────────────────────────────────

export async function mine(session: Session, q: { date?: string }) {
  const a = await getRouteAccess(session)
  if (!a.isAgent || !a.agentId) throw new Error('No permission')
  const cfg = await requireEnabled()
  const date = isDate(q.date) ? q.date : getTodayIST()
  const sb = getSupabase()
  const [leads, guarantors, plan] = await Promise.all([
    sb.from('leads').select(LEAD_COLS).eq('assigned_agent_id', a.agentId).eq('visit_date', date),
    readTable('Guarantors'),
    sb.from('route_plans').select('*').eq('agent_id', a.agentId).eq('plan_date', date).maybeSingle(),
  ])
  if (leads.error) throw new Error(leads.error.message)
  const gName = new Map(guarantors.map(g => [g['Guarantor ID'], g['Name']]))
  const stops = ((leads.data || []) as LeadRow[]).sort((x, y) => (x.route_seq ?? 1e9) - (y.route_seq ?? 1e9))
    .map(l => stopOf(l, gName.get(l.guarantor_id || '') || '', '', ''))
  const p = plan.data
  return {
    date, config: cfg, stops,
    plan: p ? { startLat: num(p.start_lat), startLng: num(p.start_lng), startSource: p.start_source || '', totalKm: num(p.total_km), totalMin: p.total_min, manual: !!p.manual } : null,
  }
}

export async function stopStatus(session: Session, b: { leadId: string; status: string }) {
  const a = await getRouteAccess(session)
  if (!a.isAgent || !a.agentId) throw new Error('No permission')
  if (!STOP_STATUSES.includes(b.status)) throw new RouteError('Invalid status')
  const lead = await loadLead(b.leadId)
  if (lead.assigned_agent_id !== a.agentId) throw new Error('No permission')
  const { error } = await getSupabase().from('leads').update({ visit_status: b.status, updated_at: new Date().toISOString() }).eq('lead_id', b.leadId)
  if (error) throw new Error(error.message)
  invalidateCache('Leads')
  if (b.status === 'Absent') {
    const ids = await branchPlannerUserIds(await branchOfGuarantor(lead.guarantor_id || ''))
    await Promise.all(ids.map(id => notifyUser(id, 'Staff', 'Customer not at home', `${lead.customer_name} was not found at the visit. Please call and reschedule.`, 'Lead', b.leadId)))
  }
  return { success: true }
}

// Agent taps "Re-plan from here": the remaining stops are re-ordered starting from where the agent is right now.
export async function replan(session: Session, b: { lat: number; lng: number; date?: string }) {
  const a = await getRouteAccess(session)
  if (!a.isAgent || !a.agentId) throw new Error('No permission')
  const cfg = await requireEnabled()
  const here = parseLatLng(`${b.lat},${b.lng}`)
  if (!here) throw new RouteError('Could not read your location')
  const date = isDate(b.date) ? b.date : getTodayIST()
  const res = await recalcRoute(a.agentId, date, { optimize: true, startOverride: { ...here, source: 'Live location' }, actorId: session.userId, useWindows: cfg.windows })
  return { success: true, ...res }
}

// Called when an agent marks attendance: if the day has a route that staff did not hand-order, re-order it from the attendance point.
export async function onAttendance(agentId: string, date: string, lat: number, lng: number, actorId: string) {
  const cfg = await routeConfig()
  if (!cfg.enabled) return
  const { data } = await getSupabase().from('leads').select('lead_id').eq('assigned_agent_id', agentId).eq('visit_date', date).limit(1)
  if (!data?.length) return
  const { data: plan } = await getSupabase().from('route_plans').select('manual').eq('agent_id', agentId).eq('plan_date', date).maybeSingle()
  await recalcRoute(agentId, date, { optimize: !plan?.manual, startOverride: { lat, lng, source: 'Attendance today' }, actorId, useWindows: cfg.windows })
}
