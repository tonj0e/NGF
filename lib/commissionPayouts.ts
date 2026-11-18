// What GET /api/commissions/payout answers, worked out with as few database round trips as possible
// (the database is far from the server, so every step that waits on another costs ~300 ms).
//   Guarantor ?summary=1 : 1 step   [access check + own guarantor row + own payouts + own loans], all at once
//   Guarantor (list)     : 1 step   [access check + own row + guarantors + loans + payouts], all at once
//   Admin ?all=1         : 1 step   [guarantors + loans + payouts], all at once
//   Staff ?all=1         : 2 steps  [permission + branch scope] -> [scoped guarantors + loans + payouts]
// The money is worked out by buildOverview exactly as before; only the reads changed (same rows, same order per guarantor).
import type { Session } from '@/types'
import { needFeature } from './access'
import { selectRows, selectAll } from './supabase-db'
import { byIds, scopeOf } from './db'
import { buildOverview, guarantorCanSeeCommissions, type CommissionOverview } from './commissions'

type Row = Record<string, string>

// Only the columns the commission maths and the screens use
const G_COLS = 'guarantor_id,name,code,commission_start'
const LOAN_COLS = 'guarantor_id,created_at,guarantor_commission'

const overviewOf = (g: Row, loans: Row[], payouts: Row[]) =>
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

export type PayoutView = { ok: true; data: unknown } | { ok: false; error: string; status: number }
const fail = (error: string, status: number): PayoutView => ({ ok: false, error, status })

const ownGuarantor = async (userId: string) =>
  (await selectRows('Guarantors', qb => qb.eq('user_id', userId).limit(1))).rows[0] as Row | undefined

export async function payoutView(session: Session, opts: { showAll: boolean; summary: boolean }): Promise<PayoutView> {
  const { showAll } = opts
  if (!showAll && session.role !== 'Guarantor') return fail('Guarantors only', 403)
  if (showAll && session.role !== 'Admin' && session.role !== 'Staff') return fail('Admins/Staff only', 403)

  // A guarantor's own commission (the Commissions page)
  if (!showAll && opts.summary) {
    // Payouts and loans are found through the guarantor's user id (join on guarantors), so they need not wait for the
    // guarantor row; the rows are then cut to that one guarantor id, exactly what the old two-step read returned.
    const viaUser = (qb: { eq: (column: string, value: string) => unknown }) => qb.eq('guarantors.user_id', session.userId)
    const [allowed, g, payoutsU, loansU] = await Promise.all([
      guarantorCanSeeCommissions(session), ownGuarantor(session.userId),
      selectAll('PayoutRequests', viaUser, '*,guarantors!inner(user_id)'),
      selectAll('Loans', viaUser, `${LOAN_COLS},guarantors!inner(user_id)`),
    ])
    if (!allowed) return fail('You do not have access to commissions', 403)
    if (!g) return fail('Guarantor not found', 404)
    const own = (r: Row) => r['Guarantor ID'] === g['Guarantor ID']
    const overview = overviewOf(g, loansU.filter(own), payoutsU.filter(own))
    return { ok: true, data: { ...legacySummary(overview), overview, guarantor: { name: String(g['Name'] || '').trim(), code: g['Code'] || '' } } }
  }

  // The request list plus the tracker of every guarantor this person may see.
  // Each list is read once and the narrower lists are cut from it (old code read payouts and guarantors twice, one after the other).
  let gRows: Row[], allLoans: Row[], allPayouts: Row[], mine: Row[]
  if (!showAll) {
    // A guarantor's list call has always carried the full tracker (every guarantor); kept as is.
    const [allowed, g, gs, loans, payouts] = await Promise.all([
      guarantorCanSeeCommissions(session), ownGuarantor(session.userId),
      selectAll('Guarantors', qb => qb, G_COLS),
      selectAll('Loans', qb => qb.not('guarantor_id', 'is', null), LOAN_COLS),
      selectAll('PayoutRequests', qb => qb),
    ])
    if (!allowed) return fail('You do not have access to commissions', 403)
    if (!g) return fail('Guarantor not found', 404)
    gRows = gs; allLoans = loans; allPayouts = payouts
    mine = payouts.filter(p => p['Guarantor ID'] === g['Guarantor ID'])
  } else if (session.role === 'Staff') {
    // Staff see only guarantors (and their requests) in their own branches
    const [, sc] = await Promise.all([needFeature(session, ['payoutRequests']), scopeOf(session)])
    const ids = sc.kind === 'guarantors' ? sc.ids : []
    ;[gRows, allLoans, mine] = ids.length
      ? await Promise.all([byIds('Guarantors', 'guarantor_id', ids, G_COLS), byIds('Loans', 'guarantor_id', ids, LOAN_COLS), byIds('PayoutRequests', 'guarantor_id', ids)])
      : [[], [], []]
    allPayouts = mine
  } else {
    ;[gRows, allLoans, mine] = await Promise.all([
      selectAll('Guarantors', qb => qb, G_COLS),
      selectAll('Loans', qb => qb.not('guarantor_id', 'is', null), LOAN_COLS),
      selectAll('PayoutRequests', qb => qb),
    ])
    allPayouts = mine
  }
  const gById = new Map(gRows.map(g => [g['Guarantor ID'], g]))
  // the tracker only ever looks at payouts of guarantors that exist
  allPayouts = allPayouts.filter(p => gById.has(p['Guarantor ID']))

  const commissions = gRows.map(g => {
    const gid = g['Guarantor ID']
    const o = overviewOf(g, allLoans, allPayouts)
    const pending = allPayouts.find(p => p['Guarantor ID'] === gid && p['Status'] === 'Pending')
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
  }).filter(c => c.startMonday).sort((a, b) => b.available - a.available || b.earned - a.earned)

  const payouts = [...mine]
    .sort((a, b) => b['Requested At'].localeCompare(a['Requested At']))
    .map(p => {
      const g = gById.get(p['Guarantor ID'])
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

  return { ok: true, data: { payouts, commissions } }
}
