import { formatCurrency } from './utils';
import { Loan, Repayment } from '@/types';

interface CapitalRecord {
  type: string;
  contributor: string;
  amount: number;
  date: string;
}

interface CollectionRecord {
  amount: number;
  paymentDate: string;
  paymentMode: string;
}

interface DepositRecord {
  type: string;
  amount: number;
  date: string;
}

export interface FinancialSummary {
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  assetsChange: { value: number; label: string } | null;
  liabilitiesChange: { value: number; label: string } | null;
}

export interface AssetBreakdown {
  category: string;
  amount: number;
  percentage: number;
  color: string;
}

export interface LiabilityBreakdown {
  category: string;
  amount: number;
  percentage: number;
  color: string;
}

export interface WaterfallDataPoint {
  category: string;
  amount: number;
  cumulative: number;
  type: 'increase' | 'decrease' | 'total';
}

export interface FinancialAnalyticsData {
  summary: FinancialSummary;
  assetsBreakdown: AssetBreakdown[];
  liabilitiesBreakdown: LiabilityBreakdown[];
  assetsMovement: WaterfallDataPoint[];
  liabilitiesMovement: WaterfallDataPoint[];
  hasAccountingData: boolean;
  dataAsOf: string;
}

const ASSET_COLORS = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#dc2626', '#0891b2'];
const LIABILITY_COLORS = ['#dc2626', '#ea580c', '#7c3aed', '#2563eb', '#059669'];

function getColor(index: number, palette: string[]): string {
  return palette[index % palette.length];
}

/** Loan and repayment totals added up by the database (function company_totals) */
export interface LoanTotals {
  loanCount: number
  activePrincipal: number
  activeInterest: number
  activeCommission: number
  activeNetDisbursed: number
  paidTotal: number
  pendingTotal: number
}

export function calculateFinancialAnalytics(
  totals: LoanTotals,
  capital: CapitalRecord[],
  collections: CollectionRecord[],
  deposits: DepositRecord[]
): FinancialAnalyticsData {
  const today = new Date();
  const dataAsOf = today.toISOString().slice(0, 10);

  const totalLoanPrincipal = totals.activePrincipal;
  const totalInterestDeduction = totals.activeInterest;
  const totalGuarantorCommission = totals.activeCommission;
  const totalNetDisbursed = totals.activeNetDisbursed;
  const totalCollected = totals.paidTotal;
  const totalOutstanding = totals.pendingTotal;

  const capitalInvestments = capital.filter((c) => c.type === 'Investment' || c.type === 'Investor' || c.type === 'Own');
  const capitalWithdrawals = capital.filter((c) => c.type === 'Withdrawal');
  const capitalProfits = capital.filter((c) => c.type === 'Profit');
  const capitalLosses = capital.filter((c) => c.type === 'Loss');

  const totalCapitalIn = capitalInvestments.reduce((sum, c) => sum + Number(c.amount || 0), 0);
  const totalCapitalOut = capitalWithdrawals.reduce((sum, c) => sum + Number(c.amount || 0), 0);
  const totalProfit = capitalProfits.reduce((sum, c) => sum + Number(c.amount || 0), 0);
  const totalLoss = capitalLosses.reduce((sum, c) => sum + Number(c.amount || 0), 0);

  const netCapital = totalCapitalIn - totalCapitalOut + totalProfit - totalLoss;

  const cashOnHand = totalCollected - totalNetDisbursed;

  const hasAccountingData = capital.length > 0 || totals.loanCount > 0;

  if (!hasAccountingData) {
    return {
      summary: {
        totalAssets: 0,
        totalLiabilities: 0,
        totalEquity: 0,
        assetsChange: null,
        liabilitiesChange: null,
      },
      assetsBreakdown: [],
      liabilitiesBreakdown: [],
      assetsMovement: [],
      liabilitiesMovement: [],
      hasAccountingData: false,
      dataAsOf,
    };
  }

  const assetsBreakdown: AssetBreakdown[] = [];
  let assetsTotal = 0;

  if (cashOnHand > 0) {
    assetsBreakdown.push({
      category: 'Cash & Bank Balances',
      amount: cashOnHand,
      percentage: 0,
      color: getColor(0, ASSET_COLORS),
    });
    assetsTotal += cashOnHand;
  }

  if (totalLoanPrincipal > 0) {
    assetsBreakdown.push({
      category: 'Loan Receivables (Outstanding Principal)',
      amount: totalLoanPrincipal,
      percentage: 0,
      color: getColor(1, ASSET_COLORS),
    });
    assetsTotal += totalLoanPrincipal;
  }

  if (netCapital > 0 && netCapital !== cashOnHand && netCapital !== totalLoanPrincipal) {
    assetsBreakdown.push({
      category: 'Invested Capital',
      amount: netCapital,
      percentage: 0,
      color: getColor(2, ASSET_COLORS),
    });
    assetsTotal += netCapital;
  }

  assetsBreakdown.forEach((asset) => {
    asset.percentage = assetsTotal > 0 ? Math.round((asset.amount / assetsTotal) * 1000) / 10 : 0;
  });

  const liabilitiesBreakdown: LiabilityBreakdown[] = [];
  let liabilitiesTotal = 0;

  const investorCapital = capital.filter((c) => c.type === 'Investor');
  const totalInvestorCapital = investorCapital.reduce((sum, c) => sum + Number(c.amount || 0), 0);
  const investorWithdrawals = capital.filter((c) => c.type === 'Withdrawal' && c.contributor && c.contributor.toLowerCase().includes('investor'));
  const totalInvestorWithdrawals = investorWithdrawals.reduce((sum, c) => sum + Number(c.amount || 0), 0);
  const outstandingInvestorCapital = Math.max(0, totalInvestorCapital - totalInvestorWithdrawals);

  if (outstandingInvestorCapital > 0) {
    liabilitiesBreakdown.push({
      category: 'Outstanding Investor Capital',
      amount: outstandingInvestorCapital,
      percentage: 0,
      color: getColor(0, LIABILITY_COLORS),
    });
    liabilitiesTotal += outstandingInvestorCapital;
  }

  const otherBorrowings = capital.filter((c) => c.type === 'Investment' && c.contributor && !c.contributor.toLowerCase().includes('investor') && !c.contributor.toLowerCase().includes('own'));
  const totalOtherBorrowings = otherBorrowings.reduce((sum, c) => sum + Number(c.amount || 0), 0);
  const otherWithdrawals = capital.filter((c) => c.type === 'Withdrawal' && c.contributor && !c.contributor.toLowerCase().includes('investor') && !c.contributor.toLowerCase().includes('own'));
  const totalOtherWithdrawals = otherWithdrawals.reduce((sum, c) => sum + Number(c.amount || 0), 0);
  const outstandingOtherBorrowings = Math.max(0, totalOtherBorrowings - totalOtherWithdrawals);

  if (outstandingOtherBorrowings > 0) {
    liabilitiesBreakdown.push({
      category: 'Other Borrowings',
      amount: outstandingOtherBorrowings,
      percentage: 0,
      color: getColor(1, LIABILITY_COLORS),
    });
    liabilitiesTotal += outstandingOtherBorrowings;
  }

  const totalEquity = assetsTotal - liabilitiesTotal;

  if (totalEquity > 0) {
    liabilitiesBreakdown.push({
      category: "Owner's Equity",
      amount: totalEquity,
      percentage: 0,
      color: getColor(2, LIABILITY_COLORS),
    });
    liabilitiesTotal += totalEquity;
  }

  liabilitiesBreakdown.forEach((liability) => {
    liability.percentage = liabilitiesTotal > 0 ? Math.round((liability.amount / liabilitiesTotal) * 1000) / 10 : 0;
  });

  const assetsMovement: WaterfallDataPoint[] = [];
  let cumulativeAssets = 0;

  const openingCash = Math.max(0, cashOnHand - (totalCollected - totalNetDisbursed));
  if (openingCash > 0) {
    cumulativeAssets += openingCash;
    assetsMovement.push({ category: 'Opening Cash Balance', amount: openingCash, cumulative: cumulativeAssets, type: 'increase' });
  }

  const loanDisbursements = totals.activeNetDisbursed;
  if (loanDisbursements > 0) {
    cumulativeAssets += loanDisbursements;
    assetsMovement.push({ category: 'Loan Disbursements', amount: loanDisbursements, cumulative: cumulativeAssets, type: 'increase' });
  }

  const collectionsReceived = totalCollected;
  if (collectionsReceived > 0) {
    cumulativeAssets += collectionsReceived;
    assetsMovement.push({ category: 'Collections Received', amount: collectionsReceived, cumulative: cumulativeAssets, type: 'increase' });
  }

  const principalRepaid = totals.paidTotal;
  if (principalRepaid > 0) {
    cumulativeAssets -= principalRepaid;
    assetsMovement.push({ category: 'Principal Repayments', amount: -principalRepaid, cumulative: cumulativeAssets, type: 'decrease' });
  }

  const operationalExpenses = totalGuarantorCommission + totalInterestDeduction;
  if (operationalExpenses > 0) {
    cumulativeAssets -= operationalExpenses;
    assetsMovement.push({ category: 'Operational Expenses', amount: -operationalExpenses, cumulative: cumulativeAssets, type: 'decrease' });
  }

  assetsMovement.push({ category: 'Closing Assets', amount: assetsTotal, cumulative: assetsTotal, type: 'total' });

  const liabilitiesMovement: WaterfallDataPoint[] = [];
  let cumulativeLiabilities = 0;

  const openingInvestorCapital = outstandingInvestorCapital;
  if (openingInvestorCapital > 0) {
    cumulativeLiabilities += openingInvestorCapital;
    liabilitiesMovement.push({ category: 'Opening Investor Capital', amount: openingInvestorCapital, cumulative: cumulativeLiabilities, type: 'increase' });
  }

  const newInvestorCapital = investorCapital.reduce((sum, c) => sum + Number(c.amount || 0), 0);
  if (newInvestorCapital > 0) {
    cumulativeLiabilities += newInvestorCapital;
    liabilitiesMovement.push({ category: 'New Investor Capital', amount: newInvestorCapital, cumulative: cumulativeLiabilities, type: 'increase' });
  }

  const investorRedemptions = investorWithdrawals.reduce((sum, c) => sum + Number(c.amount || 0), 0);
  if (investorRedemptions > 0) {
    cumulativeLiabilities -= investorRedemptions;
    liabilitiesMovement.push({ category: 'Investor Redemptions', amount: -investorRedemptions, cumulative: cumulativeLiabilities, type: 'decrease' });
  }

  const profitAllocation = totalProfit;
  if (profitAllocation > 0) {
    cumulativeLiabilities += profitAllocation;
    liabilitiesMovement.push({ category: 'Profit Allocation', amount: profitAllocation, cumulative: cumulativeLiabilities, type: 'increase' });
  }

  liabilitiesMovement.push({ category: 'Closing Liabilities & Equity', amount: liabilitiesTotal, cumulative: liabilitiesTotal, type: 'total' });

  return {
    summary: {
      totalAssets: assetsTotal,
      totalLiabilities: liabilitiesTotal - totalEquity,
      totalEquity: totalEquity,
      assetsChange: null,
      liabilitiesChange: null,
    },
    assetsBreakdown,
    liabilitiesBreakdown,
    assetsMovement,
    liabilitiesMovement,
    hasAccountingData: true,
    dataAsOf,
  };
}

export function formatFinancialCurrency(amount: number): string {
  return formatCurrency(amount);
}