import { NextRequest } from 'next/server'
import { apiHandler, getSession, requireRole, ok, err } from '@/lib/api'
import { needFeature } from '@/lib/access'
import { selectRows, selectAll, getRowById, appendRow, updateById, invalidateCache, deleteById } from '@/lib/supabase-db'
import { byIds, scopeOf } from '@/lib/db'
import { computeSummary, guarantorCanSeeCommissions } from '@/lib/commissions'
import { randomInt } from 'crypto'
import { getBranchAccess, canSeeGuarantor, canApproveIn, guarantorBranchMap } from '@/lib/branchAccess'

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
      return ok(computeSummary(gl, mine))
    }
  } else if (session.role === 'Staff') {
    // Staff see only payout requests of guarantors in their own branches
    const sc = await scopeOf(session)
    mine = sc.kind === 'guarantors' ? await byIds('PayoutRequests', 'guarantor_id', sc.ids) : []
  } else {
    mine = await selectAll('PayoutRequests', qb => qb)
  }
  const guarantors = await byIds('Guarantors', 'guarantor_id', mine.map(p => p['Guarantor ID']))

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
        rejectionReason: p['Status'] === 'Rejected' ? (p['Notes'] || '') : '',
      }
    })

  return ok({ payouts: enriched })
})

export const POST = apiHandler(async (req: NextRequest) => {
  try {
    const session = await getSession(req)
    if (session.role !== 'Guarantor') return err('Guarantors only', 403)
    if (!(await guarantorCanSeeCommissions(session))) return err('You do not have access to commissions', 403)

    const body = await req.json().catch(() => ({}))
    const amount = Math.round(Number(body?.amount) * 100) / 100
    if (!Number.isFinite(amount) || amount <= 0) return err('Invalid amount')

    const g = (await selectRows('Guarantors', qb => qb.eq('user_id', session.userId).limit(1))).rows[0]
    if (!g) return err('Guarantor not found', 404)
    const gid = g['Guarantor ID']
    const [payouts, loans] = await Promise.all([
      selectAll('PayoutRequests', qb => qb.eq('guarantor_id', gid)), selectAll('Loans', qb => qb.eq('guarantor_id', gid)),
    ])

    const isPending = (p: any) => p['Guarantor ID'] === gid && p['Status'] === 'Pending'
    if (payouts.some(isPending)) return err('You already have a pending payout request')

    // Only commission from finished 35-day cycles, minus Paid and Pending, can be requested
    const summary = computeSummary(loans.filter(l => l['Guarantor ID'] === gid), payouts.filter((p: any) => p['Guarantor ID'] === gid))
    if (summary.eligible <= 0) return err('No completed payout cycles yet. Payout unlocks after 35 days.')
    if (amount > summary.available + 0.005) return err(`Amount is more than your available commission (${summary.available.toFixed(2)})`)

    // PYOUT + digits (settlements matches /PYOUT\d+/): millisecond timestamp + 4 random digits
    const payoutId = `PYOUT${Date.now()}${String(randomInt(0, 10000)).padStart(4, '0')}`
    await appendRow('PayoutRequests', {
      'Payout ID': payoutId,
      'Guarantor ID': gid,
      'Amount': amount.toFixed(2),
      'Status': 'Pending',
      'Requested At': new Date().toISOString(),
      'Notes': '',
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
  const notes = action === 'reject'
    ? `Rejected by admin ${session.userId}: ${body.notes || 'No reason provided'}`
    : `Recorded by admin ${session.userId}`

  await updateById('PayoutRequests', payoutId, {
    'Status': newStatus,
    'Processed At': new Date().toISOString(),
    'Notes': notes,
  })
  invalidateCache('PayoutRequests')

  return ok({ message: `Payout marked as ${newStatus}` })
})
