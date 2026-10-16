import { NextRequest } from 'next/server';
import { apiHandler, getSession, ok, err } from '@/lib/api';
import { readTable } from '@/lib/supabase-db';
import { calculateFinancialAnalytics } from '@/lib/financial';

export const maxDuration = 30;

export const GET = apiHandler(async (req: NextRequest) => {
  const session = await getSession(req);

  if (session.role !== 'Admin') {
    return err('Financial Analytics is only available for Admin users.', 403);
  }

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Financial Analytics timeout')), 25000)
  );

  let loans: any[], repayments: any[], capital: any[], collections: any[], deposits: any[];
  try {
    [loans, repayments, capital, collections, deposits] = await Promise.race([
      Promise.all([
        readTable('Loans', { forceFresh: true }),
        readTable('Repayments', { forceFresh: true }),
        readTable('Capital', { forceFresh: true }),
        readTable('Collections', { forceFresh: true }),
        readTable('Deposits', { forceFresh: true }),
      ]),
      timeout,
    ]);
  } catch {
    return err('Financial data unavailable — Google Sheets is not responding. Please try again.');
  }

  const analyticsData = calculateFinancialAnalytics(loans, repayments, capital, collections, deposits);

  return ok(analyticsData);
});