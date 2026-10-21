// Payment matching: collection-day UPI/UTR marking, duplicate-UTR flagging, bank-statement cross-check.
// Tables: payment_groups, payment_lines, payment_events, bank_transactions (see migrations/2026-10-18-payment-matching.sql).
// All access control lives here and in app/api/payments/route.ts; the browser is never trusted.
import { getSupabase, readTable, makeId, invalidateCache } from './supabase-db'
import { payCodeFromLoanId } from './payCode'
import { getTodayIST, getThisSaturday } from './dateUtils'
import { saveFileSupabase } from './drive'
import type { Session } from '../types'

export const PERM_USE = 'upiPayments'
export const PERM_BANK = 'upiPaymentsBank'
export const PERM_OVERRIDE = 'upiPaymentsOverride'

export type Access = {
  isAdmin: boolean
  isGuarantor: boolean
  guarantorId: string
  canMark: boolean
  canBank: boolean
  canOverride: boolean
  canView: boolean
}

export class PaymentError extends Error {}

const MODES: Record<string, string> = { Cash: 'Cash', UPI: 'UPI', 'UPI / QR': 'UPI', Bank: 'Bank', 'Bank Transfer': 'Bank', Cheque: 'Cheque', Other: 'Other' }
const UTR_MODES = new Set(['UPI', 'Bank'])

export function normalizeUtr(raw: unknown): string {
  return String(raw ?? '').replace(/[\s-]+/g, '').toUpperCase()
}

export function validUtr(utr: string): boolean {
  return /^[A-Z0-9]{8,30}$/.test(utr)
}

function isDate(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
}

function permsOf(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[]
  return String(raw || '').split(',').map(s => s.trim()).filter(Boolean)
}

export async function getAccess(session: Session): Promise<Access> {
  if (session.role === 'Admin') {
    return { isAdmin: true, isGuarantor: false, guarantorId: '', canMark: true, canBank: true, canOverride: true, canView: true }
  }
  if (session.role === 'Guarantor') {
    const guarantors = await readTable('Guarantors', { forceFresh: true })
    const g = guarantors.find(x => x['User ID'] === session.userId)
    // A guarantor can mark UTR payments for their own customers only when an Admin has switched that on for them;
    // bank-statement access and duplicate-UTR override are never available to guarantors.
    const acc = await readTable('StaffAccess', { forceFresh: true })
    const mineAcc = acc.find(a => a['User ID'] === session.userId)
    const canMark = !!g && permsOf(mineAcc?.['Permissions']).includes(PERM_USE)
    return { isAdmin: false, isGuarantor: true, guarantorId: g?.['Guarantor ID'] || '', canMark, canBank: false, canOverride: false, canView: !!g }
  }
  const access = await readTable('StaffAccess', { forceFresh: true })
  const mine = access.find(a => a['User ID'] === session.userId)
  const perms = permsOf(mine?.['Permissions'])
  const canMark = perms.includes(PERM_USE)
  const canBank = perms.includes(PERM_BANK)
  const canOverride = perms.includes(PERM_OVERRIDE)
  return { isAdmin: false, isGuarantor: false, guarantorId: '', canMark, canBank, canOverride, canView: canMark || canBank || canOverride }
}

export function need(ok: boolean) {
  if (!ok) throw new Error('No permission')
}

// ─── Events ───────────────────────────────────────────────────────────────────

async function logEvent(groupId: string, event: string, session: Session, extra: { oldUtr?: string | null; newUtr?: string | null; reason?: string | null } = {}) {
  await getSupabase().from('payment_events').insert({
    group_id: groupId, event, old_utr: extra.oldUtr ?? null, new_utr: extra.newUtr ?? null,
    reason: extra.reason ?? null, actor_id: session.userId, actor_name: session.name,
  })
}

// ─── Reading groups ───────────────────────────────────────────────────────────

type GroupRow = {
  group_id: string; guarantor_id: string | null; saturday_date: string; mode: string; utr: string | null
  total_amount: number; status: string; flag_reason: string | null; screenshot_file_id: string | null
  notes: string | null; marked_by: string | null; marked_by_name: string | null; created_at: string; updated_at: string
}
type LineRow = {
  line_id: string; group_id: string; repayment_id: string; loan_id: string | null; customer_id: string | null
  guarantor_id: string | null; amount: number; week_no: number | null; due_date: string | null; applied: boolean
}

export type PublicLine = { lineId: string; customerId: string; name: string; payCode: string; amount: number; weekNo: number | null; dueDate: string | null; applied: boolean; hidden: boolean }
export type PublicGroup = {
  groupId: string; guarantorId: string; guarantorName: string; saturdayDate: string; mode: string; utr: string; total: number
  status: string; flagReason: string; screenshot: string; notes: string; markedByName: string; createdAt: string
  lines: PublicLine[]
  events: { event: string; oldUtr: string; newUtr: string; reason: string; actorName: string; createdAt: string }[]
  conflicts: PublicGroupBrief[]
  bank: { status: 'Matched' | 'Amount mismatch' | 'Not found' | 'Not checked'; bankAmount?: number; bankDate?: string }
}
export type PublicGroupBrief = { groupId: string; status: string; markedByName: string; createdAt: string; total: number; lines: PublicLine[] }

async function hydrate(groups: GroupRow[], viewer: Access): Promise<PublicGroup[]> {
  if (!groups.length) return []
  const sb = getSupabase()
  const ids = groups.map(g => g.group_id)
  const utrs = Array.from(new Set(groups.map(g => g.utr).filter(Boolean) as string[]))

  const [linesRes, eventsRes, bankRes, bankCount, guarantors] = await Promise.all([
    sb.from('payment_lines').select('*').in('group_id', ids),
    sb.from('payment_events').select('*').in('group_id', ids).order('created_at', { ascending: true }),
    utrs.length ? sb.from('bank_transactions').select('utr, amount, txn_date').in('utr', utrs) : Promise.resolve({ data: [], error: null }),
    sb.from('bank_transactions').select('id', { count: 'exact', head: true }),
    readTable('Guarantors'),
  ])
  if (linesRes.error) throw new Error(linesRes.error.message)
  const lines = (linesRes.data || []) as LineRow[]
  const events = eventsRes.data || []
  const bank = new Map<string, { amount: number; txn_date: string }>((bankRes.data || []).map((b: any) => [b.utr, b]))
  const bankAny = (bankCount.count || 0) > 0

  // Other groups that hold the same UTR (shown on flagged payments)
  const conflictByUtr = new Map<string, GroupRow[]>()
  const flaggedUtrs = Array.from(new Set(groups.filter(g => g.status === 'Flagged' && g.utr).map(g => g.utr as string)))
  if (flaggedUtrs.length) {
    const { data } = await sb.from('payment_groups').select('*').in('utr', flaggedUtrs)
    for (const r of (data || []) as GroupRow[]) {
      const arr = conflictByUtr.get(r.utr as string) || []
      arr.push(r); conflictByUtr.set(r.utr as string, arr)
    }
  }
  const conflictGroupIds = Array.from(new Set(Array.from(conflictByUtr.values()).flat().map(g => g.group_id))).filter(id => !ids.includes(id))
  let extraLines: LineRow[] = []
  if (conflictGroupIds.length) {
    const { data } = await sb.from('payment_lines').select('*').in('group_id', conflictGroupIds)
    extraLines = (data || []) as LineRow[]
  }

  const allLines = [...lines, ...extraLines]
  const customerIds = Array.from(new Set(allLines.map(l => l.customer_id).filter(Boolean) as string[]))
  const custMap = new Map<string, { name: string; guarantor_id: string | null }>()
  if (customerIds.length) {
    const { data } = await sb.from('customers').select('customer_id, name, guarantor_id').in('customer_id', customerIds)
    for (const c of data || []) custMap.set(c.customer_id, c as any)
  }
  const gName = (id: string | null) => guarantors.find(g => g['Guarantor ID'] === id)?.['Name'] || ''

  const toLine = (l: LineRow): PublicLine => {
    const c = l.customer_id ? custMap.get(l.customer_id) : undefined
    // A guarantor may only see their own customers; others are masked
    const hidden = viewer.isGuarantor && (l.guarantor_id || c?.guarantor_id) !== viewer.guarantorId
    return {
      lineId: l.line_id, customerId: hidden ? '' : (l.customer_id || ''), name: hidden ? "Another guarantor's customer" : (c?.name || ''),
      payCode: hidden ? '' : payCodeFromLoanId(l.loan_id), amount: Number(l.amount), weekNo: l.week_no, dueDate: l.due_date, applied: l.applied, hidden,
    }
  }
  const brief = (g: GroupRow): PublicGroupBrief => ({
    groupId: g.group_id, status: g.status, markedByName: g.marked_by_name || '', createdAt: g.created_at, total: Number(g.total_amount),
    lines: allLines.filter(l => l.group_id === g.group_id).map(toLine),
  })

  return groups.map(g => {
    let bankInfo: PublicGroup['bank'] = { status: 'Not checked' }
    if (g.utr && UTR_MODES.has(g.mode)) {
      const b = bank.get(g.utr)
      if (b) bankInfo = Number(b.amount) === Number(g.total_amount) ? { status: 'Matched', bankAmount: Number(b.amount), bankDate: b.txn_date } : { status: 'Amount mismatch', bankAmount: Number(b.amount), bankDate: b.txn_date }
      else if (bankAny) bankInfo = { status: 'Not found' }
    }
    return {
      groupId: g.group_id, guarantorId: g.guarantor_id || '', guarantorName: gName(g.guarantor_id), saturdayDate: g.saturday_date, mode: g.mode,
      utr: g.utr || '', total: Number(g.total_amount), status: g.status, flagReason: g.flag_reason || '', screenshot: g.screenshot_file_id || '',
      notes: g.notes || '', markedByName: g.marked_by_name || '', createdAt: g.created_at,
      lines: lines.filter(l => l.group_id === g.group_id).map(toLine),
      events: events.filter((e: any) => e.group_id === g.group_id).map((e: any) => ({
        event: e.event, oldUtr: e.old_utr || '', newUtr: e.new_utr || '', reason: e.reason || '', actorName: e.actor_name || '', createdAt: e.created_at,
      })),
      conflicts: g.status === 'Flagged' && g.utr ? (conflictByUtr.get(g.utr) || []).filter(o => o.group_id !== g.group_id).map(brief) : [],
      bank: bankInfo,
    }
  })
}

async function getGroupRow(groupId: string): Promise<GroupRow> {
  const { data } = await getSupabase().from('payment_groups').select('*').eq('group_id', groupId).maybeSingle()
  if (!data) throw new PaymentError('Payment not found')
  return data as GroupRow
}

// ─── Collect sheet ────────────────────────────────────────────────────────────

export async function listGuarantors(): Promise<{ guarantorId: string; name: string; code: string }[]> {
  const guarantors = await readTable('Guarantors', { forceFresh: true })
  return guarantors.filter(g => g['Status'] !== 'Inactive').map(g => ({ guarantorId: g['Guarantor ID'], name: g['Name'], code: g['Code'] || '' }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function collectSheet(guarantorId: string, date: string) {
  if (!guarantorId) throw new PaymentError('Choose a guarantor')
  if (!isDate(date)) throw new PaymentError('Invalid date')
  const sb = getSupabase()
  const { data: loans } = await sb.from('loans').select('loan_id, customer_id').eq('guarantor_id', guarantorId)
  const loanIds = (loans || []).map(l => l.loan_id)
  if (!loanIds.length) return { date, rows: [], expected: 0 }
  const [{ data: reps }, { data: custs }] = await Promise.all([
    sb.from('repayments').select('repayment_id, loan_id, customer_id, due_date, week_no, amount, status, paid_date, payment_mode').in('loan_id', loanIds).lte('due_date', date),
    sb.from('customers').select('customer_id, name, phone').eq('guarantor_id', guarantorId),
  ])
  const custMap = new Map((custs || []).map(c => [c.customer_id, c]))
  const rows = (reps || []).filter(r => r.due_date === date || r.status !== 'Paid')
  const repIds = rows.map(r => r.repayment_id)
  const lineMap = new Map<string, LineRow>()
  const groupMap = new Map<string, GroupRow>()
  if (repIds.length) {
    const { data: ls } = await sb.from('payment_lines').select('*').in('repayment_id', repIds)
    for (const l of (ls || []) as LineRow[]) lineMap.set(l.repayment_id, l)
    const gids = Array.from(new Set(Array.from(lineMap.values()).map(l => l.group_id)))
    if (gids.length) {
      const { data: gs } = await sb.from('payment_groups').select('*').in('group_id', gids)
      for (const g of (gs || []) as GroupRow[]) groupMap.set(g.group_id, g)
    }
  }
  const out = rows.map(r => {
    const c = custMap.get(r.customer_id)
    const line = lineMap.get(r.repayment_id)
    const g = line ? groupMap.get(line.group_id) : undefined
    return {
      repaymentId: r.repayment_id, customerId: r.customer_id, name: c?.name || '', phone: c?.phone || '', payCode: payCodeFromLoanId(r.loan_id),
      weekNo: r.week_no, dueDate: r.due_date, amount: Number(r.amount), status: r.status as string, overdue: r.due_date < date && r.status !== 'Paid',
      payment: g ? { groupId: g.group_id, status: g.status, mode: g.mode, utr: g.utr || '', total: Number(g.total_amount) } : null,
    }
  }).sort((a, b) => a.name.localeCompare(b.name))
  const expected = out.filter(r => r.dueDate === date).reduce((s, r) => s + r.amount, 0)
  return { date, rows: out, expected }
}

// ─── Duplicate lookup ────────────────────────────────────────────────────────

async function findHolders(utr: string, excludeGroupId?: string): Promise<GroupRow[]> {
  let q = getSupabase().from('payment_groups').select('*').eq('utr', utr).in('status', ['Verified', 'Overridden'])
  if (excludeGroupId) q = q.neq('group_id', excludeGroupId)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data || []) as GroupRow[]
}

export async function lookupUtr(utrRaw: string, viewer: Access) {
  const utr = normalizeUtr(utrRaw)
  if (!validUtr(utr)) return { utr, valid: false, groups: [] as PublicGroup[] }
  const { data } = await getSupabase().from('payment_groups').select('*').eq('utr', utr).order('created_at')
  return { utr, valid: true, groups: await hydrate((data || []) as GroupRow[], viewer) }
}

// ─── Applying a payment to repayments ────────────────────────────────────────

async function applyGroup(group: GroupRow, session: Session) {
  const sb = getSupabase()
  const { data: lines } = await sb.from('payment_lines').select('*').eq('group_id', group.group_id).eq('applied', false)
  const today = getTodayIST()
  const note = [group.utr ? `UTR ${group.utr}` : '', group.notes || ''].filter(Boolean).join(' | ')
  const loanIds = new Set<string>()
  for (const l of (lines || []) as LineRow[]) {
    const { data: upd, error } = await sb.from('repayments').update({
      status: 'Paid', paid_date: today, collection_agent_id: session.userId, payment_mode: group.mode,
      proof_file_id: group.screenshot_file_id || null, notes: note, updated_at: new Date().toISOString(),
    }).eq('repayment_id', l.repayment_id).neq('status', 'Paid').select('repayment_id')
    if (error) throw new Error(error.message)
    if (upd && upd.length) {
      await sb.from('collections').insert({
        collection_id: makeId('COL'), repayment_id: l.repayment_id, loan_id: l.loan_id, customer_id: l.customer_id,
        agent_id: session.userId, amount: l.amount, payment_date: today, proof_file_id: group.screenshot_file_id || null,
        payment_mode: group.mode, notes: note,
      })
    }
    await sb.from('payment_lines').update({ applied: true }).eq('line_id', l.line_id)
    if (l.loan_id) loanIds.add(l.loan_id)
  }
  for (const loanId of loanIds) {
    const { data: reps } = await sb.from('repayments').select('status').eq('loan_id', loanId)
    if (reps && reps.length && reps.every(r => r.status === 'Paid')) {
      await sb.from('loans').update({ status: 'Completed', updated_at: new Date().toISOString() }).eq('loan_id', loanId)
    }
  }
  for (const t of ['Repayments', 'Collections', 'Loans'] as const) invalidateCache(t)
}

// ─── Mark a payment ──────────────────────────────────────────────────────────

export type MarkInput = {
  guarantorId: string; date?: string; mode: string; utr?: string
  repaymentIds: string[]; notes?: string
  screenshot?: { fileName: string; mimeType: string; base64Data: string } | null
}

export async function markPayment(session: Session, access: Access, input: MarkInput) {
  need(access.canMark)
  const mode = MODES[input.mode]
  if (!mode) throw new PaymentError('Choose a payment mode')
  const date = isDate(input.date) ? input.date : getThisSaturday()
  const needsUtr = UTR_MODES.has(mode)
  const utr = needsUtr ? normalizeUtr(input.utr) : ''
  if (needsUtr && !utr) throw new PaymentError('Enter the UTR / transaction ID')
  if (needsUtr && !validUtr(utr)) throw new PaymentError('UTR must be 8–30 letters or digits')
  const repaymentIds = Array.from(new Set((input.repaymentIds || []).filter(Boolean)))
  if (!repaymentIds.length) throw new PaymentError('Select at least one customer')
  if (repaymentIds.length > 25) throw new PaymentError('Too many customers in one payment')
  if (access.isGuarantor) input = { ...input, guarantorId: access.guarantorId }   // a guarantor can only ever act for themselves
  if (!input.guarantorId) throw new PaymentError('Choose a guarantor')

  const sb = getSupabase()
  const { data: reps } = await sb.from('repayments').select('repayment_id, loan_id, customer_id, due_date, week_no, amount, status').in('repayment_id', repaymentIds)
  if (!reps || reps.length !== repaymentIds.length) throw new PaymentError('A selected repayment was not found')
  const { data: loans } = await sb.from('loans').select('loan_id, guarantor_id').in('loan_id', reps.map(r => r.loan_id))
  const loanG = new Map((loans || []).map(l => [l.loan_id, l.guarantor_id]))
  for (const r of reps) {
    if (loanG.get(r.loan_id) !== input.guarantorId) throw new PaymentError('Every customer must belong to the chosen guarantor')
    if (r.status === 'Paid') throw new PaymentError('A selected week is already paid')
  }
  const { data: existing } = await sb.from('payment_lines').select('repayment_id').in('repayment_id', repaymentIds)
  if (existing && existing.length) throw new PaymentError('A selected customer already has a payment recorded for that week. Edit or discard it first.')

  let screenshot = ''
  if (input.screenshot?.base64Data) {
    const ts = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)
    const safe = String(input.screenshot.fileName || 'proof').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80)
    screenshot = await saveFileSupabase('payment-proofs', `utr/${input.guarantorId}/${ts}_${safe}`, input.screenshot.mimeType || 'image/jpeg', input.screenshot.base64Data)
  }

  const total = reps.reduce((s, r) => s + Number(r.amount), 0)
  const groupId = makeId('PAY')
  const holders = utr ? await findHolders(utr) : []

  const insertGroup = async (status: 'Verified' | 'Flagged', flagReason: string | null) => {
    return sb.from('payment_groups').insert({
      group_id: groupId, guarantor_id: input.guarantorId, saturday_date: date, mode, utr: utr || null, total_amount: total,
      status, flag_reason: flagReason, screenshot_file_id: screenshot || null, notes: (input.notes || '').slice(0, 500) || null,
      marked_by: session.userId, marked_by_name: session.name,
    })
  }
  let status: 'Verified' | 'Flagged' = holders.length ? 'Flagged' : 'Verified'
  let reason = holders.length ? `UTR already used by payment ${holders[0].group_id}` : null
  let { error } = await insertGroup(status, reason)
  if (error && error.code === '23505' && status === 'Verified') {
    // Another request took the UTR between the check and the insert
    status = 'Flagged'; reason = 'UTR already used by another payment'
    ;({ error } = await insertGroup(status, reason))
  }
  if (error) throw new PaymentError(error.message)

  const lineRows = reps.map(r => ({
    line_id: makeId('PLN'), group_id: groupId, repayment_id: r.repayment_id, loan_id: r.loan_id, customer_id: r.customer_id,
    guarantor_id: input.guarantorId, amount: r.amount, week_no: r.week_no, due_date: r.due_date, applied: false,
  }))
  const { error: lineErr } = await sb.from('payment_lines').insert(lineRows)
  if (lineErr) {
    await sb.from('payment_groups').delete().eq('group_id', groupId)
    throw new PaymentError(lineErr.code === '23505' ? 'A selected customer already has a payment recorded for that week.' : lineErr.message)
  }

  const group = await getGroupRow(groupId)
  await logEvent(groupId, status === 'Flagged' ? 'flagged' : 'created', session, { newUtr: utr || null, reason })
  if (status === 'Verified') await applyGroup(group, session)
  const [pub] = await hydrate([await getGroupRow(groupId)], access)
  return { flagged: status === 'Flagged', group: pub }
}

// ─── Online (gateway) payment ────────────────────────────────────────────────
// Called by the gateway webhook after the bank confirms money. Same records as a staff-marked UPI payment:
// payment_groups (Verified, UTR = the gateway reference) + payment_lines, then repayments Paid + collections + loan completion.
export async function recordGatewayPayment(input: { repaymentIds: string[]; mode: string; utr: string; guarantorId: string | null; createdBy: string; createdByName: string; notes: string }) {
  const utr = normalizeUtr(input.utr)
  if (!validUtr(utr)) throw new PaymentError('The gateway reference is not a valid transaction id')
  const mode = MODES[input.mode] || 'Other'
  const sb = getSupabase()
  const ids = Array.from(new Set(input.repaymentIds))
  const { data: dup } = await sb.from('payment_groups').select('group_id').eq('utr', utr).eq('status', 'Verified').maybeSingle()
  if (dup) return { groupId: dup.group_id as string, duplicate: true }
  const { data: reps } = await sb.from('repayments').select('repayment_id, loan_id, customer_id, due_date, week_no, amount, status').in('repayment_id', ids)
  if (!reps || reps.length !== ids.length) throw new PaymentError('A repayment on this link no longer exists')
  if (reps.some(r => r.status === 'Paid')) throw new PaymentError('A week on this link was already paid another way')
  const { data: existing } = await sb.from('payment_lines').select('repayment_id').in('repayment_id', ids)
  if (existing && existing.length) throw new PaymentError('A week on this link already has a payment recorded')
  const total = reps.reduce((a, r) => a + Number(r.amount), 0)
  const groupId = makeId('PAY')
  const { error } = await sb.from('payment_groups').insert({
    group_id: groupId, guarantor_id: input.guarantorId, saturday_date: getThisSaturday(), mode, utr, total_amount: total,
    status: 'Verified', notes: input.notes.slice(0, 500), marked_by: input.createdBy, marked_by_name: input.createdByName,
  })
  if (error) throw new PaymentError(error.message)
  const { error: lineErr } = await sb.from('payment_lines').insert(reps.map(r => ({
    line_id: makeId('PLN'), group_id: groupId, repayment_id: r.repayment_id, loan_id: r.loan_id, customer_id: r.customer_id,
    guarantor_id: input.guarantorId, amount: r.amount, week_no: r.week_no, due_date: r.due_date, applied: false,
  })))
  if (lineErr) { await sb.from('payment_groups').delete().eq('group_id', groupId); throw new PaymentError(lineErr.message) }
  const actor = { userId: input.createdBy, name: input.createdByName } as Session
  await logEvent(groupId, 'created', actor, { newUtr: utr, reason: 'Paid online through a payment link' })
  await applyGroup(await getGroupRow(groupId), actor)
  return { groupId, duplicate: false }
}

// ─── Edit UTR / override / discard ───────────────────────────────────────────

export async function editUtr(session: Session, access: Access, groupId: string, utrRaw: string) {
  need(access.canMark)
  const group = await getGroupRow(groupId)
  if (access.isGuarantor && group.guarantor_id !== access.guarantorId) throw new Error('No permission')
  if (!group.utr && !UTR_MODES.has(group.mode)) throw new PaymentError('This payment has no UTR')
  const ownFlagged = group.status === 'Flagged'
  const mine = group.marked_by === session.userId
  if (!(access.canOverride || ownFlagged || mine)) throw new Error('No permission')
  const utr = normalizeUtr(utrRaw)
  if (!validUtr(utr)) throw new PaymentError('UTR must be 8–30 letters or digits')
  if (utr === group.utr) throw new PaymentError('That is already the UTR on this payment')

  const holders = await findHolders(utr, groupId)
  if (holders.length) {
    const other = (await hydrate(holders, access))[0]
    throw new PaymentError(`That UTR is already used by another payment (${other.lines.map(l => l.name).join(', ')}). Check the UTR and try again.`)
  }

  const sb = getSupabase()
  const wasFlagged = group.status === 'Flagged'
  const { error } = await sb.from('payment_groups').update({
    utr, status: wasFlagged ? 'Verified' : group.status, flag_reason: wasFlagged ? null : group.flag_reason, updated_at: new Date().toISOString(),
  }).eq('group_id', groupId)
  if (error) throw new PaymentError(error.code === '23505' ? 'That UTR is already used by another payment' : error.message)
  await logEvent(groupId, wasFlagged ? 'utr-corrected' : 'utr-edited', session, { oldUtr: group.utr, newUtr: utr })
  if (wasFlagged) await applyGroup(await getGroupRow(groupId), session)
  else {
    // Keep the notes on already-paid repayments in step with the corrected UTR
    await sb.from('repayments').update({ notes: `UTR ${utr}` }).in('repayment_id', (await sb.from('payment_lines').select('repayment_id').eq('group_id', groupId)).data?.map(l => l.repayment_id) || [])
  }
  await promoteFlaggedFor(group.utr, session)
  return { group: (await hydrate([await getGroupRow(groupId)], access))[0] }
}

// When a verified payment gives up a UTR, the oldest flagged payment waiting on it can be verified.
async function promoteFlaggedFor(oldUtr: string | null, session: Session) {
  if (!oldUtr) return
  const sb = getSupabase()
  if ((await findHolders(oldUtr)).length) return
  const { data } = await sb.from('payment_groups').select('*').eq('utr', oldUtr).eq('status', 'Flagged').order('created_at').limit(1)
  const next = (data || [])[0] as GroupRow | undefined
  if (!next) return
  const { error } = await sb.from('payment_groups').update({ status: 'Verified', flag_reason: null, updated_at: new Date().toISOString() }).eq('group_id', next.group_id)
  if (error) return
  await logEvent(next.group_id, 'verified', session, { newUtr: oldUtr, reason: 'UTR freed by a correction on another payment' })
  await applyGroup(await getGroupRow(next.group_id), session)
}

export async function overrideGroup(session: Session, access: Access, groupId: string, reason: string) {
  need(access.canOverride)
  const why = String(reason || '').trim()
  if (why.length < 5) throw new PaymentError('Write the reason for the override (at least 5 characters)')
  const group = await getGroupRow(groupId)
  if (group.status !== 'Flagged') throw new PaymentError('Only flagged payments can be overridden')
  const sb = getSupabase()
  const { error } = await sb.from('payment_groups').update({ status: 'Overridden', flag_reason: why.slice(0, 300), updated_at: new Date().toISOString() }).eq('group_id', groupId)
  if (error) throw new PaymentError(error.message)
  await logEvent(groupId, 'overridden', session, { newUtr: group.utr, reason: why.slice(0, 300) })
  await applyGroup(await getGroupRow(groupId), session)
  return { group: (await hydrate([await getGroupRow(groupId)], access))[0] }
}

export async function discardGroup(session: Session, access: Access, groupId: string) {
  need(access.canMark)
  const group = await getGroupRow(groupId)
  if (access.isGuarantor && group.guarantor_id !== access.guarantorId) throw new Error('No permission')
  if (group.status !== 'Flagged') throw new PaymentError('Only flagged payments can be discarded')
  if (!(access.canOverride || group.marked_by === session.userId)) throw new Error('No permission')
  await logEvent(groupId, 'discarded', session, { oldUtr: group.utr, reason: `Discarded flagged payment of ${group.total_amount}` })
  const { error } = await getSupabase().from('payment_groups').delete().eq('group_id', groupId)
  if (error) throw new PaymentError(error.message)
  return { success: true }
}

// ─── Records ─────────────────────────────────────────────────────────────────

export async function records(access: Access, guarantorId: string, date: string) {
  need(access.canView)
  const scopeG = access.isGuarantor ? access.guarantorId : guarantorId
  if (access.isGuarantor && !scopeG) throw new Error('No permission')
  if (!isDate(date)) throw new PaymentError('Invalid date')
  const sb = getSupabase()
  let q = sb.from('payment_groups').select('*').eq('saturday_date', date).order('created_at', { ascending: false })
  if (scopeG) q = q.eq('guarantor_id', scopeG)
  const { data } = await q
  const groups = await hydrate((data || []) as GroupRow[], access)

  let flagged: PublicGroup[] = []
  if (!access.isGuarantor || scopeG) {
    let fq = sb.from('payment_groups').select('*').eq('status', 'Flagged').order('created_at', { ascending: false }).limit(100)
    if (scopeG) fq = fq.eq('guarantor_id', scopeG)
    const { data: fd } = await fq
    flagged = await hydrate((fd || []) as GroupRow[], access)
  }
  const live = groups.filter(g => g.status !== 'Flagged')
  const sum = (m: (g: PublicGroup) => boolean) => live.filter(m).reduce((s, g) => s + g.total, 0)
  return {
    date, groups, flagged,
    summary: {
      upi: sum(g => g.mode === 'UPI' || g.mode === 'Bank'), cash: sum(g => g.mode === 'Cash'), other: sum(g => !['UPI', 'Bank', 'Cash'].includes(g.mode)),
      payments: live.length, flaggedCount: flagged.length,
    },
  }
}

// ─── Bank statement ──────────────────────────────────────────────────────────

export type BankRowInput = { utr: string; date?: string; amount: number; payer?: string; remark?: string }

export async function uploadBank(session: Session, access: Access, rows: BankRowInput[], fileName: string) {
  need(access.canBank)
  if (!Array.isArray(rows) || !rows.length) throw new PaymentError('No rows found in the statement')
  if (rows.length > 5000) throw new PaymentError('Upload at most 5,000 rows at a time')
  const clean: any[] = []
  const seen = new Set<string>()
  let skipped = 0
  for (const r of rows) {
    const utr = normalizeUtr(r.utr)
    const amount = Number(r.amount)
    if (!validUtr(utr) || !Number.isFinite(amount) || amount <= 0 || seen.has(utr)) { skipped++; continue }
    seen.add(utr)
    clean.push({
      utr, amount, txn_date: isDate(r.date) ? r.date : null, payer: String(r.payer || '').slice(0, 120) || null,
      remark: String(r.remark || '').slice(0, 300) || null, source_file: String(fileName || '').slice(0, 120) || null, uploaded_by: session.userId,
    })
  }
  if (!clean.length) throw new PaymentError('No valid credit rows with a UTR were found')
  const sb = getSupabase()
  const { data: existing } = await sb.from('bank_transactions').select('utr').in('utr', clean.map(c => c.utr))
  const have = new Set((existing || []).map(e => e.utr))
  const fresh = clean.filter(c => !have.has(c.utr))
  if (fresh.length) {
    const { error } = await sb.from('bank_transactions').insert(fresh)
    if (error) throw new PaymentError(error.message)
  }
  return { added: fresh.length, alreadyHad: clean.length - fresh.length, skipped }
}

export async function bankReport(access: Access) {
  need(access.canBank)
  const sb = getSupabase()
  const [{ data: groups }, { data: bank }] = await Promise.all([
    sb.from('payment_groups').select('*').in('mode', ['UPI', 'Bank']).order('created_at', { ascending: false }).limit(300),
    sb.from('bank_transactions').select('*').order('created_at', { ascending: false }).limit(2000),
  ])
  const pub = await hydrate((groups || []) as GroupRow[], access)
  const claimedUtrs = new Set((groups || []).map((g: any) => g.utr))
  const { data: allUtrs } = await sb.from('payment_groups').select('utr').not('utr', 'is', null)
  for (const u of allUtrs || []) claimedUtrs.add(u.utr)
  const unclaimed = (bank || []).filter((b: any) => !claimedUtrs.has(b.utr)).slice(0, 200)
    .map((b: any) => ({ utr: b.utr, amount: Number(b.amount), date: b.txn_date || '', payer: b.payer || '', remark: b.remark || '' }))
  return {
    bankRows: (bank || []).length,
    payments: pub,
    counts: {
      matched: pub.filter(g => g.bank.status === 'Matched').length,
      mismatch: pub.filter(g => g.bank.status === 'Amount mismatch').length,
      notFound: pub.filter(g => g.bank.status === 'Not found').length,
    },
    unclaimed,
  }
}
