---
title: Customer OTP and Disbursement
section: 03 Loan Lifecycle
status: current
last_verified: 2026-10-21
tags: [ngf, loan-lifecycle, otp, disbursement, renewal, early-closure]
---
# Customer OTP and Disbursement
**One line: since 2026-10-21 a customer's OTP confirms every new lead (at the house) and every renewal (on the phone); approval only queues a lead; a separate "Mark disbursed" creates the loan; and a customer can close early with Hold or Permanent.**

## Key facts
- **New customer:** agent opens the verification, `OtpPanel` (purpose `lead_verification`) sends a code to the customer's phone, the customer reads it out, the agent types it. `submitVerification` is refused without a verified OTP (or a recorded override reason). If the agent changes the phone number after verifying, a new OTP is needed. Proof lives on the lead: `otp_verified_at`, `otp_phone`, `otp_override_reason`, `otp_override_by`.
- **Renewal:** guarantor requests (unchanged UI). Server re-checks eligibility (`lib/renewalRules.ts`): own customer, no running loan, not on hold, not permanently closed, no overdue/delayed weeks, no duplicate waiting request. The request goes to the guarantor's **branch**. Branch accountant, assistant manager or manager (or Admin) presses **Approve (OTP)**; the code goes to the customer's **registered** mobile; staff phone the customer, who reads it out. Approval is refused until it is verified (valid 1 h) or overridden.
- **Approval no longer creates the loan.** Lead status `Approved` now means "approved, waiting to be disbursed"; `Converted` means disbursed. Approve sets `approved_by/at`.
- **Disbursement:** Leads > Disbursements > **To Disburse** (`components/pages/DisburseQueue.tsx`, `GET /api/disbursements`). Left: renewals. Right: new customers. Guarantor dropdown (code + name; "all" groups by guarantor). **Mark disbursed** (`PATCH /api/leads/:id {action:'disburse'}`) creates the loan and repayment schedule. A claim on `disbursed_at` stops double clicks. If creating the loan fails, a renewal rolls itself back.
- **First payment rule (changed):** the first weekly payment is the **next Saturday after the handover day**: Wed or Fri hands over, first payment that coming Saturday; a Saturday handover starts the following Saturday (`firstPaymentSaturdayIST()` in `lib/dateUtils.ts`). Before, a Saturday handover started the same day. Flip it by changing that helper.
- **Who may do what (server-enforced, `lib/branchAccess.ts`):** approve and disburse = manager, assistant manager, accountant of the lead's branch, or Admin. Override a failed OTP on a renewal = manager, assistant manager or Admin. Staff see only their branch's leads in `GET /api/leads`. Staff need the "Leads & Disbursements" permission to see the page.
- **OTP safety (`lib/customerOtp.ts`):** 6 digits, only a keyed hash stored, 10 minute expiry, 5 tries, one send per minute, 5 per hour per lead; every request, verify and override is audited (`CUSTOMER_OTP_*`).
- **Override (SMS failed or no signal):** needs a written reason (10+ characters), is audited, and is shown in red/amber on the approval list and the disbursement list.

## Early closure (Close & Hold / Close permanently)
- Where: Customers > customer detail > "Close loan early…" (Admin and branch staff), and in the Loans page "Close Loan" dialog (top section). API `POST /api/loans/close`.
- The customer pays the remaining weeks up front (staff confirm the amount and the mode). The weeks are marked Paid with Collections rows, the loan becomes `Completed`, and a `loan_closures` row is written.
- **Close & Hold:** `customers.hold_until` = the loan's original end date. Renewal is refused until that date (open from the end date itself).
- **Close permanently:** `customers.permanent_block = true` with a required reason. No renewal, and a new lead with the same Aadhaar is refused. Only an Admin can **Re-admit** (`POST /api/customers/readmit`, written note of the verification, 20+ characters).
- Renewal-eligible lists (`/api/loans`) exclude held and blocked customers.

## Rules and gotchas
- Migration `supabase/migrations/20261021100000_customer_otp_disbursement_closure.sql` (applied 2026-10-21): tables `customer_otps`, `loan_closures`; new columns on `leads` and `customers`. Additive only.
- Fixed on the way: `approveRenewal` wrote empty strings into date columns, so no renewal could ever finish and it left a loan without a schedule. Now nulls plus rollback.
- Fixed: the Disbursements "History" sub-tab never showed the loans of the chosen week.
- Known: the OTP is a record of the customer's consent, not a legal e-signature; the paper agreement question is with a lawyer (see the Decision Log).
- Known: `approveLoan` (new customers) has no rollback if it fails halfway.
- Not tested: branch scoping for real Staff accounts (no Staff password was available); MSG91/Twilio against real accounts.

## Related
[[Renewals]], [[Lead to Loan]], [[SMS Setup]], [[Commissions and Payouts]], [[Roles and Permissions]]
