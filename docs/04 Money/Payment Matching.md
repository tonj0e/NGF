---
title: Payment Matching
section: Money
status: current
last_verified: 2026-10-18
tags: [ngf, money, payments, utr]
---
# Payment Matching
**Collection-day marking of UPI/cash payments by UTR, with duplicate-UTR flagging, guarantor view and a bank-statement cross-check.**

Purpose: stop one screenshot or UTR being used for the wrong customers. Staff mark each payment on collection day; the server refuses to treat the same UTR as two payments.

## Flow
1. Pick a **guarantor** and a **Saturday**. The sheet lists their customers due that week (plus older unpaid weeks) with the **4-digit pay code**.
2. Search by code, name or phone. Tap customers to add them to one payment (a group payment: one UTR, several customers).
3. Choose mode. UPI and Bank need a **UTR**; Cash/Cheque/Other do not. Amounts are always the weekly amount due (no partials).
4. **Save.** If no verified payment already holds the UTR, the payment is `Verified` and the repayments become Paid (same effect as `/api/repayments`: repayment row + `collections` row + loan completion check).
5. If the UTR is already held, the payment is saved as **Flagged** (repayments stay Pending). Both sides are shown with an **Edit UTR** box. Correcting the UTR (no conflict) verifies the payment. A user with override permission can correct the earlier payment, approve anyway with a written reason (`Overridden`), or discard.
6. Records tab shows each payment as a diagram: one payment node joined to the customers it covers (`components/payments/PaymentDiagram.tsx`).
7. Bank check tab: upload a bank-statement CSV; every saved UTR is compared by UTR and amount (`Matched`, `Amount mismatch`, `Not found`); credits nobody marked are listed.

## Who can do what
| Who | Collect | Records | Bank upload | Override |
|---|---|---|---|---|
| Admin | yes | all | yes | yes |
| Staff / Agent with `upiPayments` | yes | all | only with `upiPaymentsBank` | only with `upiPaymentsOverride` |
| Guarantor | no | own customers only, view-only | no | no |

Permissions are granted in **Dev → Branches → Staff Access** (a branch must be chosen: `staff_access.branch_id` has a foreign key) (Staff and Agents both listed; agents only see the Payment Matching toggles). They are stored in `staff_access.permissions` (a Postgres `text[]`; `/api/branches` `setAccess` now writes a `{a,b}` array literal and ignores unknown keys), keyed in `lib/config.ts` `STAFF_FEATURES` (`view: ''` features add no menu item). Access is decided server-side in `lib/payments.ts` `getAccess`.

## Rules in code (`lib/payments.ts`)
- UTR is normalised (spaces/dashes removed, uppercase), 8–30 letters/digits.
- Unique among `Verified` payments by the partial index `uq_payment_groups_utr_verified`; a race falls back to Flagged.
- A repayment can have only one payment line (`payment_lines.repayment_id` unique).
- Editing a UTR on a verified payment needs the marker or override permission; every edit/override/discard is logged in `payment_events` and in `logs`.
- A guarantor never sees other guarantors' customer names: they show as "Another guarantor's customer".
- Pay codes: `customers.pay_code`, 4 digits, unique **per guarantor** (`ensurePayCodes`, run when a customer is created and when a collect sheet opens).

## Files
`migrations/2026-10-18-payment-matching.sql`, `lib/payments.ts`, `app/api/payments/route.ts`, `components/pages/PaymentMatchingPage.tsx`, `components/payments/PaymentDiagram.tsx`, `components/payments/bankCsv.ts`.

## Known limits
- No branch scoping: staff with the permission see all guarantors (same as the existing Collection page).
- A verified payment cannot be un-marked from this page (use the existing repayment tools).
- Bank CSV only (no Excel); columns are found by header name.

## Update this section when ...
- Payment modes, the pay-code rule, or the permission keys change.
- The bank import format changes.

## Related
- [[Money Brain]], [[Repayments and Collections]], [[Tables]], [[Roles and Permissions]], [[Decision Log]]
