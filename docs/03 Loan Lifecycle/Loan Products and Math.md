---
title: Loan Products and Math
section: 03 Loan Lifecycle
status: current
last_verified: 2026-10-17
tags: [ngf, loan-lifecycle, products, math]
---
# Loan Products and Math
**How loan terms are defined and turned into a weekly Saturday schedule, exactly as the code does it.**

## Key facts
Built-in product (`lib/config.ts:9`):

| Field | 10K10W |
|---|---|
| principal | 10000 |
| interestDeduction | 1500 (flat, 15% of principal) |
| guarantorCommission | 500 |
| netDisbursed | 8500 (= 10000 - 1500 - 500) |
| durationWeeks | 10 |
| weeklyCollection | 1000 |
| totalCollection | 10000 (= 10 x 1000) |

The customer repays 10000 on 10000 principal. The 1500 interest and 500 commission are taken out of the disbursement, not added to repayments. Who receives what: [[Commissions and Payouts]].

## How it works
- Products live in the `LoanProducts` table (columns Key, Label, Principal, Duration Weeks, Weekly Collection, Last Week Collection, Total Collection, Interest Deduction, Guarantor Commission, Net Disbursed, Status). Code: `lib/loanProducts.ts`.
- The table is seeded from `APP_CONFIG.LOAN_PRODUCTS` only when empty (`defaults()`, `getLoanProducts`).
- `GET /api/loan-products` lists non-`Deleted` products for any signed-in role. POST and DELETE are Admin only. Delete is soft (`Status = Deleted`); `findLoanProduct` still resolves deleted keys so old data works.
- Custom product POST (`app/api/loan-products/route.ts:20`): Admin enters label, principal, weeks, weekly, optional last-week, interest and commission as amounts, not percentages.
  - `totalCollection = weekly x (weeks - 1) + lastWeek` (lastWeek defaults to weekly).
  - `netDisbursed = principal - interest - commission`.
  - Key = label letters/digits upper-cased, first 10 chars, with `2`, `3` ... added on a clash.
  - Only label, principal, weeks and weekly must be > 0. Nothing ties total to principal or checks net > 0.
- `approveLoan` copies principal, interest, commission, net, weekly, weeks and total onto the loan row (`app/api/leads/[leadId]/route.ts:380`). The loan stores no product key; the lead keeps it.
- Schedule: `Start Date = getNextSaturday()` in IST (`lib/supabase-db.ts:430`; today if it is already Saturday). Week w (0-based) is due `start + 7w` days. The last week is `lastWeekCollection`, all others `weeklyCollection`. `End Date = start + (weeks - 1) x 7`.
- `lib/financial.ts` is not loan math. It builds the Financial Analytics balance-sheet view (assets, liabilities, equity) from loans, repayments and capital.

## Rules and gotchas
- Known issue: products are read from two places.
  - `approveLoan` reads the DB (`findLoanProduct`), so custom products work at approval.
  - `components/pages/SubmitLeadPage.tsx:114` and `ImportCustomerPage.tsx:106` list only `APP_CONFIG.LOAN_PRODUCTS`.
  - `app/api/import-customer/route.ts:65` rejects any key not in `APP_CONFIG` and writes every week at `weeklyCollection`, ignoring `lastWeekCollection`.
  - So a custom product can only be applied by Admin/Staff picking it in the lead detail dropdown at approval.
- Built-in `defaults()` sets `lastWeekCollection = weeklyCollection`; custom products may differ. `fromRow` derives last week from total when the column is empty.
- If `findLoanProduct` finds nothing, `approveLoan` silently uses the first product (`:312`).
- Changing the 10K10W constants in `config.ts` does not change the DB row once it is seeded.
- A renewal ignores products and copies the previous loan's terms ([[Renewals]]).
- Foreclose, settle balance and close account are Admin-only PATCH actions in `app/api/loans/route.ts`. See [[Repayments and Collections]] and [[Settlements]].

## Related
[[Loan Lifecycle Brain]] [[Lead to Loan]] [[Renewals]] [[Customers and Import]] [[Commissions and Payouts]] [[Tables]]
