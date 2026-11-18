---
title: Customers and Import
section: 03 Loan Lifecycle
status: current
last_verified: 2026-10-17
tags: [ngf, loan-lifecycle, customers, import]
---
# Customers and Import
**Who sees which customers, how legacy customers are imported, and what edit and delete really do.**

## Key facts
- API: `app/api/customers/route.ts` (GET, PATCH, DELETE). Pages: `CustomersPage.tsx`, `MyCustomersPage.tsx`, `ImportCustomerPage.tsx`.
- Customers are created only by `approveLoan` ([[Lead to Loan]]) or by import.
- Customer status (`Active`, `Inactive`, `Suspended`) is separate from loan status.

| Role | GET /api/customers returns | Menu entry |
|---|---|---|
| Admin | all customers | Customers (tabs: All, Active Loans, Renewal Eligible, Completed Loans) |
| Staff | all customers (no branch filter) | Customers, if granted the `customers` feature |
| Guarantor | customers whose `Guarantor ID` is theirs, or whose loan has their guarantor | My Customers |
| NGF AGENT | customers whose loan has this agent as `Assigned Agent ID` | Assigned Customers |

## How it works
- GET joins customers with the loan (`Active Loan ID`, else any loan for the customer), guarantor, agent and lead. Nominee, Aadhaar and all six photo URLs come from the lead. `isOverdue` is true if any `Pending` repayment is past due (IST). It has a 25 s timeout.
- Speed (2026-11-19, round 2): a paged or `?id=` GET, and a no-page GET for anyone but Admin (guarantor, Staff branches, agent), is one database call to the function `customers_page` (migration `20261119150000_customers_page.sql`): page + exact count + loans, weeks, first collection times, leads, guarantor and agent names. The route still works out the scope (guarantor ids, agent id) first and passes it in. Until the function is applied, or if it fails, the route uses the old separate reads (page, then loans + leads, then guarantors + agents + weeks, then collections) and does not retry the function for 10 minutes. Both ways build the rows in the same `enrichCustomers`, so the output is the same; a page past the last row still fails with "Requested range not satisfiable".
- My Customers (`MyCustomersPage.tsx`) reads the same endpoint and embeds `LoansPage` (active and overdue filters) plus a detail view with photos.
- Edit: `PATCH /api/customers` (Admin, Staff). Updates name, phone, address, house, place, occupation, account number, IFSC, PAN. New photos go to Drive and the URL is written to the **lead** row, not the customer (`customers/route.ts:135`).
- Delete: `DELETE /api/customers` (Admin, Staff) removes repayments, then loans, then the customer row, one by one. The lead stays (status `Converted`) and Drive files stay. Deleting a lead does the reverse cascade ([[Lead to Loan]]).
- Import (`POST /api/import-customer`, Admin only) brings in a customer from the old system:
  - Required: name, phone, guarantor, product, disburse date. Optional: agent, joined date, nominee, bank details, six photos, `weekStatusList` (per week `Paid`, `Delayed`, `Pending`).
  - Creates a `Converted` lead (`Admin Final Decision = Imported`), a customer, a loan and one repayment per week.
  - Customer id is `NGF<guarantorCode><4 digits>`, unlike approval ids.
  - Start date = first Saturday on or after the disburse date (IST). `Created At` = joined date.
  - `Paid` weeks get `Paid Date` = due date; `Delayed` weeks get note "Delayed (imported)". If all weeks are `Paid`, the loan becomes `Completed`.

## Rules and gotchas
- Known issue: the UI shows Edit and Delete only to Admin (`CustomersPage.tsx:628`, `:790`), but the API also allows Staff. Customers GET has no branch scoping for Staff ([[Roles and Permissions]]).
- Known issue: import accepts only built-in products and uses `weeklyCollection` for every week ([[Loan Products and Math]]).
- Known issue: import does no duplicate check on phone or Aadhaar, and a fully-paid import still sets `Active Loan ID` on the customer.
- Customer PATCH uses `body.x || old` for most fields, so they cannot be blanked.
- Deletes are not transactional; a failure midway leaves partial data.
- A customer can hold only one loan row (UNIQUE `loans.customer_id`, `supabase_schema.sql:182`). See [[Renewals]].

## Related
[[Loan Lifecycle Brain]] [[Lead to Loan]] [[Renewals]] [[Guarantors and Cheques]] [[Verification and Documents]] [[Tables]] [[Screens Map]]
