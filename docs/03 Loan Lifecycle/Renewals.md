---
title: Renewals
section: 03 Loan Lifecycle
status: current
last_verified: 2026-10-17
tags: [ngf, loan-lifecycle, renewal]
---
# Renewals
> **Changed 2026-10-21:** renewals now need the customer's OTP at approval, go to the guarantor's branch only, and the loan is created at **disbursement**, not at approval. Read [[Customer OTP and Disbursement]] first; the steps below describe the older behaviour where they conflict (approval, start date, who approves).
**How a finished customer gets a new loan: a RENEWAL lead, a browser-side eligibility check, and `approveRenewal`.**

## Key facts
- Who requests: Guarantor, button "+ Renewal" in `LeadsPage.tsx:461`, opens `components/pages/RenewalModal.tsx`.
- Who approves: branch accountant, assistant manager, manager of the guarantor's branch, or Admin: "Approve (OTP)" in Leads > Renewal Requests; then "Mark disbursed" in Leads > Disbursements > To Disburse.
- A renewal is a normal `Leads` row with `Loan Product = RENEWAL` and `Notes = "Renewal request - Customer ID: <id>"` (`RenewalModal.tsx:72`). No agent, no verification step.
- Lifecycle: `Pending` then `Converted` (or `Rejected`). It never goes through `Agent Assigned`.

## How it works
1. Modal loads `GET /api/customers` (already scoped to the guarantor), search by name, phone, Aadhaar last 4, or last 4 of customer/loan id.
2. For each match it loads `GET /api/repayments?customerId=` and runs `evaluateRenewal` (`lib/reviews.ts:18`). Not eligible when:
   - any repayment is `Overdue` (the API turns `Pending` rows with a past due date into `Overdue` on read, `app/api/repayments/route.ts:39`), or
   - any repayment is `Delayed`, or
   - there are star reviews and the average is below 3.
   No reviews and no dues = eligible.
3. "Request Renewal" posts `POST /api/leads` with name, phone, place, address and `loanProduct: RENEWAL`.
4. `adminReview` "Approve Loan" on a RENEWAL lead calls `approveRenewal` (`app/api/leads/[leadId]/route.ts:410`):
   - finds the customer from the `Customer ID:` text in Notes, else by phone + name; error "Customer not found for renewal";
   - takes the customer's most recent loan (by `Created At`) as `prev`; error if none;
   - new loan id from `makeLoanId`, same principal, interest, commission, net, weekly and weeks as `prev`;
   - total = `prev` total; last week = total - weekly x (weeks-1);
   - start = next Saturday (IST), repayments created `Pending`;
   - customer `Active Loan ID` updated, status `Active`; lead set `Converted`.
5. Loans with `isRenewal` are flagged by `app/api/loans/route.ts:57` when the loan's lead has product `RENEWAL`. "Renewal Eligible" tabs use `Completed` loans whose customer has no `Active` loan (`loans/route.ts:38`).

## Rules and gotchas

> **Confirmed in the live database (2026-10-17):** the constraint `loans_customer_id_key` (`UNIQUE (customer_id)`) exists, so a renewal that inserts a second loan for the same customer is rejected by the database.
- Known issue: eligibility is enforced only in `RenewalModal`. `POST /api/leads` and `approveRenewal` do not re-check dues, ratings, or whether the old loan is `Completed`.
- Known issue: a customer mid-loan with only future `Pending` weeks counts as eligible, so a renewal can be requested while the loan is still active. The `Not Paid` check in `evaluateRenewal` never fires, because the API stores "Not Paid" visits as `Pending`.
- Known issue: any past `Delayed` week blocks renewal for good; there is no clearing rule.
- Known issue: the Approve dropdown product is ignored for renewals; terms always copy the previous loan, even if products changed.
- UNIQUE `loans.customer_id`: confirmed in `supabase_schema.sql:182`, and no repo migration drops it. `approveRenewal` always inserts a new `Loans` row for the same customer, which that constraint would reject (the `approveLoan` comment at `:355` shows the author knew of it). Not checked against the live DB, so confirm in [[Tables]] before relying on either behaviour.
- Renewal leads are hidden from the "New Leads" and "History" tabs (`LeadsPage.tsx:415`).

## Related
[[Loan Lifecycle Brain]] [[Lead to Loan]] [[Verification and Documents]] [[Loan Products and Math]] [[Customers and Import]] [[Repayments and Collections]] [[Roles and Permissions]]
