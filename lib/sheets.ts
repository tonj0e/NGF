import { getSheetsClient } from './google'
import { APP_CONFIG, SHEETS, LEADS_COLUMNS } from './config'

type SheetName = keyof typeof SHEETS | 'Leads'

function getSpreadsheetId(sheet: SheetName): string {
  return sheet === 'Leads' ? APP_CONFIG.LEADS_SPREADSHEET_ID : APP_CONFIG.SPREADSHEET_ID
}

function getColumns(sheet: SheetName): string[] {
  if (sheet === 'Leads') return LEADS_COLUMNS
  return SHEETS[sheet as keyof typeof SHEETS]
}

// In-memory cache: 30s TTL for reads, invalidated on any write to that sheet
const cache = new Map<string, { data: Record<string, string>[]; ts: number }>()
const CACHE_TTL = 30_000

function cacheKey(sheet: SheetName) { return sheet }

export function invalidateCache(sheet: SheetName) { cache.delete(cacheKey(sheet)) }

export async function readTable(sheet: SheetName): Promise<Record<string, string>[]> {
  const key = cacheKey(sheet)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data

  const sheets = getSheetsClient()
  const ssId = getSpreadsheetId(sheet)
  let res
  try {
    res = await sheets.spreadsheets.values.get({ spreadsheetId: ssId, range: sheet })
  } catch (e: any) {
    // Sheet tab not created yet — treat as empty (first appendRow will create it)
    if (e?.message?.includes('Unable to parse range')) {
      cache.set(key, { data: [], ts: Date.now() }); return []
    }
    throw e
  }
  const rows = res.data.values || []
  if (rows.length < 2) { cache.set(key, { data: [], ts: Date.now() }); return [] }
  const headers = rows[0].map((h: string) => h.trim())
  const data = rows.slice(1).map((row: string[], i: number) => {
    const obj: Record<string, string> = { __rowIndex: String(i + 2) }
    headers.forEach((h: string, j: number) => { obj[h] = row[j] || '' })
    return obj
  })
  cache.set(key, { data, ts: Date.now() })
  return data
}

async function ensureSheet(sheet: SheetName): Promise<void> {
  const sheets = getSheetsClient()
  const ssId = getSpreadsheetId(sheet)
  const meta = await sheets.spreadsheets.get({ spreadsheetId: ssId })
  const exists = meta.data.sheets?.some(s => s.properties?.title === sheet)
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: ssId,
      requestBody: { requests: [{ addSheet: { properties: { title: sheet } } }] },
    })
    const cols = getColumns(sheet)
    await sheets.spreadsheets.values.update({
      spreadsheetId: ssId,
      range: `${sheet}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [cols] },
    })
  }
}

export async function appendRow(sheet: SheetName, data: Record<string, string>): Promise<void> {
  const sheets = getSheetsClient()
  const cols = getColumns(sheet)
  const row = cols.map(c => data[c] || '')
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: getSpreadsheetId(sheet),
      range: sheet,
      valueInputOption: 'RAW',
      requestBody: { values: [row] },
    })
  } catch (e: any) {
    if (e?.message?.includes('Unable to parse range')) {
      await ensureSheet(sheet)
      await sheets.spreadsheets.values.append({
        spreadsheetId: getSpreadsheetId(sheet),
        range: sheet,
        valueInputOption: 'RAW',
        requestBody: { values: [row] },
      })
    } else {
      throw e
    }
  }
  invalidateCache(sheet)
}

export async function updateRow(sheet: SheetName, rowIndex: number, data: Record<string, string>): Promise<void> {
  const sheets = getSheetsClient()
  const ssId = getSpreadsheetId(sheet)
  const cols = getColumns(sheet)
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: ssId,
    range: `${sheet}!A${rowIndex}:${colLetter(cols.length)}${rowIndex}`,
  })
  const current = (res.data.values || [[]])[0] || []
  const updated = cols.map((h, i) => (h in data ? data[h] : (current[i] || '')))
  await sheets.spreadsheets.values.update({
    spreadsheetId: ssId,
    range: `${sheet}!A${rowIndex}:${colLetter(cols.length)}${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: { values: [updated] },
  })
  invalidateCache(sheet)
}

// Cache sheet numeric IDs to avoid fetching metadata on every delete
const sheetIdCache = new Map<string, number>()

async function getSheetId(sheet: SheetName): Promise<number> {
  const ssId = getSpreadsheetId(sheet)
  const key = `${ssId}:${sheet}`
  if (sheetIdCache.has(key)) return sheetIdCache.get(key)!
  const sheets = getSheetsClient()
  const meta = await sheets.spreadsheets.get({ spreadsheetId: ssId })
  const sheetMeta = meta.data.sheets?.find(s => s.properties?.title === sheet)
  if (!sheetMeta) throw new Error(`Sheet ${sheet} not found`)
  const id = sheetMeta.properties!.sheetId!
  sheetIdCache.set(key, id)
  return id
}

export async function deleteRow(sheet: SheetName, rowIndex: number): Promise<void> {
  const sheets = getSheetsClient()
  const ssId = getSpreadsheetId(sheet)
  const sheetId = await getSheetId(sheet)
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: ssId,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: { sheetId, dimension: 'ROWS', startIndex: rowIndex - 1, endIndex: rowIndex },
        },
      }],
    },
  })
  invalidateCache(sheet)
}

export async function clearTable(sheet: SheetName): Promise<void> {
  const sheets = getSheetsClient()
  const ssId = getSpreadsheetId(sheet)
  await sheets.spreadsheets.values.clear({
    spreadsheetId: ssId,
    range: `${sheet}!A2:ZZ9999`,
  })
  invalidateCache(sheet)
}

export function findRecord(rows: Record<string, string>[], field: string, value: string) {
  return rows.find(r => r[field] === value) || null
}

function colLetter(n: number): string {
  let s = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

export function makeId(prefix: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let id = ''
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)]
  return `${prefix}${id}`
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function formatDateYmd(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() + days)
  return d
}

export function getNextSaturday(from: Date = new Date()): Date {
  const istOffset = 5.5 * 60 * 60 * 1000
  const d = new Date(from.getTime() + istOffset)
  const day = d.getUTCDay()
  const diff = day === 6 ? 0 : (6 - day)
  d.setUTCDate(d.getUTCDate() + diff)
  // Return as plain date (strip time, no offset)
  return new Date(d.toISOString().slice(0, 10))
}

export function paginate<T>(rows: T[], page: number, pageSize: number) {
  const total = rows.length
  const start = (page - 1) * pageSize
  return {
    rows: rows.slice(start, start + pageSize),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  }
}
