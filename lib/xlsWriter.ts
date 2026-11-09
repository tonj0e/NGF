// Writes a real old-style Excel file (.xls, Excel 97-2003, "BIFF8" inside an OLE2 container) with ONE sheet.
// The bank's payment portal only accepts this format, so it is written by hand here with no outside package.
// The record layout follows what Excel-compatible writers produce (no INDEX/DBCELL, stream padded to 4096 bytes),
// and a file made here is checked cell by cell against the bank's own sample (see docs/04 Money/Bank Payout File.md).

export type XlsCell =
  | { t: 's'; v: string }                // text, General format
  | { t: 's0'; v: string }               // text with the "0" number format (two header cells of the bank sheet carry it)
  | { t: 'text'; v: string }             // text, "@" (Text) format: keeps leading zeros
  | { t: 'n'; v: number }                // number, General
  | { t: 'int'; v: number }              // number, "0" format
  | { t: 'date'; v: number }             // date as an Excel serial number, "m/d/yyyy"
export type XlsSheet = { name: string; colWidths: number[]; rows: (XlsCell | null)[][] }   // widths in 1/256 of a character

// Built-in/custom format ids and the cell XF index of each style (16 style XFs come first)
const XF = { s: 16, s0: 18, text: 19, n: 16, int: 18, date: 17 } as const

const u8 = (...b: number[]) => Buffer.from(b)
function rec(id: number, data: Buffer | number[] = Buffer.alloc(0)): Buffer {
  const d = Buffer.isBuffer(data) ? data : Buffer.from(data)
  const h = Buffer.alloc(4); h.writeUInt16LE(id, 0); h.writeUInt16LE(d.length, 2)
  return Buffer.concat([h, d])
}
const hex = (s: string) => Buffer.from(s.replace(/\s+/g, ''), 'hex')
function u16(n: number) { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b }
function u32(n: number) { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b }

// A BIFF8 string body: 1 byte per character when every character is plain Latin-1, otherwise UTF-16
function xlString(s: string, lenBytes: 1 | 2): Buffer {
  const wide = /[^\u0000-ÿ]/.test(s)
  const head = lenBytes === 1 ? u8(s.length) : u16(s.length)
  return Buffer.concat([head, u8(wide ? 1 : 0), Buffer.from(s, wide ? 'utf16le' : 'latin1')])
}

function buildWorkbookStream(sheet: XlsSheet): Buffer {
  if (!sheet.name || sheet.name.length > 31 || /[\[\]:*?/\\]/.test(sheet.name)) throw new Error('Bad sheet name')
  const nRows = sheet.rows.length
  const nCols = Math.max(0, ...sheet.rows.map(r => r.length))

  // shared strings (one copy of each distinct text)
  const sst = new Map<string, number>(); let sstRefs = 0
  for (const row of sheet.rows) for (const c of row) if (c && (c.t === 's' || c.t === 's0' || c.t === 'text')) { sstRefs++; if (!sst.has(c.v)) sst.set(c.v, sst.size) }

  // ── globals
  const font = hex('c8000000ff7f90010000000001000500417269616c')
  const styleXf = hex('0000 0000 f5ff 20 00 00 f4 00000000 00000000 c020')
  const cellXf = (fmt: number) => Buffer.concat([hex('0000'), u16(fmt), hex('0100 20 00 00 f8 00000000 00000000 c020')])
  const writeAccess = Buffer.concat([Buffer.from('None'), Buffer.alloc(108, 0x20)])
  const globalsPre = Buffer.concat([
    rec(0x0809, hex('00060500bb0dcc070000000006000000')),
    rec(0x00e1, hex('b004')), rec(0x00c1, hex('0000')), rec(0x00e2),
    rec(0x005c, writeAccess), rec(0x0042, hex('b004')), rec(0x0161, hex('0000')), rec(0x013d, hex('0100')), rec(0x009c, hex('0e00')),
    rec(0x0019, hex('0000')), rec(0x0012, hex('0000')), rec(0x0063, hex('0000')), rec(0x0013, hex('0000')), rec(0x01af, hex('0000')),
    rec(0x01bc, hex('0000')), rec(0x0040, hex('0000')), rec(0x008d, hex('0000')),
    rec(0x003d, hex('e0015a00cf3f4e2a38000000000001005802')), rec(0x0022, hex('0000')), rec(0x000e, hex('0100')), rec(0x01b7, hex('0000')), rec(0x00da, hex('0000')),
    ...Array.from({ length: 10 }, () => rec(0x0031, font)),
    rec(0x041e, Buffer.concat([u16(164), xlString('m/d/yyyy', 2)])),
    ...Array.from({ length: 16 }, () => rec(0x00e0, styleXf)),
    rec(0x00e0, cellXf(0)), rec(0x00e0, cellXf(164)), rec(0x00e0, cellXf(1)), rec(0x00e0, cellXf(49)),
    rec(0x0293, hex('008000ff')), rec(0x0160, hex('0100')),
  ])

  // shared string table, split into CONTINUE records at string boundaries (a record holds at most 8224 bytes)
  const strBufs = [...sst.keys()].map(s => xlString(s, 2))
  const sstRecs: Buffer[] = []
  let cur: Buffer[] = [Buffer.concat([u32(sstRefs), u32(sst.size)])], curLen = 8, first = true
  const flush = () => { sstRecs.push(rec(first ? 0x00fc : 0x003c, Buffer.concat(cur))); first = false; cur = []; curLen = 0 }
  for (const b of strBufs) { if (curLen + b.length > 8224) flush(); cur.push(b); curLen += b.length }
  if (cur.length) flush()
  const sstBlock = Buffer.concat(sstRecs)
  const eof = rec(0x000a)

  const sheetNameBuf = xlString(sheet.name, 1)
  const boundsheetLen = 4 + 4 + 2 + sheetNameBuf.length   // record header, sheet position, state+type, name
  const sheetPos = globalsPre.length + boundsheetLen + sstBlock.length + eof.length
  const boundsheet = rec(0x0085, Buffer.concat([u32(sheetPos), u8(0, 0), sheetNameBuf]))

  // ── the sheet
  const parts: Buffer[] = [
    rec(0x0809, hex('00061000bb0dcc070000000006000000')),
    rec(0x000d, hex('0100')), rec(0x000c, hex('6400')), rec(0x000f, hex('0100')), rec(0x0011, hex('0000')), rec(0x0010, hex('fca9f1d24d62503f')),
    rec(0x005f, hex('0000')), rec(0x0080, hex('0000000001000000')), rec(0x0225, hex('0000ff00')), rec(0x0081, hex('010c')),
  ]
  // column widths: one COLINFO for each run of equal widths
  for (let c = 0; c < nCols;) {
    const w = sheet.colWidths[c] ?? 3218; let e = c
    while (e + 1 < nCols && (sheet.colWidths[e + 1] ?? 3218) === w) e++
    parts.push(rec(0x007d, Buffer.concat([u16(c), u16(e), u16(w), u16(15), u16(0), u16(0)])))
    c = e + 1
  }
  parts.push(rec(0x0200, Buffer.concat([u32(0), u32(nRows), u16(0), u16(nCols), u16(0)])))
  parts.push(
    rec(0x002a, hex('0000')), rec(0x002b, hex('0000')), rec(0x0082, hex('0100')), rec(0x001b, hex('0000')), rec(0x001a, hex('0000')),
    rec(0x0014, hex('0200002650')), rec(0x0015, hex('0200002646')), rec(0x0083, hex('0100')), rec(0x0084, hex('0000')),
    rec(0x0026, hex('333333333333d33f')), rec(0x0027, hex('333333333333d33f')), rec(0x0028, hex('85eb51b81e85e33f')), rec(0x0029, hex('ae47e17a14aed73f')),
    rec(0x00a1, hex('0900640001000100010083002c012c019a9999999999b93f9a9999999999b93f0100')),
    rec(0x0012, hex('0000')), rec(0x00dd, hex('0000')), rec(0x0019, hex('0000')), rec(0x0063, hex('0000')), rec(0x0013, hex('0000')),
  )
  sheet.rows.forEach((row, r) => {
    parts.push(rec(0x0208, Buffer.concat([u16(r), u16(0), u16(nCols), hex('ff00 0000 0000 0100 0f00')])))
    row.forEach((cell, c) => {
      if (!cell) return
      if (cell.t === 's' || cell.t === 's0' || cell.t === 'text') parts.push(rec(0x00fd, Buffer.concat([u16(r), u16(c), u16(XF[cell.t]), u32(sst.get(cell.v)!)])))
      else { const d = Buffer.alloc(8); d.writeDoubleLE(cell.v); parts.push(rec(0x0203, Buffer.concat([u16(r), u16(c), u16(XF[cell.t]), d]))) }
    })
  })
  parts.push(rec(0x023e, hex('b60200000000400000000000000000000000')), eof)

  const stream = Buffer.concat([globalsPre, boundsheet, sstBlock, eof, ...parts])
  const padded = Math.ceil(stream.length / 4096) * 4096
  return Buffer.concat([stream, Buffer.alloc(padded - stream.length)])
}

// OLE2 compound file (512-byte sectors) holding one stream called "Workbook"
function wrapInCompoundFile(wb: Buffer): Buffer {
  const SEC = 512, END = 0xfffffffe, FATSEC = 0xfffffffd, FREE = 0xffffffff
  const nData = wb.length / SEC
  let nFat = 1
  while (nFat * 128 < nData + nFat + 1) nFat++
  if (nFat > 109) throw new Error('File too large for this writer')
  const fat = Buffer.alloc(nFat * SEC, 0xff)
  const setFat = (i: number, v: number) => fat.writeUInt32LE(v >>> 0, i * 4)
  for (let i = 0; i < nData; i++) setFat(i, i === nData - 1 ? END : i + 1)
  for (let i = 0; i < nFat; i++) setFat(nData + i, FATSEC)
  const dirSector = nData + nFat
  setFat(dirSector, END)

  const header = Buffer.alloc(SEC, 0)
  Buffer.from('d0cf11e0a1b11ae1', 'hex').copy(header, 0)
  header.writeUInt16LE(0x003e, 24); header.writeUInt16LE(0x0003, 26); header.writeUInt16LE(0xfffe, 28)
  header.writeUInt16LE(9, 30); header.writeUInt16LE(6, 32)
  header.writeUInt32LE(nFat, 44); header.writeUInt32LE(dirSector, 48); header.writeUInt32LE(0x1000, 56)
  header.writeUInt32LE(END, 60); header.writeUInt32LE(0, 64); header.writeUInt32LE(END, 68); header.writeUInt32LE(0, 72)
  for (let i = 0; i < 109; i++) header.writeUInt32LE(i < nFat ? nData + i : FREE, 76 + i * 4)

  const dir = Buffer.alloc(SEC, 0)
  const entry = (i: number, name: string, type: number, left: number, right: number, child: number, start: number, size: number) => {
    const o = i * 128
    if (name) { Buffer.from(name, 'utf16le').copy(dir, o); dir.writeUInt16LE((name.length + 1) * 2, o + 64) }
    dir.writeUInt8(type, o + 66); dir.writeUInt8(1, o + 67)
    dir.writeUInt32LE(left >>> 0, o + 68); dir.writeUInt32LE(right >>> 0, o + 72); dir.writeUInt32LE(child >>> 0, o + 76)
    dir.writeUInt32LE(start >>> 0, o + 116); dir.writeUInt32LE(size, o + 120)
  }
  entry(0, 'Root Entry', 5, FREE, FREE, 1, END, 0)
  entry(1, 'Workbook', 2, FREE, FREE, FREE, 0, wb.length)
  for (const i of [2, 3]) { entry(i, '', 0, FREE, FREE, FREE, 0, 0); dir.writeUInt8(0, i * 128 + 67) }
  return Buffer.concat([header, wb, fat, dir])
}

export function buildXls(sheet: XlsSheet): Buffer {
  return wrapInCompoundFile(buildWorkbookStream(sheet))
}

/** Excel serial number of a calendar day (the bank sheet's Transaction date): 2026-11-09 -> 46335 */
export function excelDateSerial(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000)
}
