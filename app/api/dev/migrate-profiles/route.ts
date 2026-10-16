import { NextRequest } from 'next/server'
import { apiHandler, requireRole, ok, err } from '@/lib/api'
import { readTable, appendRow, updateRow, makeId, nowIso } from '@/lib/supabase-db'
import { getFileBase64 } from '@/lib/drive'
import { uploadToSupabase, buildSupabaseProxyUrl, BUCKETS, parseSupabaseProxyUrl } from '@/lib/supabase'

function extractDriveFileId(url: string): string | null {
  if (!url) return null
  if (url.startsWith('/api/drive/supabase:')) return null
  const openMatch = url.match(/[?&]id=([^&]+)/)
  if (openMatch) return openMatch[1]
  const dMatch = url.match(/\/d\/([^/]+)/)
  if (dMatch) return dMatch[1]
  return null
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

  const [profiles, migrationLogs] = await Promise.all([
    readTable('Profiles'),
    readTable('MigrationLog'),
  ])

  // Build set of already migrated from logs
  const migratedKeys = new Set<string>()
  for (const log of migrationLogs) {
    if (log.Status === 'success' && log['Field'] === 'Profile Photo') {
      migratedKeys.add(log['Lead ID'])
    }
  }

  const profilesToProcess = profiles.slice(offset, offset + limit)
  let processed = 0
  let migrated = 0
  let skipped = 0
  let errors: string[] = []

  for (const profile of profilesToProcess) {
    const userId = profile['User ID']
    const photoUrl = profile['Photo']

    if (!photoUrl || photoUrl.startsWith('/api/drive/supabase:')) {
      skipped++
      continue
    }

    if (migratedKeys.has(userId)) {
      skipped++
      continue
    }

    const driveFileId = extractDriveFileId(photoUrl)
    if (!driveFileId) {
      skipped++
      if (!dryRun) {
        await appendRow('MigrationLog', {
          'Log ID': makeId('MIG'),
          'Lead ID': userId,
          'Field': 'Profile Photo',
          'Status': 'skipped',
          'Drive File ID': '',
          'Supabase Path': '',
          'Error': photoUrl ? 'invalid_url_format' : 'no_url',
          'Created At': nowIso(),
        })
      }
      continue
    }

    processed++

    if (dryRun) {
      errors.push(`[DRY RUN] Would migrate Profile ${userId} photo (Drive ID: ${driveFileId})`)
      continue
    }

    try {
      const { data: fileData, mime } = await getFileBase64(driveFileId)
      const supabasePath = `profiles/${userId}/profile.jpg`
      await uploadToSupabase(BUCKETS.PROFILES, supabasePath, fileData, mime)
      const newUrl = buildSupabaseProxyUrl(BUCKETS.PROFILES, supabasePath)

      await updateRow('Profiles', Number(profile.__rowIndex), { 'Photo': newUrl, 'Updated At': nowIso() })

      await appendRow('MigrationLog', {
        'Log ID': makeId('MIG'),
        'Lead ID': userId,
        'Field': 'Profile Photo',
        'Status': 'success',
        'Drive File ID': driveFileId,
        'Supabase Path': supabasePath,
        'Error': '',
        'Created At': nowIso(),
      })
      migrated++
    } catch (e: any) {
      errors.push(`Failed Profile ${userId}: ${e?.message || String(e)}`)
      await appendRow('MigrationLog', {
        'Log ID': makeId('MIG'),
        'Lead ID': userId,
        'Field': 'Profile Photo',
        'Status': 'failed',
        'Drive File ID': driveFileId,
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
    totalProfiles: profiles.length,
    hasMore: offset + limit < profiles.length,
  })
})

export const POST = apiHandler(async (req: NextRequest) => {
  await requireRole(req, ['Admin'])
  return err('Not implemented')
})