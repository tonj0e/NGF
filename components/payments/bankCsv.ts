// Reads a bank-statement CSV export and returns the credit rows that carry a UTR.
// Banks differ, so columns are found by header name; the UTR falls back to the 12-digit number in the narration.
export type BankRow = { utr: string; date: string; amount: number; payer: string; remark: string }

function splitCsv(text: string): string[][] {
  const delim = (text.split('\n', 1)[0].match(/\t/g)?.length || 0) > 2 ? '\t' : (text.split('\n', 1)[0].match(/;/g)?.length || 0) > (text.split('\n', 1)[0].match(/,/g)?.length || 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = [], cell = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') q = false
      else cell += c
    } else if (c === '"') q = true
    else if (c === delim) { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some(x => x.trim())) rows.push(row)
      row = []
    } else cell += c
  }
  row.push(cell)
  if (row.some(x => x.trim())) rows.push(row)
  return rows
}

function toIsoDate(raw: string): string {
  const s = raw.trim()
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{1,2})[\/\-. ](\d{1,2})[\/\-. ](\d{2,4})/)
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

const num = (s: string) => Number(String(s || '').replace(/[₹,\s]/g, '').replace(/cr$/i, '')) || 0

export function parseBankCsv(text: string): BankRow[] {
  const rows = splitCsv(text.replace(/^﻿/, ''))
  const hi = rows.findIndex(r => r.filter(c => c.trim()).length >= 3 && r.some(c => /date/i.test(c)) && r.some(c => /(credit|deposit|amount|cr)/i.test(c)))
  if (hi < 0) return []
  const head = rows[hi].map(h => h.trim().toLowerCase())
  const find = (...res: RegExp[]) => { for (const re of res) { const i = head.findIndex(h => re.test(h)); if (i >= 0) return i } return -1 }
  const cUtr = find(/utr/, /(txn|transaction)\s*(id|no|ref)/, /ref(erence)?\s*(no|number|id)?$/, /chq|cheque/)
  const cCredit = find(/credit/, /deposit/, /^cr\b/, /amount\s*\(?cr/)
  const cAmount = cCredit >= 0 ? cCredit : find(/^amount/, /amount/)
  const cDate = find(/txn\s*date|transaction\s*date|value\s*date/, /^date/, /date/)
  const cNarr = find(/narration/, /description/, /particulars/, /remark/, /details/)
  if (cAmount < 0) return []
  const out: BankRow[] = []
  for (const r of rows.slice(hi + 1)) {
    const amount = num(r[cAmount])
    if (amount <= 0) continue
    const narr = cNarr >= 0 ? (r[cNarr] || '').trim() : ''
    let utr = cUtr >= 0 ? (r[cUtr] || '').replace(/[\s-]+/g, '').toUpperCase() : ''
    if (!/^[A-Z0-9]{8,30}$/.test(utr)) utr = narr.match(/\b\d{12}\b/)?.[0] || ''
    if (!utr) continue
    out.push({ utr, amount, date: cDate >= 0 ? toIsoDate(r[cDate] || '') : '', payer: narr.slice(0, 120), remark: narr.slice(0, 300) })
  }
  return out
}
