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
1. Pick a **guarantor** and a **Saturday**. The sheet lists their customers due that week (plus older unpaid weeks) with the **4-digit code from their loan ID** (GBN-7425 shows 7425).
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
| Guarantor | only if an Admin switches it on (NGF Branches → edit guarantor → Permissions), own customers only | own customers only | never | never |

Permissions are granted in **Dev → Branches → Staff Access** (a branch must be chosen: `staff_access.branch_id` has a foreign key) (Staff and Agents both listed; agents only see the Payment Matching toggles). They are stored in `staff_access.permissions` (a Postgres `text[]`; `/api/branches` `setAccess` now writes a `{a,b}` array literal and ignores unknown keys), keyed in `lib/config.ts` `STAFF_FEATURES` (`view: ''` features add no menu item). Access is decided server-side in `lib/payments.ts` `getAccess`.

## Rules in code (`lib/payments.ts`)
- UTR is normalised (spaces/dashes removed, uppercase), 8–30 letters/digits.
- Unique among `Verified` payments by the partial index `uq_payment_groups_utr_verified`; a race falls back to Flagged.
- A repayment can have only one payment line (`payment_lines.repayment_id` unique).
- Editing a UTR on a verified payment needs the marker or override permission; every edit/override/discard is logged in `payment_events` and in `logs`.
- A guarantor never sees other guarantors' customer names: they show as "Another guarantor's customer".
- Pay code = the 4 digits at the end of the customer's loan ID (`lib/payCode.ts`, `payCodeFromLoanId`). Loan IDs are `<guarantor code>-<4 digits>` and unique per guarantor, so no separate code is stored or generated. The old `customers.pay_code` column is unused (random codes removed 2026-10-19).

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


## Guarantor permission (2026-10-18)
An Admin can switch on "Payment Matching: mark UTR payments for own customers" for a guarantor in **NGF Branches → branch → Guarantors → edit**. Stored in `staff_access.permissions` (`upiPayments`) with the branch it was set from. Server rules (`lib/payments.ts getAccess`): for a guarantor the guarantor id is always forced to their own, edit/discard only on their own payments, bank-statement and override are never allowed. Staff permissions are set the same way (edit the person in NGF Branches). The Dev → Branches "Staff Access" list now shows field agents only.

### Guarantor access list (2026-10-18, later)
The guarantor edit dialog (NGF Branches) now lists every page the guarantor has: Dashboard, Leads, Collection, UPI Payments (view), Commissions, Deposits, My Customers, My ID Card, plus "mark UTR payments". Green with a tick = has it, blank = switched off. Notifications is always on. Until an Admin saves a custom list every guarantor keeps all pages; saving adds the `pages:custom` marker and then only ticked pages appear in the guarantor's menu (`AppShell` reads `/api/branches?self=1`). This hides pages from the menu; the data APIs still follow the role rules. Staff and manager permission chips use the same green style. Config: `APP_CONFIG.GUARANTOR_FEATURES`.

Branch links: staff via `branch_staff_roles`, field agents via `agents.branch_id`, guarantors via `guarantor_branches`. Accounts with none of these (e.g. `NGF000101`, `otp_test`) are not shown under any branch.
