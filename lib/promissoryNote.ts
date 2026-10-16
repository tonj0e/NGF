import { APP_CONFIG } from './config'

// Editable promissory-note body template. Stored per-device in localStorage so it
// can be changed from the Dev page without a redeploy. Placeholders in {{...}} are
// filled from the lead. The surrounding layout (title, amount, place/date, signature,
// witnesses) is fixed; this template is the promise body.
export const PROMISSORY_TEMPLATE_KEY = 'ngf_promissory_template'

export const DEFAULT_PROMISSORY_BODY = `I, {{borrowerName}}, {{borrowerAddress}}, Bearing Aadhaar Number {{borrowerAadhaar}}, hereby promise to pay Mr. TONY JOSEPH, KOCHUPARAMBIL HOUSE EZHUPUNNA SOUTH P O PIN 688537, Aadhaar No. 8195 4464 1028, the sum of Rs. {{amount}}/- (Rupees {{amountWords}} Only) towards the money I have received from him as interest free loan, today {{date}}.

Payment is to be made fully on or before the {{dueDate}}.

IN WITNESS WHEREOF, I set my hand this {{date}} and acknowledge receipt of a complete copy of this instrument.`

export const PROMISSORY_PLACEHOLDERS = [
  '{{borrowerName}}', '{{borrowerAddress}}', '{{borrowerAadhaar}}',
  '{{amount}}', '{{amountWords}}', '{{place}}', '{{date}}', '{{dueDate}}',
]

export type NoteData = {
  borrowerName: string; borrowerAddress: string; borrowerAadhaar: string
  amount: string; amountWords: string; place: string; date: string; dueDate: string
}

function loanProductInfo(loanProduct: string) {
  return APP_CONFIG.LOAN_PRODUCTS.find(p => p.key === loanProduct || p.label === loanProduct)
}

// Indian-system number to words (sufficient for loan amounts)
export function numberToWords(num: number): string {
  if (!num || num < 0) return ''
  if (num === 0) return 'Zero'
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
  const two = (n: number) => n < 20 ? a[n] : b[Math.floor(n / 10)] + (n % 10 ? ' ' + a[n % 10] : '')
  const three = (n: number) => {
    const h = Math.floor(n / 100), r = n % 100
    return (h ? a[h] + ' Hundred' + (r ? ' ' : '') : '') + (r ? two(r) : '')
  }
  let n = Math.floor(num)
  let words = ''
  const crore = Math.floor(n / 10000000); n %= 10000000
  const lakh = Math.floor(n / 100000); n %= 100000
  const thousand = Math.floor(n / 1000); n %= 1000
  if (crore) words += three(crore) + ' Crore '
  if (lakh) words += two(lakh) + ' Lakh '
  if (thousand) words += two(thousand) + ' Thousand '
  if (n) words += three(n)
  return words.trim()
}

function fmtDate(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}-${m}-${y}`
}

function addWeeksIso(iso: string, weeks: number): string {
  const d = new Date(iso)
  d.setDate(d.getDate() + weeks * 7)
  return d.toISOString().slice(0, 10)
}

// Build the placeholder data for a lead
export function buildLeadNoteData(lead: any): NoteData {
  const info = loanProductInfo(lead.loanProduct)
  const principal = info?.principal || 0
  const todayIso = new Date().toISOString().slice(0, 10)
  const dueIso = info ? addWeeksIso(todayIso, info.durationWeeks) : ''
  return {
    borrowerName: lead.customerName || '',
    borrowerAddress: [lead.houseName, lead.address, lead.place].filter(Boolean).join(', '),
    borrowerAadhaar: lead.aadhaarNo || '',
    amount: principal ? principal.toLocaleString('en-IN') : '',
    amountWords: principal ? numberToWords(principal) : '',
    place: lead.place || '',
    date: fmtDate(todayIso),
    dueDate: dueIso ? fmtDate(dueIso) : '',
  }
}

function fill(template: string, d: NoteData): string {
  return template
    .replace(/\{\{borrowerName\}\}/gi, d.borrowerName)
    .replace(/\{\{borrowerAddress\}\}/gi, d.borrowerAddress)
    .replace(/\{\{borrowerAadhaar\}\}/gi, d.borrowerAadhaar)
    .replace(/\{\{amountWords\}\}/gi, d.amountWords)
    .replace(/\{\{amount\}\}/gi, d.amount)
    .replace(/\{\{place\}\}/gi, d.place)
    .replace(/\{\{dueDate\}\}/gi, d.dueDate)
    .replace(/\{\{date\}\}/gi, d.date)
}

const esc = (s: string) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string))

// Full printable promissory-note HTML (fixed layout + filled, editable body)
export function buildPromissoryHtml(bodyTemplate: string, d: NoteData): string {
  const body = esc(fill(bodyTemplate, d))
  return `<!doctype html><html><head><meta charset="utf-8"><title>Promissory Note — ${esc(d.borrowerName)}</title>
  <style>
    @page { size: A4; margin: 22mm 20mm; }
    * { box-sizing: border-box; }
    body { font-family: 'Times New Roman', Georgia, serif; color: #000; font-size: 15px; line-height: 1.7; margin: 0; }
    .title { text-align: center; font-size: 18px; font-weight: bold; letter-spacing: 1px; margin-bottom: 40px; }
    .amount { font-weight: bold; margin-bottom: 6px; }
    .placedate { text-align: right; margin-bottom: 34px; line-height: 1.6; }
    .body { white-space: pre-wrap; text-align: justify; margin-bottom: 56px; }
    .sign { margin-bottom: 8px; }
    .sign .name { margin-bottom: 28px; }
    .witnesses { margin-top: 60px; font-weight: bold; }
  </style></head>
  <body onload="window.print()">
    <div class="title">PROMISSORY NOTE</div>
    <div class="amount">Rs. ${esc(d.amount)}/-</div>
    <div class="placedate">PLACE: ${esc(d.place)}<br/>DATE: ${esc(d.date)}</div>
    <div class="body">${body}</div>
    <div class="sign">
      <div class="name">${esc(d.borrowerName)}</div>
      <div>${esc(d.borrowerAddress)}</div>
    </div>
    <div class="witnesses">WITNESSES</div>
  </body></html>`
}
