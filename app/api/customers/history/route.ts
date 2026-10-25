import { NextRequest } from 'next/server'
import { apiHandler, getSession, ok, err } from '@/lib/api'
import { needFeature } from '@/lib/access'
import { customer as customerKeys } from '@/lib/features'
import { customerHistory, HistoryError } from '@/lib/customerHistory'

// Loan-by-loan payment history and repayment score of one customer. Access is checked in lib/customerHistory.ts.
export const GET = apiHandler(async (req: NextRequest) => {
  const session = await getSession(req)
  await needFeature(session, customerKeys('customersHistory'))
  const customerId = new URL(req.url).searchParams.get('customerId') || ''
  try {
    return ok(await customerHistory(session, customerId))
  } catch (e) {
    if (e instanceof HistoryError) return err(e.message)
    throw e
  }
})
