import { nativeTracker } from '@/lib/agentTracker'

// Excel and PDF files for the Tally summary (accountant). Two statements, kept apart:
//   Transaction ID statement (UPI / Bank, with the bank statement name) and Cash statement.
export type TallyRow = {
  guarantorId: string; guarantor: string; guarantorCode: string; customer: string; code: string; amount: number; mode: string
  utr: string; paidDate: string; bankName: string; bankCheck: string; bankAmount: number | null; markedBy: string
}
export type TallyData = { date: string; upi: TallyRow[]; cash: TallyRow[]; totals: { upi: number; cash: number } }
export type TallyWhich = 'upi' | 'cash' | 'both'

const UPI_HEAD = ['Guarantor', 'Customer', 'Code', 'Amount', 'Mode', 'Transaction ID', 'Paid date', 'Bank statement name', 'Bank check']
const CASH_HEAD = ['Guarantor', 'Customer', 'Code', 'Amount', 'Mode', 'Paid date', 'Recorded by']
const guarLabel = (r: TallyRow) => `${r.guarantor}${r.guarantorCode ? ` (${r.guarantorCode})` : ''}`
const upiCells = (r: TallyRow): (string | number)[] => [guarLabel(r), r.customer, r.code, r.amount, r.mode, r.utr, r.paidDate, r.bankName, r.bankCheck]
const cashCells = (r: TallyRow): (string | number)[] => [guarLabel(r), r.customer, r.code, r.amount, r.mode, r.paidDate, r.markedBy]

// rows with a subtotal line after each guarantor and a grand total at the end
function withTotals(rows: TallyRow[], cells: (r: TallyRow) => (string | number)[], width: number, amountCol: number) {
  const out: { cells: (string | number)[]; bold: boolean }[] = []
  let cur = '', sub = 0, n = 0, total = 0
  const flush = () => { if (n) { const c: (string | number)[] = Array(width).fill(''); c[0] = `${cur} total (${n})`; c[amountCol] = sub; out.push({ cells: c, bold: true }) } }
  for (const r of rows) {
    const g = guarLabel(r)
    if (g !== cur) { flush(); cur = g; sub = 0; n = 0 }
    out.push({ cells: cells(r), bold: false }); sub += r.amount; n++; total += r.amount
  }
  flush()
  if (rows.length) { const c: (string | number)[] = Array(width).fill(''); c[0] = `GRAND TOTAL (${rows.length})`; c[amountCol] = total; out.push({ cells: c, bold: true }) }
  return out
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const colName = (i: number) => String.fromCharCode(65 + i)

function sheetXml(head: string[], body: { cells: (string | number)[]; bold: boolean }[]) {
  const cell = (v: string | number, ref: string, style: number) =>
    typeof v === 'number' ? `<c r="${ref}" s="${style}"><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`
  const rows = [{ cells: head as (string | number)[], bold: true }, ...body].map((r, i) =>
    `<row r="${i + 1}">${r.cells.map((v, c) => cell(v, `${colName(c)}${i + 1}`, r.bold ? 1 : 0)).join('')}</row>`).join('')
  const cols = head.map((_, i) => `<col min="${i + 1}" max="${i + 1}" width="${i === 1 || i === 7 ? 28 : i === 0 ? 24 : 16}" customWidth="1"/>`).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${cols}</cols><sheetData>${rows}</sheetData></worksheet>`
}

async function buildXlsx(sheets: { name: string; head: string[]; body: { cells: (string | number)[]; bold: boolean }[] }[]): Promise<Uint8Array> {
  const { zipSync, strToU8 } = await import('fflate')
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    'xl/styles.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`),
  }
  sheets.forEach((s, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s.head, s.body)) })
  return zipSync(files)
}

async function save(name: string, mime: string, bytes: Uint8Array): Promise<string> {
  const n = nativeTracker()
  if (n && typeof n.saveFile === 'function') {
    let bin = ''
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    await n.saveFile({ data: btoa(bin), name, mime })
    return 'Saved in your Downloads folder.'
  }
  const blob = new Blob([bytes as BlobPart], { type: mime })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  return ''
}

export async function downloadTallyExcel(data: TallyData, which: TallyWhich, tag: string): Promise<string> {
  const sheets = []
  if (which !== 'cash') sheets.push({ name: 'Transaction ID statement', head: UPI_HEAD, body: withTotals(data.upi, upiCells, UPI_HEAD.length, 3) })
  if (which !== 'upi') sheets.push({ name: 'Cash statement', head: CASH_HEAD, body: withTotals(data.cash, cashCells, CASH_HEAD.length, 3) })
  const bytes = await buildXlsx(sheets)
  const part = which === 'both' ? 'statements' : which === 'upi' ? 'transaction-id-statement' : 'cash-statement'
  return save(`tally-${part}-${data.date}${tag}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes)
}

export async function downloadTallyPdf(data: TallyData, which: TallyWhich, tag: string): Promise<string> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
  const money = (n: number) => `Rs. ${Number(n || 0).toLocaleString('en-IN')}`
  let first = true
  const add = (title: string, head: string[], rows: TallyRow[], cells: (r: TallyRow) => (string | number)[], width: number) => {
    if (!first) doc.addPage()
    first = false
    doc.setFontSize(15); doc.text(`${title} - Saturday ${data.date}`, 148.5, 14, { align: 'center' })
    doc.setFontSize(9); doc.setTextColor(90)
    doc.text(`${rows.length} payment${rows.length === 1 ? '' : 's'} | total ${money(rows.reduce((t, r) => t + r.amount, 0))}`, 148.5, 20, { align: 'center' })
    const body = withTotals(rows, cells, width, 3).map(r => r.bold
      ? [{ content: String(r.cells[0]), colSpan: 3, styles: { fontStyle: 'bold', fillColor: [235, 235, 235] } }, { content: money(Number(r.cells[3])), styles: { fontStyle: 'bold', fillColor: [235, 235, 235] } }, { content: '', colSpan: width - 4, styles: { fillColor: [235, 235, 235] } }]
      : r.cells.map((v, i) => (i === 3 ? money(Number(v)) : String(v))))
    autoTable(doc, { startY: 25, head: [head], body: body as never, styles: { fontSize: 8.5, cellPadding: 1.8, lineColor: [68, 68, 68], lineWidth: 0.2, textColor: 20 }, headStyles: { fillColor: [240, 240, 240], textColor: 20 }, columnStyles: { 3: { halign: 'right' } } })
  }
  if (which !== 'cash') add('TRANSACTION ID STATEMENT', UPI_HEAD, data.upi, upiCells, UPI_HEAD.length)
  if (which !== 'upi') add('CASH STATEMENT', CASH_HEAD, data.cash, cashCells, CASH_HEAD.length)
  const part = which === 'both' ? 'statements' : which === 'upi' ? 'transaction-id-statement' : 'cash-statement'
  return save(`tally-${part}-${data.date}${tag}.pdf`, 'application/pdf', new Uint8Array(doc.output('arraybuffer')))
}
