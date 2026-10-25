import { NextRequest } from 'next/server'
import { apiHandler, getSession, ok, err } from '@/lib/api'
import { needFeature } from '@/lib/access'
import { coll } from '@/lib/features'
import { readTable } from '@/lib/supabase-db'

// Collection sheet for guarantors: one row per active customer showing the week
// they are due to pay next, their outstanding balance, and contact details.
// Mirrors the manual "PW" sheets guarantors carry on Saturday collection rounds.

export const GET = apiHandler(async (req: NextRequest) => {
  const session = await getSession(req)
  await needFeature(session, coll('collectionSheet'))
  const { searchParams } = new URL(req.url)
  const guarantorIdParam = searchParams.get('guarantorId') || ''
  const isDownload = searchParams.get('download') === '1'

  // Download window: Friday (IST) from 5pm through end of Saturday.
  // On-screen viewing (the List tab) is allowed anytime; only the PDF download
  // is restricted. Admins can download anytime for oversight/testing.
  const istOffset = 5.5 * 60 * 60 * 1000
  const nowIst = new Date(Date.now() + istOffset)
  const day = nowIst.getUTCDay() // 5 = Fri, 6 = Sat
  const hour = nowIst.getUTCHours()
  const windowOpen = (day === 5 && hour >= 17) || day === 6
  if (isDownload && session.role !== 'Admin' && session.role !== 'Staff' && !windowOpen) {
    return err('Collection sheet can be downloaded only from Friday 5pm through Saturday.')
  }

  const [customers, loans, repayments, guarantors] = await Promise.all([
    readTable('Customers', { forceFresh: true }), readTable('Loans', { forceFresh: true }), readTable('Repayments', { forceFresh: true }), readTable('Guarantors', { forceFresh: true }),
  ])

  // Resolve which guarantor this sheet is for (drives title + filtering)
  let guarantorId = ''
  let guarantorName = ''
  let guarantorCode = ''
  if (session.role === 'Guarantor') {
    const g = guarantors.find(g => g['User ID'] === session.userId)
    guarantorId = g?.['Guarantor ID'] || ''
    guarantorName = g?.['Name'] || ''
    guarantorCode = g?.['Code'] || ''
  } else if (guarantorIdParam) {
    const g = guarantors.find(g => g['Guarantor ID'] === guarantorIdParam)
    guarantorId = g?.['Guarantor ID'] || ''
    guarantorName = g?.['Name'] || ''
    guarantorCode = g?.['Code'] || ''
  }

  // The Saturday this sheet is for
  const saturday = (() => {
    const d = new Date(Date.now() + istOffset); const dy = d.getUTCDay()
    d.setUTCDate(d.getUTCDate() + (dy === 6 ? 0 : 6 - dy)); return d.toISOString().slice(0, 10)
  })()

  // Customers in scope
  let scoped = customers
  // A guarantor with no guarantor record must never fall through to the unfiltered list
  if (session.role === 'Guarantor' && !guarantorId) scoped = []
  else if (guarantorId) {
    scoped = customers.filter(c => {
      if (c['Guarantor ID'] === guarantorId) return true
      const loan = loans.find(l => l['Loan ID'] === c['Active Loan ID'] && l['Guarantor ID'] === guarantorId)
        || loans.find(l => l['Customer ID'] === c['Customer ID'] && l['Guarantor ID'] === guarantorId)
      return !!loan
    })
  }

  // A field agent sees only customers whose loan is assigned to them
  if (session.role === 'NGF AGENT') {
    const agent = (await readTable('Agents')).find(a => a['User ID'] === session.userId)
    const mine = new Set(loans.filter(l => agent && l['Assigned Agent ID'] === agent['Agent ID']).map(l => l['Customer ID']))
    scoped = scoped.filter(c => mine.has(c['Customer ID']))
  }

  // Quick lookup for guarantor name/code by Guarantor ID (for grouping in the
  // all-customers sheet)
  const gById = new Map(guarantors.map(g => [g['Guarantor ID'], g]))

  const rows = scoped.flatMap(c => {
    const loan = loans.find(l => l['Customer ID'] === c['Customer ID'] && l['Status'] === 'Active')
      || loans.find(l => l['Loan ID'] === c['Active Loan ID'] && l['Status'] === 'Active')
    if (!loan) return []

    const loanReps = repayments.filter(r => r['Loan ID'] === loan['Loan ID'])
    const unpaid = loanReps.filter(r => r['Status'] !== 'Paid' && r['Status'] !== 'Waived')
    if (unpaid.length === 0) return []

    const nextWeek = Math.min(...unpaid.map(r => Number(r['Week No']) || 0))
    const balance = unpaid.reduce((s, r) => s + (Number(r['Amount']) || 0), 0)

    const gid = loan['Guarantor ID'] || c['Guarantor ID'] || ''
    const g = gById.get(gid)

    return [{
      name: (c['Name'] || '').trim(),
      balance,
      rp: nextWeek,
      // Customer's display reference is the Loan ID (e.g. NGFGBN-5779) — last 4 digits
      code: (loan['Loan ID'] || '').slice(-4),
      number: c['Phone'] || '',
      place: c['Place'] || '',
      guarantorId: gid,
      guarantorName: g?.['Name'] || 'Unassigned',
      guarantorCode: g?.['Code'] || '',
    }]
  })

  // Group by guarantor (name) then closest to completion first within each group
  // (lowest balance = furthest along), matching the manual sheet
  rows.sort((a, b) =>
    a.guarantorName.localeCompare(b.guarantorName) ||
    a.balance - b.balance ||
    a.name.localeCompare(b.name))

  return ok({
    guarantorName,
    guarantorCode,
    saturday,
    generatedAt: nowIst.toISOString().slice(0, 16).replace('T', ' '),
    count: rows.length,
    rows,
  })
})
