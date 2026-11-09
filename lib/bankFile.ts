import { buildXls, excelDateSerial, type XlsCell } from './xlsWriter'

// The bank payment file (South Indian Bank bulk portal). The portal reads it by machine, so the format is fixed:
// .xls, one sheet, these 25 columns in this order, nothing added or removed. Rules (from the bank's own sample NGC-09112026.xls):
//  A  S = beneficiary account is at South Indian Bank (IFSC starts SIBL), N = any other bank (NEFT)
//  B  reference number = YYYYMMDD + running number of the day (01..99, 100, 101 ...), never repeated in any file, ever
//  D  transaction date = the day the file is made
//  O..R beneficiary IFSC, account type 10 (savings), account number (kept as text, leading zeros matter), name as in the bank
//  W  remarks = "LEND " + the customer's own 4-digit number
export const BANK_HEADERS = ['Header', 'Reference Number', 'Amount', 'Transaction date', 'Sender IFSC', 'Sender Account Type', 'SenderA/c Number', 'Sender Name', 'Ack Mode SMS/EML', 'Mob/Email',
  'Send Ad1', 'Send Ad2', 'Send Ad3', 'Send Ad4', 'Benef IFSC', 'Benef Ac/Type', 'BenefA/C No', 'Benf A/c Name', 'Benef Ad1', 'Benef Ad2', 'Benef Ad3', 'Benef Ad4', 'Remarks', 'Purpose code', 'Country code']

// Same in every row ("as it is"). Admin can change them in Settings (key bank:sender, JSON) without a code change.
export type BankSender = { ifsc: string; accountType: number; account: string; name: string; ack: string; mobile: string; address: string; purposeCode: string; countryCode: string; benefAccountType: number }
export const DEFAULT_SENDER: BankSender = { ifsc: 'SIBN0000768', accountType: 11, account: '768073000000370', name: 'NGF FINCORP', ack: 'SMS', mobile: '9999999999', address: 'INDIA', purposeCode: 'A1234', countryCode: 'IN', benefAccountType: 10 }

export type BankLine = { reference: number; amount: number; ifsc: string; account: string; name: string; remarks: string }

export const normIfsc = (v: string) => String(v || '').replace(/\s+/g, '').toUpperCase()
export const normAccount = (v: string) => String(v || '').replace(/[\s-]+/g, '')
export const normName = (v: string) => String(v || '').replace(/\s+/g, ' ').trim()
export const bankMode = (ifsc: string): 'S' | 'N' => normIfsc(ifsc).startsWith('SIBL') ? 'S' : 'N'

/** What is wrong with a customer's bank details (empty list = ready). */
export function bankIssues(d: { ifsc?: string; account?: string; name?: string }): string[] {
  const out: string[] = []
  const ifsc = normIfsc(d.ifsc || ''), acc = normAccount(d.account || ''), name = normName(d.name || '')
  if (!ifsc) out.push('IFSC code missing'); else if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) out.push('IFSC code is not valid (4 letters, a zero, then 6 letters or digits)')
  if (!acc) out.push('Account number missing'); else if (!/^\d{9,18}$/.test(acc)) out.push('Account number must be 9 to 18 digits only')
  if (!name) out.push('Name in the bank account missing'); else if (!/^[A-Za-z0-9 .&'/-]+$/.test(name)) out.push('Name in the bank has a character the bank may reject')
  return out
}

export function bankFileName(ymd: string, fileNo: number): string {
  const [y, m, d] = ymd.split('-')
  return `NGC-${d}${m}${y}${fileNo < 10 ? '0' + fileNo : fileNo}`
}
export function bankReference(ymd: string, seq: number): number {
  return Number(ymd.replace(/-/g, '') + (seq < 10 ? '0' + seq : String(seq)))
}

export function buildBankXls(ymd: string, lines: BankLine[], sender: BankSender = DEFAULT_SENDER): Buffer {
  const s = (v: string): XlsCell => ({ t: 's', v })
  const head: XlsCell[] = BANK_HEADERS.map((h, i) => (i === 6 || i === 16 ? { t: 's0', v: h } : s(h)))   // two header cells carry the "0" format in the bank's sample
  const date = excelDateSerial(ymd)
  const rows: (XlsCell | null)[][] = [head, ...lines.map(l => [
    s(bankMode(l.ifsc)), { t: 'n', v: l.reference }, { t: 'n', v: l.amount }, { t: 'date', v: date },
    s(sender.ifsc), { t: 'n', v: sender.accountType }, { t: 'int', v: Number(sender.account) }, s(sender.name), s(sender.ack), { t: 'n', v: Number(sender.mobile) },
    s(sender.address), s(sender.address), s(sender.address), s(sender.address),
    s(normIfsc(l.ifsc)), { t: 'n', v: sender.benefAccountType }, { t: 'text', v: normAccount(l.account) }, s(normName(l.name)),
    s(sender.address), s(sender.address), s(sender.address), s(sender.address),
    s(l.remarks), s(sender.purposeCode), s(sender.countryCode),
  ] as (XlsCell | null)[])]
  return buildXls({ name: 'Sheet1', colWidths: [3218, 3218, 3218, 3218, 3218, 3218, 4754, 3218, 3218, 3218, 3218, 3218, 3218, 3218, 3218, 3218, 4681, 4242, 3218, 3218, 3218, 3218, 3218, 3218, 3218], rows })
}
