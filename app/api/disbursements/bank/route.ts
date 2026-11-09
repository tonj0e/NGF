import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, getSession, ok, err } from '@/lib/api'
import { csrfProtection } from '@/lib/csrf'
import { requireFeature } from '@/lib/access'
import { lead as leadKeys } from '@/lib/features'
import { getSupabase, getRowById, selectRows, updateById, nowIso, invalidateCache, makeId } from '@/lib/supabase-db'
import { findLoanProduct } from '@/lib/loanProducts'
import { getBranchAccess, branchOfGuarantor, canApproveIn, canSeeBranch } from '@/lib/branchAccess'
import { customerForRenewalLead } from '@/lib/renewalRules'
import { getTodayIST } from '@/lib/dateUtils'
import { createAuditLogger } from '@/lib/audit'
import { checkUploadRate } from '@/lib/uploadRate'
import { getLeadDocFolder, uploadLeadPhoto, docLabel } from '@/lib/drive'
import { makePayNumber, payNumberOfCustomer } from '@/lib/payNumber'
import { readTable } from '@/lib/supabase-db'
import { BankSender, DEFAULT_SENDER, bankFileName, bankIssues, bankReference, buildBankXls, normAccount, normIfsc, normName } from '@/lib/bankFile'

// Bank payout files for the To disburse list. Staff check the customer's bank details (and verify them by phone), then create the file
// for the bank's payment portal: one file for renewals, one for new customers. Money rules: a lead is in one active file at a time,
// reference numbers are never reused, the 4-digit customer number is fixed, and nothing here marks a loan as disbursed.

async function senderSettings(): Promise<BankSender> {
  try {
    const rows = await readTable('Settings')
    const raw = rows.find(r => r['Key'] === 'bank:sender')?.['Value']
    return raw ? { ...DEFAULT_SENDER, ...JSON.parse(raw) } : DEFAULT_SENDER
  } catch { return DEFAULT_SENDER }
}

// the bank details of a lead: for a renewal they live on the customer
async function detailsOf(l: Record<string, string>) {
  const isRenewal = l['Loan Product'] === 'RENEWAL'
  const c = isRenewal ? await customerForRenewalLead(l) : undefined
  const src = isRenewal ? c : l
  return { isRenewal, customer: c, ifsc: src?.['IFSC Code'] || '', account: src?.['Account Number'] || '', name: src?.['Account Holder'] || '', passbook: src?.['Passbook Photo URL'] || '' }
}

// the amount that goes to the bank: what the customer is paid out (principal less the deduction)
async function netAmount(l: Record<string, string>, customer?: Record<string, string>): Promise<number> {
  if (l['Loan Product'] === 'RENEWAL') {
    if (!customer) return 0
    const prev = (await selectRows('Loans', qb => qb.eq('customer_id', customer['Customer ID']).order('created_at', { ascending: false }).limit(1))).rows[0]
    return Number(prev?.['Net Disbursed']) || 0
  }
  return (await findLoanProduct(l['Loan Product']))?.netDisbursed || 0
}

function toPayload(b64: string, filename: string) {
  const [header, data] = b64.split(',')
  return { fileName: filename, mimeType: header.match(/:(.*?);/)?.[1] || 'image/jpeg', base64Data: data }
}

export const GET = apiHandler(async (req: NextRequest) => {
  const session = await requireFeature(req, leadKeys('leadsDisburse'))
  const access = await getBranchAccess(session)
  const sb = getSupabase()
  const batchId = new URL(req.url).searchParams.get('batchId')

  const visible = async (batchIds: string[]) => {   // batches whose leads the person may see
    const { data: lines } = await sb.from('bank_payout_lines').select('batch_id, lead_id').in('batch_id', batchIds)
    const leads = await Promise.all([...new Set((lines || []).map(x => x.lead_id))].map(id => getRowById('Leads', id)))
    const okLead = new Map<string, boolean>()
    for (const l of leads) if (l) okLead.set(l['Lead ID'], canSeeBranch(access, await branchOfGuarantor(l['Guarantor ID'])))
    const bad = new Set((lines || []).filter(x => !okLead.get(x.lead_id)).map(x => x.batch_id))
    return (id: string) => !bad.has(id)
  }

  if (batchId) {
    const { data: batch } = await sb.from('bank_payout_batches').select('*').eq('batch_id', batchId).maybeSingle()
    if (!batch) return err('File not found', 404)
    if (!(await visible([batchId]))(batchId)) return err('This file belongs to another branch', 403)
    const { data: lines } = await sb.from('bank_payout_lines').select('*').eq('batch_id', batchId).order('reference_number', { ascending: true })
    const buf = buildBankXls(String(batch.file_date), (lines || []).map(l => ({ reference: Number(l.reference_number), amount: Number(l.amount), ifsc: l.benef_ifsc, account: l.benef_account, name: l.benef_name, remarks: l.remarks })), await senderSettings())
    await createAuditLogger(req, session).log('BANK_FILE_DOWNLOADED', 'BankPayoutBatch', batchId, { fileName: batch.file_name, count: (lines || []).length })
    return new NextResponse(new Uint8Array(buf), { status: 200, headers: { 'Content-Type': 'application/vnd.ms-excel', 'Content-Disposition': `attachment; filename="${batch.file_name}.xls"`, 'Cache-Control': 'no-store' } })
  }

  const since = new Date(Date.now() - 14 * 86400_000).toISOString()
  const { data: batches } = await sb.from('bank_payout_batches').select('*').gte('created_at', since).order('created_at', { ascending: false })
  const list = batches || []
  const seeOk = list.length ? await visible(list.map(b => b.batch_id)) : () => true
  const { data: lines } = list.length ? await sb.from('bank_payout_lines').select('batch_id, disbursed_at').in('batch_id', list.map(b => b.batch_id)) : { data: [] }
  return ok({
    today: getTodayIST(),
    batches: list.filter(b => seeOk(b.batch_id)).map(b => ({
      batchId: b.batch_id, fileName: b.file_name, kind: b.kind, fileDate: b.file_date, count: b.lead_count, total: Number(b.total_amount), status: b.status, createdAt: b.created_at,
      disbursed: (lines || []).filter(x => x.batch_id === b.batch_id && x.disbursed_at).length, cancelReason: b.cancel_reason || '',
    })),
  })
})

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await getSession(req)
  const csrfError = csrfProtection(req, session.userId)
  if (csrfError) return csrfError
  await requireFeature(req, leadKeys('leadsDisburse'))
  const access = await getBranchAccess(session)
  const body = await req.json().catch(() => ({}))
  const sb = getSupabase()
  const audit = createAuditLogger(req, session)

  // ── save a lead's bank details (and, when the staff have verified them with the customer, mark them verified)
  if (body.action === 'saveDetails') {
    const l = await getRowById('Leads', String(body.leadId || ''))
    if (!l) return err('Lead not found')
    if (!canApproveIn(access, await branchOfGuarantor(l['Guarantor ID']))) return err('This lead belongs to another branch', 403)
    if (l['Status'] !== 'Approved' || l['Disbursed At']) return err('Bank details can only be changed for approved leads waiting to be disbursed')
    const d = await detailsOf(l)
    const ifsc = normIfsc(body.ifscCode ?? d.ifsc), account = normAccount(body.accountNumber ?? d.account), name = normName(body.accountHolder ?? d.name)
    const issues = bankIssues({ ifsc, account, name })
    if (issues.length) return err(issues.join('. '))
    let passbook = d.passbook
    let folderId = l['Document Folder ID']
    if (body.passbookPhoto) {
      try { checkUploadRate(session.userId) } catch (e) { return err(e instanceof Error ? e.message : 'Too many uploads') }
      if (!folderId) {
        const g = await getRowById('Guarantors', l['Guarantor ID'])
        folderId = await getLeadDocFolder(g?.['Code'] || 'NGF', l['Customer Name'], l['Lead ID'])
        await updateById('Leads', l['Lead ID'], { 'Document Folder ID': folderId })
      }
      passbook = await uploadLeadPhoto(folderId, 'passbook', toPayload(String(body.passbookPhoto), 'passbook.jpg'), docLabel(l['Customer Name'], l['Lead ID']))
    }
    const changed = ifsc !== normIfsc(d.ifsc) || account !== normAccount(d.account) || name !== normName(d.name)
    const bank = { 'Account Number': account, 'IFSC Code': ifsc, 'Account Holder': name, 'Passbook Photo URL': passbook }
    if (d.isRenewal) { if (!d.customer) return err('Customer not found for this renewal'); await updateById('Customers', d.customer['Customer ID'], { ...bank, 'Updated At': nowIso() }) }
    const verified = body.verified === true
    await updateById('Leads', l['Lead ID'], {
      ...(d.isRenewal ? {} : bank),
      ...(verified ? { 'Bank Verified At': nowIso(), 'Bank Verified By': session.userId } : changed ? { 'Bank Verified At': null, 'Bank Verified By': null } : {}),
      'Updated At': nowIso(),
    })
    invalidateCache('Leads'); if (d.isRenewal) invalidateCache('Customers')
    await audit.log('BANK_DETAILS_SAVED', 'Lead', l['Lead ID'], { verified, changed })
    return ok({ success: true, verified })
  }

  // ── create the bank files for the chosen leads: one for renewals, one for new customers
  if (body.action === 'createFiles') {
    const ids: string[] = Array.isArray(body.leadIds) ? [...new Set<string>(body.leadIds.map(String))] : []
    if (!ids.length) return err('Choose at least one customer')
    if (ids.length > 400) return err('Choose at most 400 customers for one go')
    const refStart = Math.max(1, Math.floor(Number(body.refStart) || 1))

    const items: { lead: Record<string, string>; d: Awaited<ReturnType<typeof detailsOf>>; amount: number }[] = []
    const problems: string[] = []
    for (const id of ids) {
      const l = await getRowById('Leads', id)
      if (!l) { problems.push(`${id}: lead not found`); continue }
      const label = l['Customer Name'] || id
      if (!canApproveIn(access, await branchOfGuarantor(l['Guarantor ID']))) { problems.push(`${label}: belongs to another branch`); continue }
      if (l['Status'] !== 'Approved' || l['Disbursed At']) { problems.push(`${label}: not waiting to be disbursed`); continue }
      const d = await detailsOf(l)
      const issues = bankIssues({ ifsc: d.ifsc, account: d.account, name: d.name })
      if (issues.length) { problems.push(`${label}: ${issues.join(', ')}`); continue }
      if (!l['Bank Verified At']) { problems.push(`${label}: bank details not verified with the customer yet`); continue }
      const amount = await netAmount(l, d.customer)
      if (!(amount > 0)) { problems.push(`${label}: no payout amount found`); continue }
      items.push({ lead: l, d, amount })
    }
    // a customer who is already in a live (not cancelled) file must not be paid twice
    const { data: live } = await sb.from('bank_payout_lines').select('lead_id, reference_number, batch_id').in('lead_id', ids)
    if (live?.length) {
      const { data: bs } = await sb.from('bank_payout_batches').select('batch_id, file_name, status').in('batch_id', [...new Set(live.map(x => x.batch_id))])
      for (const x of live) { const b = bs?.find(y => y.batch_id === x.batch_id); if (b?.status === 'created') { const it = items.find(i => i.lead['Lead ID'] === x.lead_id); problems.push(`${it?.lead['Customer Name'] || x.lead_id}: already in file ${b.file_name}. Cancel that file first if it was not paid.`) } }
    }
    const seen = new Map<string, string>()
    for (const it of items) {
      const key = normAccount(it.d.account)
      if (seen.has(key)) problems.push(`${it.lead['Customer Name']} and ${seen.get(key)} have the same account number`)
      else seen.set(key, it.lead['Customer Name'])
    }
    if (problems.length) return err(`Fix this before the file can be made: ${[...new Set(problems)].join(' | ')}`)

    const today = getTodayIST()
    const created: { batchId: string; fileName: string; kind: string; count: number; total: number }[] = []
    for (const kind of ['renewal', 'new'] as const) {
      const group = items.filter(i => (kind === 'renewal') === i.d.isRenewal)
      if (!group.length) continue
      // the customer's permanent 4-digit number (shown in the file as "LEND 1234")
      const pays = await Promise.all(group.map(async i => {
        if (i.d.isRenewal) return payNumberOfCustomer(i.d.customer!)
        if (i.lead['Pay Number']) return i.lead['Pay Number']
        const n = await makePayNumber(); await updateById('Leads', i.lead['Lead ID'], { 'Pay Number': n }); return n
      }))
      // file name and reference numbers must be unique for ever: the database refuses a repeat, then the next free number is taken
      let done = false
      for (let attempt = 0; attempt < 6 && !done; attempt++) {
        const { data: lastFile } = await sb.from('bank_payout_batches').select('file_no').eq('file_date', today).order('file_no', { ascending: false }).limit(1)
        const fileNo = (lastFile?.[0]?.file_no || 0) + 1 + attempt
        const prefix = today.replace(/-/g, '')
        const { data: used } = await sb.from('bank_payout_lines').select('reference_number').like('reference_number', `${prefix}%`)
        const lastSeq = Math.max(0, ...(used || []).map(u => Number(String(u.reference_number).slice(8)) || 0))
        const startSeq = Math.max(lastSeq + 1, refStart)
        const batchId = makeId('BNK')
        const total = group.reduce((s, i) => s + i.amount, 0)
        const ins = await sb.from('bank_payout_batches').insert({ batch_id: batchId, file_name: bankFileName(today, fileNo), kind, file_date: today, file_no: fileNo, created_by: session.userId, lead_count: group.length, total_amount: total })
        if (ins.error) { if (ins.error.code === '23505') continue; throw new Error(ins.error.message) }
        const lines = group.map((i, k) => ({
          line_id: makeId('BNL'), batch_id: batchId, lead_id: i.lead['Lead ID'], reference_number: String(bankReference(today, startSeq + k)), amount: i.amount,
          mode: normIfsc(i.d.ifsc).startsWith('SIBL') ? 'S' : 'N', benef_ifsc: normIfsc(i.d.ifsc), benef_account: normAccount(i.d.account), benef_name: normName(i.d.name),
          remarks: `LEND ${pays[k]}`, customer_name: i.lead['Customer Name'],
        }))
        const li = await sb.from('bank_payout_lines').insert(lines)
        if (li.error) { await sb.from('bank_payout_batches').delete().eq('batch_id', batchId); if (li.error.code === '23505') continue; throw new Error(li.error.message) }
        created.push({ batchId, fileName: bankFileName(today, fileNo), kind, count: group.length, total })
        await audit.log('BANK_FILE_CREATED', 'BankPayoutBatch', batchId, { fileName: bankFileName(today, fileNo), kind, count: group.length, total })
        done = true
      }
      if (!done) return err('Could not reserve a file name and reference numbers. Please try again.')
    }
    return ok({ created })
  }

  // ── cancel a file that was not paid: its customers can go in a new file; its reference numbers stay used for ever
  if (body.action === 'cancelBatch') {
    const reason = String(body.reason || '').trim()
    if (reason.length < 3) return err('Write the reason for cancelling this file')
    const { data: batch } = await sb.from('bank_payout_batches').select('*').eq('batch_id', String(body.batchId || '')).maybeSingle()
    if (!batch) return err('File not found', 404)
    if (batch.status === 'cancelled') return err('This file is already cancelled')
    const { data: lines } = await sb.from('bank_payout_lines').select('lead_id, disbursed_at').eq('batch_id', batch.batch_id)
    if ((lines || []).some(x => x.disbursed_at)) return err('Some customers in this file are already marked disbursed, so it cannot be cancelled')
    for (const x of lines || []) { const l = await getRowById('Leads', x.lead_id); if (l && !canApproveIn(access, await branchOfGuarantor(l['Guarantor ID']))) return err('This file belongs to another branch', 403) }
    await sb.from('bank_payout_batches').update({ status: 'cancelled', cancelled_at: nowIso(), cancelled_by: session.userId, cancel_reason: reason.slice(0, 300) }).eq('batch_id', batch.batch_id)
    await audit.log('BANK_FILE_CANCELLED', 'BankPayoutBatch', batch.batch_id, { fileName: batch.file_name, reason })
    return ok({ success: true })
  }

  // ── delete a TEST file for good: its file number and reference numbers become free again. Never for a file that was used.
  if (body.action === 'deleteBatch') {
    const { data: batch } = await sb.from('bank_payout_batches').select('*').eq('batch_id', String(body.batchId || '')).maybeSingle()
    if (!batch) return err('File not found', 404)
    const { data: lines } = await sb.from('bank_payout_lines').select('lead_id, disbursed_at, reference_number').eq('batch_id', batch.batch_id)
    if ((lines || []).some(x => x.disbursed_at)) return err('Some customers in this file are already marked disbursed, so it cannot be deleted')
    for (const x of lines || []) { const l = await getRowById('Leads', x.lead_id); if (l && !canApproveIn(access, await branchOfGuarantor(l['Guarantor ID']))) return err('This file belongs to another branch', 403) }
    await sb.from('bank_payout_lines').delete().eq('batch_id', batch.batch_id)
    const del = await sb.from('bank_payout_batches').delete().eq('batch_id', batch.batch_id)
    if (del.error) return err('Could not delete the file')
    const refs = (lines || []).map(x => String(x.reference_number)).sort()
    await audit.log('BANK_FILE_DELETED', 'BankPayoutBatch', batch.batch_id, { fileName: batch.file_name, status: batch.status, count: refs.length, firstRef: refs[0] || '', lastRef: refs[refs.length - 1] || '' })
    return ok({ success: true })
  }

  return err('Unknown action')
})
