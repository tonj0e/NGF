import { NextRequest } from 'next/server'
import { apiHandler, getSession, ok, err } from '@/lib/api'
import { needFeature } from '@/lib/access'
import { coll } from '@/lib/features'
import { readTable, selectAll } from '@/lib/supabase-db'
import { pageQuery, cleanSearch, scopeOf, withScope } from '@/lib/db'

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

  // Resolve which guarantor this sheet is for (drives title + filtering)
  let guarantorId = ''
  let guarantorName = ''
  let guarantorCode = ''
  if (session.role === 'Guarantor') {
    const g = (await readTable('Guarantors')).find(g => g['User ID'] === session.userId)
    guarantorId = g?.['Guarantor ID'] || ''
    guarantorName = g?.['Name'] || ''
    guarantorCode = g?.['Code'] || ''
  } else if (guarantorIdParam) {
    const g = (await readTable('Guarantors')).find(g => g['Guarantor ID'] === guarantorIdParam)
    guarantorId = g?.['Guarantor ID'] || ''
    guarantorName = g?.['Name'] || ''
    guarantorCode = g?.['Code'] || ''
  }

  // The Saturday this sheet is for
  const saturday = (() => {
    const d = new Date(Date.now() + istOffset); const dy = d.getUTCDay()
    d.setUTCDate(d.getUTCDate() + (dy === 6 ? 0 : 6 - dy)); return d.toISOString().slice(0, 10)
  })()

  // Who may see which customers: a field agent only their assigned loans, Staff their branches' guarantors, a guarantor only their own
  let scope = await scopeOf(session)
  let agentId = ''
  if (session.role === 'NGF AGENT') {
    const agent = (await readTable('Agents')).find(a => a['User ID'] === session.userId)
    agentId = agent?.['Agent ID'] || '__none__'
    scope = { kind: 'all' }
  }
  const text = cleanSearch(searchParams.get('q'))
  const filters = (qb: any) => {
    let q = withScope(qb, scope)
    if (agentId) q = q.eq('assigned_agent_id', agentId)
    // A guarantor with no guarantor record must never fall through to the unfiltered list
    if (session.role === 'Guarantor' && !guarantorId) q = q.eq('guarantor_id', '__none__')
    else if (guarantorId) q = q.eq('guarantor_id', guarantorId)
    if (text) q = q.or(`name.ilike.%${text}%,phone.ilike.%${text}%,place.ilike.%${text}%,loan_id.ilike.%${text}`)
    return q
  }
  // Group by guarantor (name) then closest to completion first within each group (lowest balance = furthest along), matching the manual sheet
  const order = [{ column: 'guarantor_name' }, { column: 'balance' }, { column: 'name' }, { column: 'loan_id' }]

  const shape = (r: Record<string, string>) => ({
    name: String(r['Name'] || '').trim(),
    balance: Number(r['Balance']) || 0,
    rp: Number(r['Next Week']) || 0,
    // Customer's display reference is the Loan ID (e.g. NGFGBN-5779): last 4 digits
    code: String(r['Loan ID'] || '').slice(-4),
    number: r['Phone'] || '',
    place: r['Place'] || '',
    guarantorId: r['Guarantor ID'] || '',
    guarantorName: r['Guarantor Name'] || 'Unassigned',
    guarantorCode: r['Guarantor Code'] || '',
  })

  const paged = searchParams.has('page')
  let rows: ReturnType<typeof shape>[]
  let total = 0, page = 1, pageSize = 0, totalPages = 1
  if (paged) {
    const r = await pageQuery('CollectionSheetRows', { filters, order, page: searchParams.get('page'), pageSize: searchParams.get('pageSize') })
    rows = r.rows.map(shape); total = r.total; page = r.page; pageSize = r.pageSize; totalPages = r.totalPages
  } else {
    rows = (await selectAll('CollectionSheetRows', qb => filters(qb).order('guarantor_name').order('balance').order('name'))).map(shape)   // the sheet download: the whole scope, read page by page
    total = rows.length
  }

  return ok({
    guarantorName,
    guarantorCode,
    saturday,
    generatedAt: nowIst.toISOString().slice(0, 16).replace('T', ' '),
    count: total,
    rows,
    ...(paged ? { total, page, pageSize, totalPages } : {}),
  })
})
