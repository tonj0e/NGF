import { nativeTracker } from '@/lib/agentTracker'

type SheetRow = { name: string; balance: number | string; rp: unknown; code: unknown; number: unknown; place: unknown; guarantorName?: string; guarantorCode?: string }
type SheetData = { rows: SheetRow[]; saturday: string; count: number; generatedAt: string; guarantorName?: string; guarantorCode?: string }

// Builds the collection sheet as a PDF and gives it to the person: saved to Downloads and opened in the Android app, a normal download in a browser.
export async function downloadSheetPdf(data: SheetData): Promise<string> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const rows = data.rows || []
  const grouped = !data.guarantorName
  const title = data.guarantorName ? `${data.guarantorName}${data.guarantorCode ? ` (${data.guarantorCode})` : ''}` : 'ALL CUSTOMERS'
  const money = (n: unknown) => `Rs. ${Number(n || 0).toLocaleString('en-IN')}`
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  doc.setFontSize(15); doc.text(`COLLECTION SHEET - ${title}`, 105, 14, { align: 'center' })
  doc.setFontSize(9); doc.setTextColor(90)
  doc.text(`Saturday ${data.saturday} | ${data.count} customers | generated ${data.generatedAt}`, 105, 20, { align: 'center' })

  const head = [['NO', 'NAME', 'BALANCE', 'RP', 'CODE', 'NUMBER', 'PLACE']]
  const cell = (r: SheetRow, i: number) => [String(i + 1), String(r.name ?? ''), money(r.balance), String(r.rp ?? ''), String(r.code ?? ''), String(r.number ?? ''), String(r.place ?? '')]
  const body: unknown[][] = []
  if (grouped) {
    const groups = new Map<string, SheetRow[]>()
    for (const r of rows) {
      const key = r.guarantorName ? `${r.guarantorName}${r.guarantorCode ? ` (${r.guarantorCode})` : ''}` : 'Unassigned'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(r)
    }
    groups.forEach((rs, key) => {
      const total = rs.reduce((s, r) => s + Number(r.balance || 0), 0)
      body.push([{ content: `${key} - ${rs.length} customer${rs.length !== 1 ? 's' : ''} - ${money(total)}`, colSpan: 7, styles: { fillColor: [26, 26, 46], textColor: 255, fontStyle: 'bold' } }])
      rs.forEach((r, i) => body.push(cell(r, i)))
    })
  } else rows.forEach((r, i) => body.push(cell(r, i)))

  autoTable(doc, {
    startY: 25, head, body: body as never,
    styles: { fontSize: 9, cellPadding: 2, lineColor: [68, 68, 68], lineWidth: 0.2, textColor: 20 },
    headStyles: { fillColor: [240, 240, 240], textColor: 20 },
    columnStyles: { 0: { halign: 'center', cellWidth: 10 }, 2: { halign: 'right' }, 3: { halign: 'center' }, 4: { halign: 'center' } },
  })

  const name = `collection-sheet-${data.saturday}${data.guarantorCode ? `-${data.guarantorCode}` : ''}.pdf`
  const n = nativeTracker()
  if (n && typeof n.saveFile === 'function') {
    const b64 = doc.output('datauristring').split(',')[1] || ''
    await n.saveFile({ data: b64, name, mime: 'application/pdf' })
    return 'Sheet saved in your Downloads folder.'
  }
  doc.save(name)
  return ''
}
