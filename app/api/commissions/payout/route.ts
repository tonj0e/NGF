import { NextRequest } from 'next/server'
import { apiHandler, getSession, requireRole, ok, err } from '@/lib/api'
import { needFeature } from '@/lib/access'
import { selectRows, selectAll, getRowById, appendRow, updateById, invalidateCache, deleteById, makeId, nowIso } from '@/lib/supabase-db'
import { byIds, scopeOf } from '@/lib/db'
import { buildOverview, guarantorCanSeeCommissions, receiptNumber, type CommissionOverview } from '@/lib/commissions'
import { getTodayIST } from '@/lib/dateUtils'
import { randomInt } from 'crypto'
import { getBranchAccess, canSeeGuarantor, canApproveIn, guarantorBranchMap } from '@/lib/branchAccess'

const PAY_MODES = ['Cash', 'UPI', 'Bank Transfer']

const overviewOf = (g: Record<string, string>, loans: Record<string, string>[], payouts: Record<string, string>[]) =>
  buildOverview(loans.filter(l => l['Guarantor ID'] === g['Guarantor ID']), payouts.filter(p => p['Guarantor ID'] === g['Guarantor ID']), g['Commission Start'] || null)

// What the older Commissions page still reads, derived from the cycles
const legacySummary = (o: CommissionOverview) => {
  const ended = o.cycles.filter(c => c.status !== 'running')
  const eligible = Math.round(ended.reduce((t, c) => t + c.amount, 0) * 100) / 100
  return {
    earned: o.earned, eligible, locked: Math.round((o.earned - eligible) * 100) / 100, paid: o.paid, pending: o.pending, available: o.available,
    todayIST: o.today, nextPayoutDate: o.ready?.payoutDate || o.current?.payoutDate || null,
    cycles: [...o.cycles].reverse().map(c => ({ start: c.start, end: c.end, amount: c.amount, past: c.status !== 'running' })),
  }
}

// One cash-book line for a commission payment, so the Settlements page and the guarantor's own page agree
async function recordCommissionSettlement(gid: string, name: string, amount: number, note: string, userId: string) {
  const today = getTodayIST()
  await appendRow('Settlements', {
    'Settlement ID': makeId('STL'), 'Entity Type': 'GuarantorCommission', 'Entity ID': gid, 'Entity Name': name,
    'Settlement Date': today, 'Saturday Date': today, 'Total Cash Due': String(amount), 'Total UPI Due': '0', 'Amount Submitted': String(amount),
    'Balance': '0', 'Status': 'Settled', 'Notes': note, 'Recorded By': userId, 'Created At': nowIso(),
  })
  invalidateCache('Settlements')
}

export const GET = apiHandler(async (req: NextRequest) => {
  const session = await getSession(req)
  const { searchParams } = new URL(req.url)
  const showAll = searchParams.get('all') === '1'

  if (!showAll && session.role !== 'Guarantor') return err('Guarantors only', 403)
  if (showAll && session.role !== 'Admin' && session.role !== 'Staff') return err('Admins/Staff only', 403)
  if (showAll) await needFeature(session, ['payoutRequests'])

  if (!showAll && !(await guarantorCanSeeCommissions(session))) return err('You do not have access to commissions', 403)

  let mine: Record<string, string>[]
  if (!showAll) {
    // a guarantor: only their own requests and loans are read
    const g = (await selectRows('Guarantors', qb => qb.eq('user_id', session.userId).limit(1))).rows[0]
    if (!g) return err('Guarantor not found', 404)
    mine = await selectAll('PayoutRequests', qb => qb.eq('guarantor_id', g['Guarantor ID']))

    if (searchParams.get('summary') === '1') {
      const gl = await selectAll('Loans', qb => qb.eq('guarantor_id', g['Guarantor ID']))
      const overview = overviewOf(g, gl, mine)
      return ok({ ...legacySummary(overview), overview, guarantor: { name: String(g['Name'] || '').trim(), code: g['Code'] || '' } })
    }
  } else if (session.role === 'Staff') {
    // Staff see only payout requests of guarantors in their own branches
    const sc = await scopeOf(session)
    mine = sc.kind === 'guarantors' ? await byIds('PayoutRequests', 'guarantor_id', sc.ids) : []
  } else {
    mine = await selectAll('PayoutRequests', qb => qb)
  }
  const guarantors = await byIds('Guarantors', 'guarantor_id', mine.map(p => p['Guarantor ID']))

  // The tracker: every guarantor this person may pay, with what is earned, unlocked, paid, waiting and still available
  let scopeIds: string[] | null = null
  if (session.role === 'Staff') { const sc = await scopeOf(session); scopeIds = sc.kind === 'guarantors' ? sc.ids : [] }
  const gRows = scopeIds ? await byIds('Guarantors', 'guarantor_id', scopeIds) : await selectAll('Guarantors', qb => qb)
  const gIds = gRows.map((g: any) => g['Guarantor ID'])
  const [allLoans, allPayouts] = gIds.length ? await Promise.all([byIds('Loans', 'guarantor_id', gIds), byIds('PayoutRequests', 'guarantor_id', gIds)]) : [[], []]
  const commissions = gRows.map((g: any) => {
    const gid = g['Guarantor ID']
    const o = overviewOf(g, allLoans, allPayouts)
    const pending = allPayouts.find((p: any) => p['Guarantor ID'] === gid && p['Status'] === 'Pending')
    const cur = o.current
    return {
      guarantorId: gid, name: String(g['Name'] || '').trim(), code: g['Code'] || '', startMonday: o.startMonday,
      earned: o.earned, unlocked: Math.round((o.available + o.pending + o.paid) * 100) / 100, locked: cur && cur.status === 'running' ? cur.amount : 0,
      paid: o.paid, aheadPaid: 0, pending: o.pending, available: o.available,
      cycleStart: cur?.start || '', cycleEnd: cur?.end || '', cycleDay: cur?.dayOfCycle || 0, cycleLoans: cur?.loans || 0, cycleAmount: cur?.amount || 0,
      nextPayoutDate: o.ready?.payoutDate || cur?.payoutDate || null,
      readyStart: o.ready?.start || '', readyAmount: o.ready?.amount || 0, readyPayoutDate: o.ready?.payoutDate || '',
      pendingPayoutId: pending?.['Payout ID'] || '',
    }
  }).filter((c: any) => c.startMonday).sort((a: any, b: any) => b.available - a.available || b.earned - a.earned)

  const enriched = mine
    .sort((a: any, b: any) => b['Requested At'].localeCompare(a['Requested At']))
    .map((p: any) => {
      const g = guarantors.find((gu: any) => gu['Guarantor ID'] === p['Guarantor ID'])
      return {
        payoutId: p['Payout ID'],
        guarantorId: p['Guarantor ID'],
        guarantorName: g?.['Name'] || '',
        amount: Number(p['Amount'] || 0),
        status: p['Status'],
        requestedAt: p['Requested At'],
        processedAt: p['Processed At'] || null,
        notes: p['Notes'] || '',
        cycleStart: String(p['Cycle Start'] || '').slice(0, 10), cycleEnd: String(p['Cycle End'] || '').slice(0, 10), receiptNo: p['Receipt No'] || '',
        rejectionReason: p['Status'] === 'Rejected' ? (p['Notes'] || '') : '',
      }
    })

  return ok({ payouts: enriched, commissions })
})

export const POST = apiHandler(async (req: NextRequest) => {
  try {
    const session = await getSession(req)

    // Admin or Staff pays a guarantor's unlocked commission straight away (no request needed) and records how it was paid
    if (session.role === 'Admin' || session.role === 'Staff') {
      await needFeature(session, ['payoutRequests'])
      const b = await req.json().catch(() => ({}))
      if (b?.action !== 'payNow') return err('Guarantors only', 403)
      const gid = String(b.guarantorId || ''), mode = String(b.mode || ''), reference = String(b.reference || '').trim().slice(0, 60), cycleStart = String(b.cycleStart || '')
      if (!gid) return err('Choose a guarantor')
      if (!PAY_MODES.includes(mode)) return err('Choose how it was paid: Cash, UPI or Bank Transfer')
      const g = await getRowById('Guarantors', gid)
      if (!g) return err('Guarantor not found', 404)
      if (session.role === 'Staff') {
        const [access, gMap] = await Promise.all([getBranchAccess(session), guarantorBranchMap()])
        if (!canApproveIn(access, gMap.get(gid) || '')) return err('This guarantor belongs to another branch', 403)
      }
      const [loans, payouts] = await Promise.all([selectAll('Loans', qb => qb.eq('guarantor_id', gid)), selectAll('PayoutRequests', qb => qb.eq('guarantor_id', gid))])
      const cycle = overviewOf(g, loans, payouts).cycles.find(c => c.start === cycleStart)
      if (!cycle) return err('That cycle was not found')
      if (cycle.status === 'running') return err(`This cycle ends on ${cycle.end}. It can be paid after that.`)
      if (cycle.status === 'requested') return err('This cycle has a pending request. Approve or reject it first.')
      if (cycle.status === 'paid') return err('This cycle is already paid')
      if (cycle.amount <= 0) return err('No commission was earned in this cycle')
      const amount = cycle.amount
      const payoutId = `PYOUT${Date.now()}${String(randomInt(0, 10000)).padStart(4, '0')}`
      const now = new Date().toISOString()
      await appendRow('PayoutRequests', { 'Payout ID': payoutId, 'Guarantor ID': gid, 'Amount': amount.toFixed(2), 'Status': 'Paid', 'Requested At': now, 'Processed At': now, 'Cycle Start': cycle.start, 'Cycle End': cycle.end, 'Receipt No': receiptNumber(g['Code'], cycle.start), 'Notes': `Paid by ${session.userId} (${mode}${reference ? `, ref ${reference}` : ''})` })
      invalidateCache('PayoutRequests')
      await recordCommissionSettlement(gid, String(g['Name'] || ''), amount, `${mode} payment ${payoutId}${reference ? ` ref ${reference}` : ''}`, session.userId)
      return ok({ payoutId, message: 'Commission payment recorded' })
    }

    if (session.role !== 'Guarantor') return err('Guarantors only', 403)
    if (!(await guarantorCanSeeCommissions(session))) return err('You do not have access to commissions', 403)

    const body = await req.json().catch(() => ({}))

    const g = (await selectRows('Guarantors', qb => qb.eq('user_id', session.userId).limit(1))).rows[0]
    if (!g) return err('Guarantor not found', 404)
    const gid = g['Guarantor ID']
    const [payouts, loans] = await Promise.all([
      selectAll('PayoutRequests', qb => qb.eq('guarantor_id', gid)), selectAll('Loans', qb => qb.eq('guarantor_id', gid)),
    ])

    const isPending = (p: any) => p['Guarantor ID'] === gid && p['Status'] === 'Pending'
    if (payouts.some(isPending)) return err('You already have a pending payout request')

    // Only a finished cycle can be requested, once, for its full commission
    const ov = overviewOf(g, loans, payouts)
    const cycle = body?.cycleStart ? ov.cycles.find(c => c.start === String(body.cycleStart)) : ov.ready
    if (!cycle) return err('No finished cycle to request yet. Your cycle runs Monday to Sunday for 5 weeks.')
    if (cycle.status === 'running') return err(`Your cycle ends on ${cycle.end}. You can request after that.`)
    if (cycle.status !== 'ready') return err('This cycle already has a payout')
    if (cycle.amount <= 0) return err('No commission was earned in this cycle')
    const amount = cycle.amount

    // PYOUT + digits (settlements matches /PYOUT\d+/): millisecond timestamp + 4 random digits
    const payoutId = `PYOUT${Date.now()}${String(randomInt(0, 10000)).padStart(4, '0')}`
    await appendRow('PayoutRequests', {
      'Payout ID': payoutId,
      'Guarantor ID': gid,
      'Amount': amount.toFixed(2),
      'Status': 'Pending',
      'Requested At': new Date().toISOString(),
      'Cycle Start': cycle.start,
      'Cycle End': cycle.end,
      'Notes': `Payout on ${cycle.payoutDate}`,
    })
    invalidateCache('PayoutRequests')

    // Race guard: if another Pending row for this guarantor slipped in, the newer one (by id) withdraws itself
    const after = await selectAll('PayoutRequests', qb => qb.eq('guarantor_id', gid))
    const dupes = after.filter(isPending).map((p: any) => p['Payout ID']).sort()
    if (dupes.length > 1 && dupes[0] !== payoutId) {
      await deleteById('PayoutRequests', payoutId)
      invalidateCache('PayoutRequests')
      return err('You already have a pending payout request')
    }

    return ok({ payoutId, message: 'Payout request submitted' })
  } catch (e: any) {
    const msg = String(e?.message || '')
    // Unique-index violation from the one-pending rule
    if (/duplicate key|payout_one_pending/i.test(msg)) return err('You already have a pending payout request')
    return err('Could not submit payout request. Please try again.', 500)
  }
})

// Admin marks payout as Paid after scanning QR
export const PATCH = apiHandler(async (req: NextRequest) => {
  const session = await getSession(req)
  if (session.role !== 'Admin' && session.role !== 'Staff') return err('Admins/Staff only', 403)
  await needFeature(session, ['payoutRequests'])

  const body = await req.json()
  const { payoutId, action } = body // action: 'approve' | 'reject'
  if (!payoutId || !action) return err('payoutId and action required')

  const payout = await getRowById('PayoutRequests', String(payoutId))
  if (!payout) return err('Payout request not found', 404)

  // Only a request that is still waiting can be decided; a paid or rejected one is final
  if (session.role === 'Staff') {
    const [access, gMap] = await Promise.all([getBranchAccess(session), guarantorBranchMap()])
    if (!canApproveIn(access, gMap.get(payout['Guarantor ID']) || '')) return err('This payout belongs to another branch', 403)
  }
  if (payout['Status'] !== 'Pending') return err(`This payout is already ${String(payout['Status']).toLowerCase()}`)
  if (action !== 'approve' && action !== 'reject') return err('action must be approve or reject')

  const newStatus = action === 'reject' ? 'Rejected' : 'Paid'
  // The payout screen says how it was paid; the QR scan does not, and records its own cash-book line, so only a named mode writes one here
  const mode = String(body.mode || ''), reference = String(body.reference || '').trim().slice(0, 60)
  if (action === 'approve' && body.mode !== undefined && !PAY_MODES.includes(mode)) return err('Choose how it was paid: Cash, UPI or Bank Transfer')
  const notes = action === 'reject'
    ? `Rejected by admin ${session.userId}: ${body.notes || 'No reason provided'}`
    : `Recorded by ${session.userId}${mode ? ` (${mode}${reference ? `, ref ${reference}` : ''})` : ''}`

  const gRow = await getRowById('Guarantors', payout['Guarantor ID'])
  await updateById('PayoutRequests', payoutId, {
    'Status': newStatus,
    'Processed At': new Date().toISOString(),
    'Notes': notes,
    ...(action === 'approve' && payout['Cycle Start'] && !payout['Receipt No'] ? { 'Receipt No': receiptNumber(String(gRow?.['Code'] || ''), String(payout['Cycle Start']).slice(0, 10)) } : {}),
  })
  invalidateCache('PayoutRequests')
  if (action === 'approve' && mode) {
    await recordCommissionSettlement(payout['Guarantor ID'], String(gRow?.['Name'] || ''), Number(payout['Amount'] || 0), `${mode} payment ${payoutId}${reference ? ` ref ${reference}` : ''}`, session.userId)
  }

  return ok({ message: `Payout marked as ${newStatus}` })
})
