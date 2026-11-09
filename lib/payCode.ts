// The "pay code" shown in Payment Matching is the 4-digit number inside the customer's loan ID
// (GBN-7425 -> 7425, NGF-GBN-7425 -> 7425, NGF-GBN-7425R2 -> 7425). The number belongs to the customer and never changes.
export function payCodeFromLoanId(loanId?: string | null): string {
  const s = String(loanId || '').trim()
  const n = /(\d{4})R\d+\s*$/.exec(s) || /(\d{3,6})\s*$/.exec(s)
  return n ? n[1] : ''
}
