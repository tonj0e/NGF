import { countRows, selectRows, updateById } from '@/lib/supabase-db'
import { payCodeFromLoanId } from '@/lib/payCode'

// The customer's permanent 4-digit number (the "pay code"). Made once, when a new customer's bank file is made or the loan is
// disbursed, and never changed: a renewal keeps it. It is never the same as another customer's, a pending lead's or a guarantor's number.
export async function makePayNumber(): Promise<string> {
  for (let tries = 0; tries < 80; tries++) {
    const n = String(Math.floor(1000 + Math.random() * 9000))
    const [c, l, g, loans] = await Promise.all([
      countRows('Customers', qb => qb.eq('pay_number', n)),
      countRows('Leads', qb => qb.eq('pay_number', n)),
      countRows('Guarantors', qb => qb.eq('guarantor_number', n)),
      countRows('Loans', qb => qb.like('loan_id', `%-${n}`)),
    ])
    if (c + l + g + loans === 0) return n
  }
  throw new Error('Could not find a free customer number. Please try again.')
}

// New loan id: NGF-GBN-7425 for the first loan, NGF-GBN-7425R2, R3 ... for renewals (every loan keeps its own repayment history)
export function loanIdFor(guarantorCode: string, pay: string, loanNo = 1): string {
  return loanNo <= 1 ? `NGF-${guarantorCode}-${pay}` : `NGF-${guarantorCode}-${pay}R${loanNo}`
}

// A free loan id built from the customer's number; skips a number already taken
export async function freeLoanId(guarantorCode: string, pay: string, firstLoanNo: number): Promise<string> {
  for (let n = Math.max(1, firstLoanNo); n < firstLoanNo + 50; n++) {
    const id = loanIdFor(guarantorCode, pay, n)
    if ((await countRows('Loans', qb => qb.eq('loan_id', id))) === 0) return id
  }
  throw new Error('Could not make a loan number. Please try again.')
}

// The number a customer already owns: saved on the customer, else the 4 digits of their first loan id (and then saved)
export async function payNumberOfCustomer(customer: Record<string, string>): Promise<string> {
  if (customer['Pay Number']) return customer['Pay Number']
  const first = (await selectRows('Loans', qb => qb.eq('customer_id', customer['Customer ID']).order('created_at', { ascending: true }).limit(1))).rows[0]
  const digits = payCodeFromLoanId(first?.['Loan ID'])
  if (digits.length === 4) { await updateById('Customers', customer['Customer ID'], { 'Pay Number': digits }); return digits }
  const fresh = await makePayNumber()
  await updateById('Customers', customer['Customer ID'], { 'Pay Number': fresh })
  return fresh
}
