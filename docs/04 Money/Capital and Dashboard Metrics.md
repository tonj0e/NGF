---
title: Capital and Dashboard Metrics
section: Money
status: current
last_verified: 2026-10-17
tags: [ngf, money, capital, dashboard, analytics]
---
# Capital and Dashboard Metrics
**One line: the capital ledger and the exact formulas behind every dashboard card, plus the financial analytics and projection engines.**

## Key facts
| Item | Value |
|---|---|
| Capital API | `app/api/capital/route.ts` (Admin only): GET totals + entries, POST add, DELETE remove |
| Capital table | `Capital`: id `CAP...`, Type `Own` or `Investor`, Contributor, Amount, Date, Notes |
| UI for capital | Dev page (`DevPage.tsx:67-115`) |
| Dashboard API | `app/api/dashboard/route.ts`, page `components/pages/Dashboard.tsx` |
| Analytics | `app/api/financial-analytics/route.ts` + `lib/financial.ts` (Admin only) |
| Projection | `app/api/projection/route.ts` + `lib/projection.ts` (Admin only) |
| Menu | "Financial Analytics" in the Admin menu renders the same `Dashboard` component (`AppShell.tsx:193`) |

## Admin cards (formulas as code states them)
| Card | Source | Formula |
|---|---|---|
| Total Portfolio | `totalLoanAmount` | `myLoans.reduce(sum + Principal Amount)`; active loans only (`dashboard/route.ts:111`) |
| Available Capital | `availableCapital` | `totalCapital - totalPrincipal + totalCollected` (`:133`) |
| This Week Due | `thisWeekCollection` | sum of `Amount` of repayments with `Due Date === getNextSaturday()`, not Waived, loan not Closed/Completed (`:98-105`) |
| Month Collected | client | sum of the 14-day `weeklyCollections` series (`Dashboard.tsx:216`), not the API `monthCollected` |
| Interest Earned | `totalInterest` | `loans.reduce(sum + Interest Deduction)` over **all** loans (`:130`) |
| Recollection Rate | `recollectionRate` | `round(collected / due * 1000) / 10`, due = repayments with `Due Date <= today` and not Waived; 100 if nothing due (`:119-122`) |

Supporting terms: `totalCapital` = sum of all `Capital.Amount`; `totalPrincipal` = principal of **all** loans (any status); `totalCollected` = sum of Paid repayments (all).

## Other roles
| Role | Cards | Notes |
|---|---|---|
| Guarantor | My Active Loans, Pending Leads, Commission Earned | loans scoped by `Guarantor ID`; leads scoped to own |
| NGF AGENT | Assigned Verifications, Today's Due, Collected This Week | loans scoped by `Assigned Agent ID`; `todayDue` counts Pending rows due exactly today |
| Staff | none scoped | falls into the agent branch, finds no agent, so `myLoans` is empty |

- `weekCollected` = Paid rows with `Paid Date >= today - 6 days`, **not** scoped to the role (all branches).
- `monthCollected` (API) and `recollectionRate` are not role-scoped either.
- Admin also sees counts: activeCustomers, overdueLoans (active loans with a Pending row past due), renewalEligible (completed loans whose customer has no active loan).

## Capital ledger
- Interest and commission are deducted upfront at disbursement, so a loan lowers Available by its **principal**, and profit (Interest Deduction) sits in its own bucket, not in Available.
- `POST` coerces Type to `Investor` or else `Own`; Contributor defaults to `Owner` for Own. `DELETE` removes the row permanently.
- `/api/capital` returns `ownCapital`, `investorMoney`, `totalInterest`, `totalPrincipal`, `totalCollected`, `availableCapital`.

## Financial analytics
- `calculateFinancialAnalytics(loans, repayments, capital, collections, deposits)` builds assets, liabilities, equity and two waterfall charts.
- Cash & Bank = `totalCollected - totalNetDisbursed` (active loans); Loan Receivables = active principal; Invested Capital = `netCapital` when it differs from both.
- Liabilities: outstanding investor capital, other borrowings, then Owner's Equity = assets - liabilities.
- `collections` and `deposits` are passed in but unused.

## Projection
- `project()` simulates a revolving book: weekly repayment `R = (D + I) / T`; modes `none`, `fixed`, `all` (re-lend all cash). Defaults use product 10K10W: cash out = net disbursed + commission, profit = interest - commission, term 10 weeks, horizon 52 weeks, capital = live Available Capital.
- Returns periods (1 week, 1 month, term, 6 months, 1 year), total loans, profit, year return %.

## Rules and gotchas
- Known issue: `lib/financial.ts:79-103` filters with `l.status`, `c.type`, `c.amount` (camelCase) but receives raw DB rows with `Status`, `Type`, `Amount`. Active loans and capital sums come out empty, so assets/liabilities are mostly zero.
- Known issue: "This Week Due" uses `getNextSaturday()` (this Saturday + 7), so before Saturday it shows the Saturday after the upcoming one, while the subtitle says "Due this Saturday" (`dashboard/route.ts:94`).
- Known issue: Month Collected card is a 14-day sum, so it can be lower than the real month total.
- The `prev*` fields (`prevAvailableCapital`, `prevInterest`, ...) are never returned by the API, so those trend arrows do not show. Some trends are hard-coded 0.
- `Principal Repayments` in the assets waterfall subtracts the same collections it just added.
- Error text still says "Google Sheets is not responding"; the data now lives in Supabase.
- Cards read `Paid Date` as text; `monthCollected` calls `.startsWith` on it and would throw on a null.

## Related
- [[Money Brain]], [[Repayments and Collections]], [[Loan Products and Math]], [[Reports]], [[Roles and Permissions]], [[Data Access Layer]], [[Screens Map]]
