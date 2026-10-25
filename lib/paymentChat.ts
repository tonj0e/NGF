// Payment Chat: a guarantor sends a UPI screenshot plus the customers it pays for; Claude reads the UTR, amount, date
// and time; if everything checks out the payment is recorded through markPayment (same rules as Payment Matching).
// Anything doubtful stops with a clear message and, for mistakes the guarantor can fix, blocks the next screenshot
// until it is fixed. Access is decided here from the session, never from the request body.
import { createHash } from 'crypto'
import { getSupabase, readTable, makeId } from './supabase-db'
import { getTodayIST, nowIST } from './dateUtils'
import { getOrCreateFolder, saveFile, driveUrl } from './drive'
import { APP_CONFIG } from './config'
import { getAccess, markPayment, lookupUtr, normalizeUtr, validUtr, needGuarantor, PaymentError, type Access } from './payments'
import { readSlip, slipReaderConfigured, providerKeys, pickProvider, nvidiaModel, nvidiaModelList, SLIP_MODEL, type SlipReading, type Provider } from './slipReader'
import { payCodeFromLoanId } from './payCode'
import { canSeeGuarantor, guarantorBranchMap } from './branchAccess'
import type { Session } from '../types'

// Statuses where the guarantor must fix this message before sending the next screenshot
export const FIX_STATUSES = ['Needs Retake', 'Duplicate', 'Amount Mismatch', 'Wrong Payee', 'Not Successful']
const MAX_IMAGE_BYTES = 3 * 1024 * 1024
const MEDIA: Record<string, 'image/jpeg' | 'image/png' | 'image/webp'> = { 'image/jpeg': 'image/jpeg', 'image/jpg': 'image/jpeg', 'image/png': 'image/png', 'image/webp': 'image/webp' }

type Row = Record<string, any>
export type ChatLine = { repaymentId: string; customerId: string; name: string; payCode: string; amount: number }

// ─── Settings (Admin) ────────────────────────────────────────────────────────

const KEYS = { enabled: 'slip:enabled', dayCap: 'slip:daily_cap', guarantorCap: 'slip:guarantor_cap', payee: 'slip:payee', provider: 'slip:provider' }
export async function slipSettings() {
  const { data } = await getSupabase().from('settings').select('key, value').in('key', Object.values(KEYS))
  const v = (k: string) => (data || []).find(r => r.key === k)?.value
  return {
    enabled: (v(KEYS.enabled) ?? '1') === '1',
    dailyCap: Math.max(0, Number(v(KEYS.dayCap) ?? 3000) || 0),
    guarantorCap: Math.max(0, Number(v(KEYS.guarantorCap) ?? 300) || 0),
    payee: String(v(KEYS.payee) ?? ''),
    provider: ['claude', 'nvidia'].includes(String(v(KEYS.provider))) ? String(v(KEYS.provider)) : 'auto',
    keys: await providerKeys(),
    keyPresent: await slipReaderConfigured(),
    model: SLIP_MODEL, nvidiaModel: await nvidiaModel(),
  }
}
export async function saveSlipSettings(access: Access, input: { enabled?: boolean; dailyCap?: number; guarantorCap?: number; payee?: string; provider?: string }) {
  if (!access.isAdmin) throw new PaymentError('Only an Admin can change this')
  const rows: { key: string; value: string }[] = []
  if (input.enabled !== undefined) rows.push({ key: KEYS.enabled, value: input.enabled ? '1' : '0' })
  if (input.dailyCap !== undefined) rows.push({ key: KEYS.dayCap, value: String(Math.min(50000, Math.max(0, Math.floor(Number(input.dailyCap) || 0)))) })
  if (input.guarantorCap !== undefined) rows.push({ key: KEYS.guarantorCap, value: String(Math.min(5000, Math.max(0, Math.floor(Number(input.guarantorCap) || 0)))) })
  if (input.payee !== undefined) rows.push({ key: KEYS.payee, value: String(input.payee).slice(0, 200) })
  if (input.provider !== undefined && ['auto', 'claude', 'nvidia'].includes(input.provider)) rows.push({ key: KEYS.provider, value: input.provider })
  if (rows.length) { const { error } = await getSupabase().from('settings').upsert(rows, { onConflict: 'key' }); if (error) throw new Error(error.message) }
  return slipSettings()
}

const istStart = (daysBack: number) => {
  const d = new Date(Date.now() + 5.5 * 3600_000); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - daysBack)
  return new Date(d.getTime() - 5.5 * 3600_000).toISOString()
}
// Reads and money spent, for the cost meter
export async function slipUsage(access: Access) {
  if (!access.isAdmin) throw new PaymentError('Only an Admin can see this')
  const sb = getSupabase()
  const since = istStart(31)
  const { data } = await sb.from('payment_chat').select('created_at, in_tokens, cost_usd').gt('in_tokens', 0).gte('created_at', since)
  const rows = data || []
  const sum = (from: string) => { const r = rows.filter(x => x.created_at >= from); return { reads: r.length, usd: r.reduce((s, x) => s + Number(x.cost_usd), 0) } }
  return { today: sum(istStart(0)), week: sum(istStart(6)), month: sum(istStart(29)) }
}

// ─── Collection day, counters and the wrong-screenshot allowance ─────────────

// The Saturday the guarantor is collecting for: today when it is Saturday, otherwise the last Saturday.
export function collectionDay(): string {
  const d = nowIST()
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 1) % 7))
  return d.toISOString().slice(0, 10)
}
const WRONG_SHARE = 0.25   // wrong screenshots allowed, as a share of that Saturday's collections
const WRONG_MIN = 5        // but never fewer than this

export async function chatStats(guarantorId: string) {
  const sb = getSupabase()
  const day = collectionDay()
  const { data: loans } = await sb.from('loans').select('loan_id').eq('guarantor_id', guarantorId)
  const ids = (loans || []).map(l => l.loan_id)
  let due = 0, recorded = 0
  if (ids.length) {
    const { data: reps } = await sb.from('repayments').select('status').in('loan_id', ids).eq('due_date', day)
    due = (reps || []).length
    recorded = (reps || []).filter(r => r.status === 'Paid').length
  }
  const { data: tries } = await sb.from('payment_chat').select('wrong_count').eq('guarantor_id', guarantorId).eq('collection_day', day)
  const wrongUsed = (tries || []).reduce((n, r) => n + Number(r.wrong_count || 0), 0)
  const wrongAllowed = Math.max(WRONG_MIN, Math.ceil(due * WRONG_SHARE))
  return { collectionDay: day, due, recorded, remaining: Math.max(0, due - recorded), wrongUsed, wrongAllowed, wrongLeft: Math.max(0, wrongAllowed - wrongUsed), manualMode: wrongUsed >= wrongAllowed }
}

// ─── Messages ────────────────────────────────────────────────────────────────

const visibleSet = async (access: Access): Promise<Set<string> | null> => {
  if (!access.branch) return null
  const gMap = await guarantorBranchMap()
  return new Set(Array.from(gMap.keys()).filter(g => canSeeGuarantor(access.branch!, gMap, g)))
}

function publicMsg(m: Row) {
  return {
    messageId: m.message_id, guarantorId: m.guarantor_id, kind: m.kind, parentId: m.parent_id, mode: m.mode, status: m.status, problem: m.problem || '',
    lines: (m.lines || []) as ChatLine[], note: m.note || '', utr: m.utr || '', amountRead: m.amount_read == null ? null : Number(m.amount_read),
    txnDate: m.txn_date || '', txnTime: m.txn_time || '', payee: m.payee || '', payApp: m.pay_app || '', confidence: m.confidence || '',
    imageUrl: m.image_url || '', groupId: m.group_id || '', createdByName: m.created_by_name || '', createdBy: m.created_by || '', createdAt: m.created_at,
    needsFix: m.kind === 'slip' && FIX_STATUSES.includes(m.status), manual: !!m.manual, reader: m.reader || '',
  }
}
export type ChatMessage = ReturnType<typeof publicMsg>

export async function listMessages(session: Session, access: Access, guarantorId: string) {
  if (!access.canChat) throw new PaymentError('The chat is not switched on for you. Ask an Admin.')
  const gid = access.isGuarantor ? access.guarantorId : guarantorId
  const vis = await visibleSet(access)
  const sb = getSupabase()
  let q = sb.from('payment_chat').select('*').order('created_at', { ascending: false }).limit(120)
  if (gid) { if (vis && !vis.has(gid)) throw new PaymentError('This guarantor belongs to another branch'); q = q.eq('guarantor_id', gid) }
  else if (vis) q = q.in('guarantor_id', Array.from(vis).length ? Array.from(vis) : ['-'])
  const { data, error } = await q
  if (error) throw new Error(error.message)
  const msgs = (data || []).reverse().map(publicMsg)
  return { messages: msgs, openIssue: msgs.some(m => m.needsFix), stats: gid ? await chatStats(gid) : null }
}

// ─── Submit a screenshot ─────────────────────────────────────────────────────

export type SubmitInput = {
  guarantorId?: string; mode?: string; repaymentIds?: string[]; messageId?: string
  image?: { mimeType: string; base64Data: string } | null
  manualUtr?: string   // only used once the guarantor has used up the wrong-screenshot allowance
}

async function lineDetails(guarantorId: string, repaymentIds: string[]): Promise<ChatLine[]> {
  const sb = getSupabase()
  const { data: reps } = await sb.from('repayments').select('repayment_id, loan_id, customer_id, amount, status').in('repayment_id', repaymentIds)
  if (!reps || reps.length !== repaymentIds.length) throw new PaymentError('A selected customer was not found')
  const { data: loans } = await sb.from('loans').select('loan_id, guarantor_id').in('loan_id', reps.map(r => r.loan_id))
  const lg = new Map((loans || []).map(l => [l.loan_id, l.guarantor_id]))
  const { data: custs } = await sb.from('customers').select('customer_id, name').in('customer_id', reps.map(r => r.customer_id))
  const names = new Map((custs || []).map(c => [c.customer_id, c.name]))
  return repaymentIds.map(id => {
    const r = reps.find(x => x.repayment_id === id)!
    if (lg.get(r.loan_id) !== guarantorId) throw new PaymentError('Every customer must belong to the same guarantor')
    if (r.status === 'Paid') throw new PaymentError(`${names.get(r.customer_id) || 'A customer'} is already paid for that week`)
    return { repaymentId: id, customerId: r.customer_id, name: names.get(r.customer_id) || '', payCode: payCodeFromLoanId(r.loan_id), amount: Number(r.amount) }
  })
}

// Google Drive: Payment Screenshots / <date> / <guarantor code> / <customer 4-digit code>. A multi payment keeps a copy in each customer's folder.
async function storeProof(guarantorId: string, lines: ChatLine[], media: string, b64: string, hash: string): Promise<string> {
  const g = (await readTable('Guarantors')).find(x => x['Guarantor ID'] === guarantorId)
  const day = getTodayIST()
  const top = await getOrCreateFolder(APP_CONFIG.PHOTO_ROOT_FOLDER_ID, 'Payment Screenshots')
  const dayF = await getOrCreateFolder(top, day)
  const gF = await getOrCreateFolder(dayF, String(g?.['Code'] || guarantorId).replace(/[\\/:*?"<>|]/g, ' ').trim())
  const codes = Array.from(new Set(lines.map(l => l.payCode).filter(Boolean)))
  const ext = media === 'image/png' ? 'png' : media === 'image/webp' ? 'webp' : 'jpg'
  let first = ''
  for (const code of codes.length ? codes : ['unknown']) {
    const folder = await getOrCreateFolder(gF, code)
    const id = await saveFile(folder, `${day}_${codes.join('+') || 'unknown'}_${hash.slice(0, 8)}.${ext}`, media, b64)
    first ||= id
  }
  return driveUrl(first)
}

const money = (n: number) => `₹${Number(n).toLocaleString('en-IN')}`

export async function submitSlip(session: Session, access: Access, input: SubmitInput) {
  if (!access.canChat) throw new PaymentError('The chat is not switched on for you. Ask an Admin.')
  const act: Access = { ...access, canMark: true }   // chat payments are recorded through markPayment, which needs this
  const guarantorId = access.isGuarantor ? access.guarantorId : String(input.guarantorId || '')
  if (!guarantorId) throw new PaymentError('Choose a guarantor')
  await needGuarantor(access, guarantorId)
  const sb = getSupabase()
  // A guarantor has a limited number of wrong screenshots per collection Saturday; after that they type the ID themselves
  const stats = access.isGuarantor ? await chatStats(guarantorId) : null
  const manualMode = !!stats?.manualMode
  const typedUtr = manualMode ? normalizeUtr(input.manualUtr) : ''
  if (manualMode && !validUtr(typedUtr)) {
    throw new PaymentError(`You have used all ${stats!.wrongAllowed} wrong-screenshot tries for this Saturday. Send the screenshot and type its transaction ID below it (8 to 30 letters or digits).`)
  }

  // Fixing an earlier message, or sending a new one
  let existing: Row | null = null
  if (input.messageId) {
    const { data } = await sb.from('payment_chat').select('*').eq('message_id', input.messageId).maybeSingle()
    if (!data || data.guarantor_id !== guarantorId || data.kind !== 'slip') throw new PaymentError('Message not found')
    if (!FIX_STATUSES.includes(data.status)) throw new PaymentError('This message does not need fixing')
    existing = data
  } else {
    const { data: open } = await sb.from('payment_chat').select('message_id').eq('guarantor_id', guarantorId).eq('kind', 'slip').in('status', FIX_STATUSES).limit(1)
    if (open && open.length) throw new PaymentError('Fix your last screenshot first (see the red message), then send the next one.')
  }

  const mode = input.mode === 'multi' ? 'multi' : 'single'
  const repaymentIds = Array.from(new Set((input.repaymentIds || (existing ? (existing.lines as ChatLine[]).map(l => l.repaymentId) : [])).filter(Boolean)))
  if (!repaymentIds.length) throw new PaymentError('Choose the customer this payment is for')
  if (mode === 'single' && repaymentIds.length > 1) throw new PaymentError('A single payment is for one customer. Use multi payment for more.')
  if (repaymentIds.length > 25) throw new PaymentError('Too many customers in one payment')
  const lines = await lineDetails(guarantorId, repaymentIds)
  const expected = lines.reduce((s, l) => s + l.amount, 0)

  // The picture: required for a new message, optional when only the customer is being changed
  let imageUrl: string = existing?.image_url || ''
  let imageHash: string = existing?.image_hash || ''
  let b64 = ''
  let media: 'image/jpeg' | 'image/png' | 'image/webp' | null = null
  if (input.image?.base64Data) {
    media = MEDIA[String(input.image.mimeType || '').toLowerCase()] || null
    if (!media) throw new PaymentError('Send a photo or screenshot (JPG, PNG or WebP)')
    b64 = input.image.base64Data.replace(/^data:[^,]+,/, '')
    const buf = Buffer.from(b64, 'base64')
    if (!buf.length) throw new PaymentError('The picture is empty')
    if (buf.length > MAX_IMAGE_BYTES) throw new PaymentError('The picture is too big. Try again.')
    imageHash = createHash('sha256').update(buf).digest('hex')
    imageUrl = await storeProof(guarantorId, lines, media, b64, imageHash)
  } else if (!existing) throw new PaymentError('Upload the payment screenshot')

  const messageId = existing?.message_id || makeId('CHT')
  const base = {
    message_id: messageId, guarantor_id: guarantorId, kind: 'slip', mode, lines, image_url: imageUrl, image_hash: imageHash || null,
    created_by: session.userId, created_by_name: session.name, updated_at: new Date().toISOString(),
  }
  const finish = async (status: string, problem: string, extra: Row = {}) => {
    const wrong = access.isGuarantor && FIX_STATUSES.includes(status) ? 1 : 0
    const row = {
      ...base, status, problem: problem || null, ...extra,
      collection_day: existing?.collection_day || collectionDay(), wrong_count: Number(existing?.wrong_count || 0) + wrong, manual: manualMode,
    }
    const { error } = existing
      ? await sb.from('payment_chat').update(row).eq('message_id', messageId)
      : await sb.from('payment_chat').insert(row)
    if (error) throw new Error(error.message)
    const { data } = await sb.from('payment_chat').select('*').eq('message_id', messageId).single()
    return publicMsg(data as Row)
  }
  const reset = { utr: null, amount_read: null, txn_date: null, txn_time: null, payee: null, pay_app: null, confidence: null, group_id: null, duplicate_group_id: null }

  // The same picture was already used for a recorded payment: no need to read it again
  if (imageHash) {
    const { data: same } = await sb.from('payment_chat').select('message_id, group_id, lines').eq('image_hash', imageHash).eq('status', 'Recorded').neq('message_id', messageId).limit(1)
    if (same && same.length) {
      const who = ((same[0].lines || []) as ChatLine[]).map(l => `${l.name} (${l.payCode})`).join(', ')
      return finish('Duplicate', `This exact screenshot was already used for ${who || 'another payment'}. Send the correct screenshot for this customer.`, { ...reset, duplicate_group_id: same[0].group_id })
    }
  }

  // Allowance used up: no reading. The guarantor typed the transaction ID, so check it is unused and record it.
  if (manualMode) {
    const found = await lookupUtr(typedUtr, access)
    const holder = found.groups.find(g => g.status === 'Verified' || g.status === 'Overridden')
    if (holder) {
      const who = holder.lines.map(l => (l.hidden ? 'a customer of another guarantor' : `${l.name} (${l.payCode})`)).join(', ')
      return finish('Duplicate', `This transaction ID is already recorded for ${who}. Check the ID you typed.`, { ...reset, utr: typedUtr, duplicate_group_id: holder.groupId })
    }
    try {
      const res = await markPayment(session, act, { guarantorId, mode: 'UPI', utr: typedUtr, repaymentIds, screenshotUrl: imageUrl, notes: 'Payment Chat. Transaction ID typed by the guarantor (not read from the screenshot).' })
      if (res.flagged) return finish('Duplicate', 'This transaction ID was just recorded by someone else. Check the ID you typed.', { ...reset, utr: typedUtr, duplicate_group_id: res.group.conflicts?.[0]?.groupId || null })
      return finish('Recorded', '', { ...reset, utr: typedUtr, group_id: res.group.groupId })
    } catch (e) {
      if (e instanceof PaymentError) return finish('Needs Retake', e.message, { ...reset, utr: typedUtr })
      throw e
    }
  }

  // Switches and limits: when reading is not possible the screenshot goes to the office instead of being lost
  const cfg = await slipSettings()
  const toOffice = (why: string) => finish('Pending Staff', `${why} Sent to the office to check.`, reset)
  if (!imageHash || !media) return toOffice('A new picture is needed to read it.')
  const prov: Provider | null = await pickProvider(cfg.provider)
  if (!prov || !cfg.enabled) return toOffice('Automatic reading is switched off.')
  const dayStart = istStart(0)
  const { count: today } = await sb.from('payment_chat').select('message_id', { count: 'exact', head: true }).gt('in_tokens', 0).gte('created_at', dayStart)
  if ((today || 0) >= cfg.dailyCap) return toOffice('Automatic reading has reached its limit for today.')
  const { count: mine } = await sb.from('payment_chat').select('message_id', { count: 'exact', head: true }).eq('guarantor_id', guarantorId).gt('in_tokens', 0).gte('created_at', dayStart)
  if ((mine || 0) >= cfg.guarantorCap) return toOffice('You have sent many screenshots today.')

  // Read it
  let reading: SlipReading, inT = 0, outT = 0, cost = 0, readerName = ''
  try { const r = await readSlip(b64, media, prov); ({ reading, inTokens: inT, outTokens: outT, costUsd: cost } = r); readerName = `${r.provider}:${r.model}` }
  catch (e) { console.error('Slip read failed:', e instanceof Error ? e.message : e); return toOffice('The screenshot could not be read just now.') }
  const utr = normalizeUtr(reading.utr)
  const usage = { in_tokens: Math.max(1, inT), out_tokens: outT, cost_usd: cost, reader: readerName }
  const read = { utr: utr || null, amount_read: reading.amount, txn_date: reading.date, txn_time: reading.time, payee: reading.payee, pay_app: reading.app, confidence: reading.confidence, group_id: null, duplicate_group_id: null, ...usage }

  if (!reading.isPaymentScreenshot) return finish('Needs Retake', 'This does not look like a payment confirmation screenshot. Send the payment success screen.', read)
  if (!reading.readable || reading.confidence === 'low' || !validUtr(utr) || reading.amount == null) {
    return finish('Needs Retake', `The screenshot is not clear enough${reading.problem ? ` (${reading.problem})` : ''}. Take a clear screenshot of the payment success screen showing the transaction ID and amount.`, read)
  }
  if (reading.paymentStatus !== 'success') return finish('Not Successful', `The screenshot shows the payment as ${reading.paymentStatus}. Send it again after the payment succeeds.`, read)
  if (Math.abs(Number(reading.amount) - expected) > 0.001) {
    return finish('Amount Mismatch', `The screenshot shows ${money(reading.amount)} but the customers you chose add up to ${money(expected)}. Choose the right customers or send the right screenshot.`, read)
  }
  if (cfg.payee) {
    const want = cfg.payee.toLowerCase().split(',').map(s => s.trim()).filter(Boolean)
    const got = String(reading.payee || '').toLowerCase()
    if (want.length && !want.some(w => got.includes(w))) return finish('Wrong Payee', `The payment went to "${reading.payee || 'unknown'}", not to NGF. Send the screenshot of the payment made to NGF.`, read)
  }

  // Duplicate UTR: show who already holds it
  const found = await lookupUtr(utr, access)
  const holder = found.groups.find(g => g.status === 'Verified' || g.status === 'Overridden')
  if (holder) {
    const who = holder.lines.map(l => (l.hidden ? "a customer of another guarantor" : `${l.name} (${l.payCode})`)).join(', ')
    return finish('Duplicate', `This transaction ID is already recorded for ${who}. Send the correct screenshot, or choose the right customer.`, { ...read, duplicate_group_id: holder.groupId })
  }

  // Dates that look wrong go to the office instead of being recorded
  const today0 = getTodayIST()
  const ageDays = reading.date ? Math.round((Date.parse(today0) - Date.parse(reading.date)) / 86400000) : null
  if (reading.confidence !== 'high' || ageDays == null || ageDays < -1 || ageDays > 14) {
    return finish('Pending Staff', `Read as ${utr} for ${money(reading.amount)}, but the ${reading.confidence !== 'high' ? 'reading is not certain' : 'date looks unusual'}. Sent to the office to check.`, read)
  }

  // All good: record it exactly like a staff-marked UPI payment
  try {
    const res = await markPayment(session, act, {
      guarantorId, mode: 'UPI', utr, repaymentIds, screenshotUrl: imageUrl,
      notes: `Payment Chat. Read from screenshot: ${reading.date || ''} ${reading.time || ''} ${reading.app || ''}`.trim().slice(0, 480),
    })
    if (res.flagged) return finish('Duplicate', 'This transaction ID was just recorded by someone else. Send the correct screenshot.', { ...read, duplicate_group_id: res.group.conflicts?.[0]?.groupId || null })
    return finish('Recorded', '', { ...read, group_id: res.group.groupId })
  } catch (e) {
    if (e instanceof PaymentError) return finish('Needs Retake', e.message, read)
    throw e
  }
}

// ─── Office actions ──────────────────────────────────────────────────────────

export async function postNote(session: Session, access: Access, guarantorId: string, text: string, parentId?: string) {
  if (!access.canChat) throw new PaymentError('No permission')
  const gid = access.isGuarantor ? access.guarantorId : guarantorId
  if (!gid) throw new PaymentError('Choose a guarantor')
  await needGuarantor(access, gid)
  const t = String(text || '').trim().slice(0, 500)
  if (!t) throw new PaymentError('Write a message')
  const { error } = await getSupabase().from('payment_chat').insert({
    message_id: makeId('CHT'), guarantor_id: gid, kind: 'note', parent_id: parentId || null, status: 'Note', note: t,
    created_by: session.userId, created_by_name: session.name,
  })
  if (error) throw new Error(error.message)
}

// Office confirms a message that was sent to them (reading off, doubtful, or limit reached). They type the UTR from the picture.
export async function approveMessage(session: Session, access: Access, messageId: string, utrRaw: string) {
  if (access.isGuarantor || !access.canChat) throw new PaymentError('Only office staff can do this')
  const act: Access = { ...access, canMark: true }
  const sb = getSupabase()
  const { data: m } = await sb.from('payment_chat').select('*').eq('message_id', messageId).maybeSingle()
  if (!m || m.kind !== 'slip') throw new PaymentError('Message not found')
  if (m.status !== 'Pending Staff') throw new PaymentError('This message is not waiting for the office')
  await needGuarantor(access, m.guarantor_id)
  const utr = normalizeUtr(utrRaw || m.utr)
  if (!validUtr(utr)) throw new PaymentError('Enter the transaction ID from the screenshot')
  const lines = (m.lines || []) as ChatLine[]
  const res = await markPayment(session, act, { guarantorId: m.guarantor_id, mode: 'UPI', utr, repaymentIds: lines.map(l => l.repaymentId), screenshotUrl: m.image_url, notes: 'Payment Chat. Confirmed by office.' })
  const status = res.flagged ? 'Duplicate' : 'Recorded'
  await sb.from('payment_chat').update({
    status, utr, group_id: res.group.groupId, updated_at: new Date().toISOString(),
    problem: res.flagged ? 'This transaction ID is already recorded for another payment. The guarantor must send the correct screenshot.' : null,
  }).eq('message_id', messageId)
}

export { getAccess }


// Admin test: read one screenshot with a chosen reader and show the result. Nothing is saved or recorded.
export async function testRead(access: Access, provider: string, image: { mimeType: string; base64Data: string } | null | undefined, model?: string) {
  if (!access.isAdmin) throw new PaymentError('Only an Admin can test the reader')
  const prov = provider === 'nvidia' ? 'nvidia' : 'claude'
  if (!(await providerKeys())[prov]) throw new PaymentError(prov === 'nvidia' ? 'No NVIDIA key is set (NVIDIA_API_KEY)' : 'No Claude key is set (ANTHROPIC_API_KEY)')
  const media = MEDIA[String(image?.mimeType || '').toLowerCase()]
  if (!media || !image?.base64Data) throw new PaymentError('Send a JPG, PNG or WebP picture')
  const b64 = image.base64Data.replace(/^data:[^,]+,/, '')
  if (Buffer.from(b64, 'base64').length > MAX_IMAGE_BYTES) throw new PaymentError('The picture is too big')
  const t0 = Date.now()
  try {
    const m = prov === 'nvidia' && model && /^[\w.\-/]{3,120}$/.test(model) ? model : undefined
    const r = await readSlip(b64, media, prov, m)
    return { ok: true, provider: r.provider, model: r.model, ms: Date.now() - t0, reading: r.reading, inTokens: r.inTokens, outTokens: r.outTokens, costUsd: r.costUsd, error: '' }
  } catch (e) {
    let hint = ''
    if (prov === 'nvidia') {
      const all = await nvidiaModelList()
      const vis = all.filter(id => /vl|vision|vila|neva|omni|paligemma|phi-.*vision|llama-3\.2-\d+b-vision|gemma-3|kosmos|fuyu/i.test(id))
      hint = all.length ? ` Models this key can use that look like vision models: ${(vis.length ? vis : all).slice(0, 12).join(', ')}` : ' (Could not list the models for this key.)'
    }
    return { ok: false, provider: prov, model: prov === 'nvidia' ? await nvidiaModel() : SLIP_MODEL, ms: Date.now() - t0, reading: null, inTokens: 0, outTokens: 0, costUsd: 0, error: (e instanceof Error ? e.message.slice(0, 300) : 'Failed') + hint }
  }
}
