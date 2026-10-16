import { NextRequest } from 'next/server'
import { apiHandler, getSession, requireRole, ok, err } from '../../../lib/api'
import { readTable, appendRow, updateRow, findRecord, nowIso, deleteById, updateById, invalidateCache } from '../../../lib/supabase-db'
import { getLoanProducts, findLoanProduct, defaults, fromRow, toRow } from '../../../lib/loanProducts'

export const revalidate = 0

export const GET = apiHandler(async (req: NextRequest) => {
  await getSession(req)
  invalidateCache('LoanProducts')
  let rows = await readTable('LoanProducts')
  if (rows.length === 0) {
    for (const p of defaults()) await appendRow('LoanProducts', toRow(p))
    rows = await readTable('LoanProducts')
  }
  const products = rows.filter(r => r['Status'] !== 'Deleted').map(fromRow)
  return ok({ products })
})

export const POST = apiHandler(async (req: NextRequest) => {
  await requireRole(req, ['Admin'])
  const b = await req.json()
  const label = (b.label || '').trim()
  const principal = Number(b.principal || 0)
  const durationWeeks = Number(b.durationWeeks || 0)
  const weeklyCollection = Number(b.weeklyCollection || 0)
  const lastWeekCollection = b.lastWeekCollection === '' || b.lastWeekCollection == null ? weeklyCollection : Number(b.lastWeekCollection)
  const interestDeduction = Number(b.interestDeduction || 0)
  const guarantorCommission = Number(b.guarantorCommission || 0)
  if (!label || principal <= 0 || durationWeeks <= 0 || weeklyCollection <= 0) return err('Label, principal, weeks and weekly amount are required')

  const totalCollection = weeklyCollection * Math.max(0, durationWeeks - 1) + lastWeekCollection
  const netDisbursed = principal - interestDeduction - guarantorCommission

  // Unique key from label + a short suffix
  invalidateCache('LoanProducts')
  const existing = await readTable('LoanProducts')
  const base = label.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 10) || 'PROD'
  let key = base
  let n = 1
  while (existing.some(r => r['Key'] === key)) key = `${base}${++n}`

  await appendRow('LoanProducts', {
    'Key': key, 'Label': label,
    'Principal': String(principal), 'Duration Weeks': String(durationWeeks),
    'Weekly Collection': String(weeklyCollection), 'Last Week Collection': String(lastWeekCollection),
    'Total Collection': String(totalCollection), 'Interest Deduction': String(interestDeduction),
    'Guarantor Commission': String(guarantorCommission), 'Net Disbursed': String(netDisbursed),
    'Status': 'Active', 'Created At': nowIso(),
  })
  invalidateCache('LoanProducts')
  return ok({ success: true, key })
})

export const DELETE = apiHandler(async (req: NextRequest) => {
  await requireRole(req, ['Admin'])

  // Parse JSON body with debugging
  let body
  try {
    body = await req.json()
    console.log('DELETE loan-products: Raw body received:', JSON.stringify(body))
  } catch (e: unknown) {
    console.log('DELETE loan-products: JSON parsing failed:', e instanceof Error ? e.message : String(e))
    return err('Invalid JSON')
  }

  // Validate key exists and is a non-empty string (more robust than original)
  if (!body) {
    console.log('DELETE loan-products: Body is falsy:', body)
    return err('Valid key is required')
  }

  if (typeof body !== 'object') {
    console.log('DELETE loan-products: Body is not an object:', typeof body, body)
    return err('Valid key is required')
  }

  if (!( 'key' in body )) {
    console.log('DELETE loan-products: Body missing key property:', body)
    return err('Valid key is required')
  }

  if (typeof body.key !== 'string') {
    console.log('DELETE loan-products: Body.key is not a string:', typeof body.key, body.key)
    return err('Valid key is required')
  }

  if (!body.key.trim()) {
    console.log('DELETE loan-products: Body.key is empty after trim:', JSON.stringify(body.key))
    return err('Valid key is required')
  }

  const key = body.key.trim()
  console.log('DELETE loan-products: Valid key received:', key)

  // Check if product exists using the same logic as GET handler
  const existingProduct = await findLoanProduct(key)
  if (!existingProduct) {
    console.log('DELETE loan-products: Product not found for key:', key)
    return err('Product not found')
  }
  console.log('DELETE loan-products: Product found:', JSON.stringify(existingProduct))

  // Soft-delete so existing loans referencing the key still resolve
  // Only update the Status field to avoid potential issues with Created At
  console.log('DELETE loan-products: Attempting to delete product with key:', key)
  try {
    await updateById('LoanProducts', key, { 'Status': 'Deleted' })
    invalidateCache('LoanProducts')
    console.log('DELETE loan-products: Product deleted successfully')
    return ok({ success: true })
  } catch (e) {
    console.error('DELETE loan-products: Update failed:', e)
    return err(e instanceof Error ? e.message : 'Delete failed')
  }
})