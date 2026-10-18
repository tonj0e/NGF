// The "pay code" shown in Payment Matching is the 4-digit number already inside the customer's loan ID
// (GBN-7425 -> 7425). The loan ID is unique per guarantor, so no separate code is stored or generated.
export function payCodeFromLoanId(loanId?: string | null): string {
  const m = /(\d{3,6})\s*$/.exec(String(loanId || '').trim())
  return m ? m[1] : ''
}
