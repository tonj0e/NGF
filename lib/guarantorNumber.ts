import { countRows } from '@/lib/supabase-db'

// Guarantor number: 4 digits, unique among guarantors and never equal to the 4 digits of any customer loan id.
export async function makeGuarantorNumber(): Promise<string> {
  for (let tries = 0; tries < 80; tries++) {
    const n = String(Math.floor(1000 + Math.random() * 9000))
    const [g, l, c, ld] = await Promise.all([
      countRows('Guarantors', qb => qb.eq('guarantor_number', n)),
      countRows('Loans', qb => qb.like('loan_id', `%-${n}`)),
      countRows('Customers', qb => qb.eq('pay_number', n)),
      countRows('Leads', qb => qb.eq('pay_number', n)),
    ])
    if (g + l + c + ld === 0) return n
  }
  throw new Error('Could not find a free guarantor number. Please try again.')
}

// Used when a new loan id is made: true when the 4 digits already belong to a guarantor.
export async function isGuarantorNumber(n: string | number): Promise<boolean> {
  return (await countRows('Guarantors', qb => qb.eq('guarantor_number', String(n)))) > 0
}
