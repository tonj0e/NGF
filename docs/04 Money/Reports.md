---
title: Reports
section: Money
status: current
last_verified: 2026-10-17
tags: [ngf, money, reports]
---
# Reports
**One line: the Reports page is a client-side view over loans, repayments, settlements, customers and guarantors, with four tabs and no dedicated API.**

## Key facts
| Item | Value |
|---|---|
| Page | `components/pages/ReportsPage.tsx`, view key `reports` |
| Tabs | Summary, Transactions, Customer Transactions, Guarantor Transactions (`ReportsPage.tsx:79`) |
| Data | `/api/loans?filter=all`, `/api/repayments?mode=all&pageSize=5000`, `/api/settlements`, `/api/customers`, `/api/staff` (`:43-47`) |
| Access | Admin menu item; Staff only if granted `reports` in Dev -> Branches (`lib/config.ts:22`); not in Guarantor or Agent menus (`components/AppShell.tsx:66-108`) |

## How it works
1. On mount the page fetches all five endpoints in parallel and computes everything in the browser.
2. Summary cards (`ReportsPage.tsx:55-68`):
   - Total Portfolio Value = sum of `principal` of Active loans.
   - Active Customers = customers with `loanStatus` Active; completed loan count shown as subtitle.
   - This / Last Month Collected = Paid repayments whose `Paid Date` starts with the current / previous `YYYY-MM`.
   - Total Collected = all Paid repayment amounts.
   - Overdue Amount = Pending or Overdue rows with `Due Date` before today.
3. Transactions tab lists months that have a Paid date, a loan start or a settlement date, filtered by a year selector (defaults to the current year).
4. Customer Transactions: search a customer, then sub-tabs Repayment Chart, Transactions, Transaction History.
5. Guarantor Transactions: per guarantor cards. Earned = sum of loan commissions (matched by name or code); Balance = Earned minus `Amount Submitted` of settlement rows with Entity Type `GuarantorCommission` only (`ReportsPage.tsx:737-739`). This is the correct filter; `GuarantorPage.tsx:441` lacks it.

## Rules and gotchas
- Known issue: "today" and the month keys use `new Date().toISOString()` (UTC), not IST (`ReportsPage.tsx:53-54`). Around midnight IST the month can be a day late.
- `last month` uses `setMonth(getMonth() - 1)`, which misbehaves on day 29-31 (can skip back two months or stay in the same month).
- The repayment fetch requests up to 5000 rows in one call (`paginate` with `pageSize=5000`); a bigger book will be truncated silently.
- Numbers here use paid amounts from `Repayments`, same as the dashboard, but are not role-scoped beyond what each API returns. Compare with [[Capital and Dashboard Metrics]].
- The Dashboard "Total Portfolio" uses active loans' principal from the server; this page uses the loans API list. They should agree.

## Related
- [[Money Brain]], [[Capital and Dashboard Metrics]], [[Repayments and Collections]], [[Settlements]], [[Roles and Permissions]], [[Screens Map]]
