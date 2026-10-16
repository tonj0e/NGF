import { NextRequest } from 'next/server'
import { apiHandler, requireRole, ok, err } from '@/lib/api'
import { readTable, appendRow, updateRow, makeId, nowIso } from '@/lib/supabase-db'
import { getFileBase64 } from '@/lib/drive'
import { uploadToSupabase, buildSupabaseProxyUrl, BUCKETS } from '@/lib/supabase'

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export const GET = apiHandler(async (req: NextRequest) => {
  await requireRole(req, ['Admin'])
  const { searchParams } = new URL(req.url)
  const dryRun = searchParams.get('dryRun') === 'true'
  const limit = Number(searchParams.get('limit') || '100')
  const offset = Number(searchParams.get('offset') || '0')

  const [repayments, collections, migrationLogs] = await Promise.all([
    readTable('Repayments'),
    readTable('Collections'),
    readTable('MigrationLog'),
  ])

  // Build set of already migrated (entityId + type) from logs
  const migratedKeys = new Set<string>()
  for (const log of migrationLogs) {
    if (log.Status === 'success' && (log['Field'] === 'Repayment Proof' || log['Field'] === 'Collection Proof')) {
      migratedKeys.add(`${log['Field']}|${log['Lead ID']}`)
    }
  }

  let processed = 0
  let migrated = 0
  let skipped = 0
  let errors: string[] = []

  // Process Repayments Proof File ID
  const repaymentsToProcess = repayments.slice(offset, offset + limit)
  for (const repayment of repaymentsToProcess) {
    const repaymentId = repayment['Repayment ID']
    const proofFileId = repayment['Proof File ID']

    if (!proofFileId || proofFileId.startsWith('supabase:')) {
      skipped++
      continue
    }

    const migrationKey = `Repayment Proof|${repaymentId}`
    if (migratedKeys.has(migrationKey)) {
      skipped++
      continue
    }

    processed++

    if (dryRun) {
      errors.push(`[DRY RUN] Would migrate Repayment ${repaymentId} proof (Drive ID: ${proofFileId})`)
      continue
    }

    try {
      const { data: fileData, mime } = await getFileBase64(proofFileId)
      const supabasePath = `payment-proofs/${repayment['Loan ID']}/${repaymentId}.jpg`
      await uploadToSupabase(BUCKETS.PAYMENT_PROOFS, supabasePath, fileData, mime)
      const newUrl = buildSupabaseProxyUrl(BUCKETS.PAYMENT_PROOFS, supabasePath)

      await updateRow('Repayments', Number(repayment.__rowIndex), { 'Proof File ID': newUrl, 'Updated At': nowIso() })

      await appendRow('MigrationLog', {
        'Log ID': makeId('MIG'),
        'Lead ID': repaymentId,
        'Field': 'Repayment Proof',
        'Status': 'success',
        'Drive File ID': proofFileId,
        'Supabase Path': supabasePath,
        'Error': '',
        'Created At': nowIso(),
      })
      migrated++
    } catch (e: any) {
      errors.push(`Failed Repayment ${repaymentId}: ${e?.message || String(e)}`)
      await appendRow('MigrationLog', {
        'Log ID': makeId('MIG'),
        'Lead ID': repaymentId,
        'Field': 'Repayment Proof',
        'Status': 'failed',
        'Drive File ID': proofFileId,
        'Supabase Path': '',
        'Error': e?.message || String(e),
        'Created At': nowIso(),
      })
    }

    await sleep(500)
  }

  // Process Collections Proof File ID
  const collectionsToProcess = collections.slice(offset, offset + limit)
  for (const collection of collectionsToProcess) {
    const collectionId = collection['Collection ID']
    const proofFileId = collection['Proof File ID']

    if (!proofFileId || proofFileId.startsWith('supabase:')) {
      skipped++
      continue
    }

    const migrationKey = `Collection Proof|${collectionId}`
    if (migratedKeys.has(migrationKey)) {
      skipped++
      continue
    }

    processed++

    if (dryRun) {
      errors.push(`[DRY RUN] Would migrate Collection ${collectionId} proof (Drive ID: ${proofFileId})`)
      continue
    }

    try {
      const { data: fileData, mime } = await getFileBase64(proofFileId)
      const supabasePath = `payment-proofs/${collection['Loan ID']}/${collectionId}.jpg`
      await uploadToSupabase(BUCKETS.PAYMENT_PROOFS, supabasePath, fileData, mime)
      const newUrl = buildSupabaseProxyUrl(BUCKETS.PAYMENT_PROOFS, supabasePath)

      await updateRow('Collections', Number(collection.__rowIndex), { 'Proof File ID': newUrl, 'Created At': nowIso() })

      await appendRow('MigrationLog', {
        'Log ID': makeId('MIG'),
        'Lead ID': collectionId,
        'Field': 'Collection Proof',
        'Status': 'success',
        'Drive File ID': proofFileId,
        'Supabase Path': supabasePath,
        'Error': '',
        'Created At': nowIso(),
      })
      migrated++
    } catch (e: any) {
      errors.push(`Failed Collection ${collectionId}: ${e?.message || String(e)}`)
      await appendRow('MigrationLog', {
        'Log ID': makeId('MIG'),
        'Lead ID': collectionId,
        'Field': 'Collection Proof',
        'Status': 'failed',
        'Drive File ID': proofFileId,
        'Supabase Path': '',
        'Error': e?.message || String(e),
        'Created At': nowIso(),
      })
    }

    await sleep(500)
  }

  return ok({
    processed,
    migrated,
    skipped,
    errors: errors.slice(0, 50),
    totalRepayments: repayments.length,
    totalCollections: collections.length,
    hasMore: offset + limit < Math.max(repayments.length, collections.length),
  })
})

export const POST = apiHandler(async (req: NextRequest) => {
  await requireRole(req, ['Admin'])
  return err('Not implemented')
})