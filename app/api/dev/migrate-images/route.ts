import { NextRequest } from 'next/server'
import { apiHandler, requireRole, ok, err } from '@/lib/api'
import { readTable, appendRow, updateRow, makeId, nowIso, findRecord } from '@/lib/supabase-db'
import { getFileBase64 } from '@/lib/drive'
import { uploadToSupabase, buildSupabaseProxyUrl, BUCKETS } from '@/lib/supabase'

const PHOTO_FIELDS = [
  { field: 'Customer Photo URL', type: 'customer', ext: 'jpg' },
  { field: 'Aadhaar Front URL', type: 'aadhaar_front', ext: 'jpg' },
  { field: 'Aadhaar Back URL', type: 'aadhaar_back', ext: 'jpg' },
  { field: 'Landmark Photo URL', type: 'landmark', ext: 'jpg' },
  { field: 'House Photo URL', type: 'house', ext: 'jpg' },
  { field: 'Cheque Photo URL', type: 'cheque', ext: 'jpg' },
] as const

function extractDriveFileId(url: string): string | null {
  if (!url) return null
  // Supabase URLs start with /api/drive/supabase:
  if (url.startsWith('/api/drive/supabase:')) return null
  // Google Drive open URLs
  const openMatch = url.match(/[?&]id=([^&]+)/)
  if (openMatch) return openMatch[1]
  // Google Drive /d/ URLs
  const dMatch = url.match(/\/d\/([^/]+)/)
  if (dMatch) return dMatch[1]
  return null
}

function buildSupabasePath(guarantorCode: string, customerName: string, photoType: string, ext: string): string {
  const safeGuarantor = guarantorCode.replace(/[^a-zA-Z0-9-]/g, '_')
  const safeCustomer = customerName.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '_')
  return `NGF-${safeGuarantor}/${safeCustomer}/${photoType}.${ext}`
}

function isAlreadyMigrated(url: string): boolean {
  return url.startsWith('/api/drive/supabase:')
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export const GET = apiHandler(async (req: NextRequest) => {
  await requireRole(req, ['Admin'])
  const { searchParams } = new URL(req.url)
  const dryRun = searchParams.get('dryRun') === 'true'
  const limit = Number(searchParams.get('limit') || '100')
  const offset = Number(searchParams.get('offset') || '0')

  const [leads, migrationLogs] = await Promise.all([
    readTable('Leads'),
    readTable('MigrationLog'),
  ])

  // Build set of already migrated (leadId + field) from logs
  const migratedKeys = new Set<string>()
  for (const log of migrationLogs) {
    if (log.Status === 'success') {
      migratedKeys.add(`${log['Lead ID']}|${log['Field']}`)
    }
  }

  const leadsToProcess = leads.slice(offset, offset + limit)
  let processed = 0
  let migrated = 0
  let skipped = 0
  let errors: string[] = []

  for (const lead of leadsToProcess) {
    const leadId = lead['Lead ID']
    const guarantorCode = lead['Guarantor ID'] // Note: we need guarantor code, not ID
    const customerName = lead['Customer Name']

    // Get guarantor code from guarantors table
    const guarantors = await readTable('Guarantors')
    const guarantor = guarantors.find(g => g['Guarantor ID'] === lead['Guarantor ID'])
    const gCode = guarantor?.['Code'] || 'UNKNOWN'

    for (const { field, type, ext } of PHOTO_FIELDS) {
      const url = lead[field]
      const migrationKey = `${leadId}|${field}`

      // Skip if already migrated
      if (migratedKeys.has(migrationKey)) {
        skipped++
        continue
      }

      // Skip if no URL or already a Supabase URL
      if (!url || isAlreadyMigrated(url)) {
        skipped++
        if (!dryRun) {
          await appendRow('MigrationLog', {
            'Log ID': makeId('MIG'),
            'Lead ID': leadId,
            'Field': field,
            'Status': 'skipped',
            'Drive File ID': '',
            'Supabase Path': url || '',
            'Error': url ? 'already_supabase' : 'no_url',
            'Created At': nowIso(),
          })
        }
        continue
      }

      const driveFileId = extractDriveFileId(url)
      if (!driveFileId) {
        skipped++
        if (!dryRun) {
          await appendRow('MigrationLog', {
            'Log ID': makeId('MIG'),
            'Lead ID': leadId,
            'Field': field,
            'Status': 'skipped',
            'Drive File ID': '',
            'Supabase Path': '',
            'Error': 'invalid_url_format',
            'Created At': nowIso(),
          })
        }
        continue
      }

      processed++

      if (dryRun) {
        errors.push(`[DRY RUN] Would migrate ${leadId} ${field} (Drive ID: ${driveFileId})`)
        continue
      }

      try {
        // Download from Drive
        const { data: fileData, mime } = await getFileBase64(driveFileId)

        // Upload to Supabase
        const supabasePath = buildSupabasePath(gCode, customerName, type, ext)
        await uploadToSupabase(BUCKETS.CUSTOMER_DOCS, supabasePath, fileData, mime)

        // Build new proxy URL
        const newUrl = buildSupabaseProxyUrl(BUCKETS.CUSTOMER_DOCS, supabasePath)

        // Update Lead record
        const rowIndex = Number(lead.__rowIndex)
        await updateRow('Leads', rowIndex, { [field]: newUrl, 'Updated At': nowIso() })

        // Log success
        await appendRow('MigrationLog', {
          'Log ID': makeId('MIG'),
          'Lead ID': leadId,
          'Field': field,
          'Status': 'success',
          'Drive File ID': driveFileId,
          'Supabase Path': supabasePath,
          'Error': '',
          'Created At': nowIso(),
        })

        migrated++
      } catch (e: any) {
        const errorMsg = e?.message || String(e)
        errors.push(`Failed ${leadId} ${field}: ${errorMsg}`)
        await appendRow('MigrationLog', {
          'Log ID': makeId('MIG'),
          'Lead ID': leadId,
          'Field': field,
          'Status': 'failed',
          'Drive File ID': driveFileId,
          'Supabase Path': '',
          'Error': errorMsg,
          'Created At': nowIso(),
        })
      }

      // Rate limiting - 500ms between Drive downloads
      await sleep(500)
    }
  }

  return ok({
    processed,
    migrated,
    skipped,
    errors: errors.slice(0, 50),
    totalLeads: leads.length,
    hasMore: offset + limit < leads.length,
  })
})

export const POST = apiHandler(async (req: NextRequest) => {
  await requireRole(req, ['Admin'])
  const body = await req.json()
  const { action } = body

  if (action === 'reset') {
    // Clear migration log for re-run
    await requireRole(req, ['Admin'])
    // Note: We don't have a clear table function, but we could add one
    return ok({ message: 'Reset not implemented yet - manually clear MigrationLog sheet' })
  }

  return err('Invalid action')
})