---
title: Customer History and Score
section: Loan Lifecycle
status: current
last_verified: 2026-10-19
tags: [ngf, loans, history, score, repayments]
---
# Customer History and Score
**Every loan a customer has taken, every weekly payment with the time it was recorded, and the **NGF Score** (our own 0-850 score from payments AND staff reviews; it is not a CIBIL score).**

> **2026-10-21:** renamed to NGF Score, now includes the star reviews, and shows on every customer (list cards, detail header, My Customers, renewal search) as a chip (`components/ui/NgfScoreBadge.tsx`). List scores come from `bulkScores()` in `lib/customerHistory.ts` (same rules as the History tab).

Customers → open a customer → **History & Score** tab (next to Customer Details, Transaction, Reviews, Loans & Payments). Guarantors see it for their own customers; agents for customers assigned to them.

## Loan numbers
- **Loan ID**: guarantor code + 4 random digits, e.g. `GRV-8163` (Revathy), `GBN-xxxx` (Bindhu). Unique per guarantor (`makeLoanId` in `app/api/leads/[leadId]/route.ts` and `app/api/import-customer/route.ts`).
- **Loan account number**: `NGF000001`, `NGF000002` ... one per loan, unique across the whole database. Assigned by the database itself (`loans.loan_account_no`, default from sequence `loan_account_seq`, unique index), so every code path that creates a loan gets one. Shown in the customer header, History tab, `/api/customers` (`loanAccountNo`) and `/api/loans`.
- Migration `2026-10-19-loan-account-number.sql` (backfilled the existing loan as `NGF000001`).

## One customer, many loans
`loans` used to have a UNIQUE index on `customer_id`, which would have rejected every renewal. Migration `2026-10-19-allow-multiple-loans-per-customer.sql` removed it. `customers.active_loan_id` still points at the current loan; older loans remain as history.

## What is recorded for each payment
The moment a payment is entered is `collections.created_at` (written when a repayment is marked Paid, from the Collection screen, Repay page or Payment Matching). The history shows: week, due Saturday, amount, mode, UTR (UPI), who recorded it, when, and whether it was on time. Rows without a timestamp (older data) fall back to `repayments.paid_date` and show "time not recorded".

## Score rules (`lib/creditScore.ts` `SCORE_RULES`: change numbers there)
These are the owner's first draft; **to be finalised with the owner**.
- Recorded by **3:30 pm IST on its Saturday** = on time, no penalty (earlier Saturdays or any earlier day also count).
- Finishing a 10-week loan adds points: 1st +200, 2nd +200, 3rd +200, 4th +150, 5th +100, so a perfect customer goes 200, 400, 600, 750, 850 and then stays frozen at 850 (about 4.7 cycles fit in a year).
- Paid late: -10, plus -10 for each further full week of delay. A past-due week still unpaid: -20 per week. Score never goes below 0 or above 850.
- Bands: Excellent 750+, Good 600+, Fair 400+, Building 1+, New (no score yet).
- **Reviews** (the 1-5 stars staff give when collecting a payment, stored in the repayment notes as `Review: 4★ ...`): 5★ +4, 4★ +2, 3★ 0, 2★ -4, 1★ -8 per reviewed payment, and reviews can move the score by at most 100 either way (`SCORE_RULES.reviewPoints`, `reviewCap`). The History tab splits the score into completed loans, reviews and late/overdue.
- Only completed loans earn points; the card shows progress ("2 of 10 weeks paid, completing it adds +200").
- Open question from the owner's message: the cutoff was said as both 3:30 pm and 12 noon; 3:30 pm is used. Recording time depends on staff entering payments promptly: late data entry looks like a late payment.

## Code
`lib/creditScore.ts` (pure scoring), `lib/customerHistory.ts` (load + access), `app/api/customers/history/route.ts`, `components/customers/CustomerHistory.tsx`, tab wired in `components/pages/CustomersPage.tsx`.

## Tested (2026-10-19)
Score unit scenarios (0 to 7 clean loans, 3:29 vs 3:31 pm, late weeks, overdue, legacy rows), a 10-check API test with a temporary two-loan customer (deleted), phone-width screenshot with real data, insert of two loans checking account numbers are automatic and duplicates are refused.

## Related
[[Loan Lifecycle Brain]], [[Lead to Loan]], [[Renewals]], [[Repayments and Collections]], [[Payment Matching]], [[Tables]]
