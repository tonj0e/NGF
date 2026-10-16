import { NextRequest } from 'next/server'
import { getSheetsClient, getDriveClient } from '@/lib/google'
import { ok, err } from '@/lib/api'
import { SHEETS, LEADS_COLUMNS } from '@/lib/config'
import { hashPassword } from '@/lib/auth'
import { makeId, nowIso } from '@/lib/supabase-db'

// One-time setup — idempotent, safe to retry
// POST /api/setup  with header  x-setup-secret: <SETUP_SECRET>
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-setup-secret')
  if (!secret || secret !== process.env.SETUP_SECRET) {
    return err('Unauthorized', 401)
  }

  try {
    const sheetsClient = await getSheetsClient()
    const drive = await getDriveClient()

    // ── helpers ──────────────────────────────────────────────────────────────

    const findFolder = async (name: string, parentId?: string): Promise<string | null> => {
      const q = parentId
        ? `'${parentId}' in parents and name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
        : `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
      const res = await drive.files.list({ q, fields: 'files(id)', pageSize: 1 })
      return res.data.files?.[0]?.id || null
    }

    const mkFolder = async (name: string, parentId?: string): Promise<string> => {
      const existing = await findFolder(name, parentId)
      if (existing) return existing
      const res = await drive.files.create({
        requestBody: {
          name,
          mimeType: 'application/vnd.google-apps.folder',
          ...(parentId ? { parents: [parentId] } : {}),
        },
        fields: 'id',
      })
      return res.data.id!
    }

    // ── 1. Drive folder tree ─────────────────────────────────────────────────

    const rootId     = await mkFolder('NGF CRM')
    const ssFolder   = await mkFolder('Spreadsheets',     rootId)
    const leadDocsId = await mkFolder('Lead Documents',   rootId)
    await mkFolder('Repayment Proofs', rootId)
    await mkFolder('Agent Reports',    rootId)
    await mkFolder('Backups',          rootId)

    // ── 2. Create spreadsheets ───────────────────────────────────────────────

    const mainSS = await sheetsClient.spreadsheets.create({
      requestBody: {
        properties: { title: 'NGF CRM — Operations' },
        sheets: Object.keys(SHEETS).map(name => ({ properties: { title: name } })),
      },
    })
    const mainId = mainSS.data.spreadsheetId!

    const leadsSS = await sheetsClient.spreadsheets.create({
      requestBody: {
        properties: { title: 'NGF CRM — Leads' },
        sheets: [{ properties: { title: 'Leads' } }],
      },
    })
    const leadsId = leadsSS.data.spreadsheetId!

    // Move both into Spreadsheets/ folder
    const getParents = async (fileId: string) => {
      const f = await drive.files.get({ fileId, fields: 'parents' })
      return (f.data.parents || []).join(',')
    }
    const [mainParents, leadsParents] = await Promise.all([getParents(mainId), getParents(leadsId)])
    await drive.files.update({ fileId: mainId, addParents: ssFolder, removeParents: mainParents, fields: 'id' })
    await drive.files.update({ fileId: leadsId, addParents: ssFolder, removeParents: leadsParents, fields: 'id' })

    // ── 3. Write headers ─────────────────────────────────────────────────────

    await sheetsClient.spreadsheets.values.batchUpdate({
      spreadsheetId: mainId,
      requestBody: {
        valueInputOption: 'RAW',
        data: Object.entries(SHEETS).map(([sheetName, columns]) => ({
          range: `${sheetName}!A1`,
          values: [columns],
        })),
      },
    })

    await sheetsClient.spreadsheets.values.update({
      spreadsheetId: leadsId,
      range: 'Leads!A1',
      valueInputOption: 'RAW',
      requestBody: { values: [LEADS_COLUMNS] },
    })

    // ── 4. Format headers (bold + blue + frozen) ─────────────────────────────

    const formatSheet = async (spreadsheetId: string, sheetId: number) => {
      await sheetsClient.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              repeatCell: {
                range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
                cell: {
                  userEnteredFormat: {
                    textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
                    backgroundColor: { red: 0.12, green: 0.29, blue: 0.49 },
                    horizontalAlignment: 'CENTER',
                  },
                },
                fields: 'userEnteredFormat(textFormat,backgroundColor,horizontalAlignment)',
              },
            },
            {
              updateSheetProperties: {
                properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
                fields: 'gridProperties.frozenRowCount',
              },
            },
          ],
        },
      })
    }

    const mainSheets = (await sheetsClient.spreadsheets.get({ spreadsheetId: mainId })).data.sheets!
    for (const s of mainSheets) {
      await formatSheet(mainId, s.properties!.sheetId!)
    }
    const leadsSheetId = (await sheetsClient.spreadsheets.get({ spreadsheetId: leadsId })).data.sheets![0].properties!.sheetId!
    await formatSheet(leadsId, leadsSheetId)

    // ── 5. Seed admin user ───────────────────────────────────────────────────

    const passwordHash = await hashPassword('Admin@123')
    const now          = nowIso()
    const adminId      = makeId('USR')

    await sheetsClient.spreadsheets.values.append({
      spreadsheetId: mainId,
      range: 'Users!A1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[adminId, 'admin', passwordHash, '', 'Admin', 'Active', 'Administrator', '', '', now, now]],
      },
    })

    // ── 6. Return IDs ────────────────────────────────────────────────────────

    return ok({
      message: 'Setup complete! Paste these into lib/config.ts',
      SPREADSHEET_ID: mainId,
      LEADS_SPREADSHEET_ID: leadsId,
      PHOTO_ROOT_FOLDER_ID: leadDocsId,
      drive_root_id: rootId,
      admin_login: { username: 'admin', password: 'Admin@123' },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Setup failed'
    return err(msg, 500)
  }
}
