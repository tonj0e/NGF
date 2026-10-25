import { NextRequest } from 'next/server';
import { apiHandler, getSession, ok, err } from '@/lib/api'
import { requireFeature } from '@/lib/access';
import { readTable } from '@/lib/supabase-db';
import { companyTotals } from '@/lib/db';
import { calculateFinancialAnalytics } from '@/lib/financial';

export const maxDuration = 30;

export const GET = apiHandler(async (req: NextRequest) => {
  const session = await requireFeature(req, ['financialAnalytics']);   // Admin, or Staff the Admin gave it to

  let totals, capital
  try {
    [totals, capital] = await Promise.all([companyTotals(), readTable('Capital', { forceFresh: true })]);
  } catch {
    return err('Financial data unavailable. Please try again.');
  }

  const analyticsData = calculateFinancialAnalytics(totals, capital as any[], [], []);

  return ok(analyticsData);
});
