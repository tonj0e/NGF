---
title: Guarantors and Cheques
section: 03 Loan Lifecycle
status: current
last_verified: 2026-10-17
tags: [ngf, loan-lifecycle, guarantors, cheques]
---
# Guarantors and Cheques
**How guarantor accounts are created, linked to a branch and edited, and the status of the Cheques Pledged page.**

## Key facts
- A guarantor is two rows: a `Users` row (role `Guarantor`, username, password hash, `Guarantor Code`) and a `Guarantors` row (id `GRT...`, `Code`, phone, address, `Commission Earned`, status).
- `Code` is UNIQUE (`supabase_schema.sql:55`). It prefixes loan ids (`<code>-1234`) and names the Drive folder `NGF-<code>`.
- Pages: `GuarantorPage.tsx` (Admin and Staff with `guarantors` feature: list, loans, settlements, payout QR scan, deposits); branch-level management in `StaffPage.tsx` (NGF Branches).
- Guarantors see Leads, Collection, Commissions, Deposits, My Customers and My ID Card ([[Screens Map]]).

## How it works
Create: `POST /api/staff` (Admin only, `app/api/staff/route.ts:20`)
1. Rejects a taken username, hashes the password, inserts the `Users` row.
2. For role `Guarantor` inserts the `Guarantors` row with `Commission Earned = 0`, `Status = Active`.
3. If `branchId` is sent, inserts a `GuarantorBranches` row (`guarantor_branches`: uuid id, guarantor id, branch id, `Is Active = true`). NGF Branches lists guarantors through this table.
4. On any failure it deletes what it created (guarantor_branches, guarantors, users) and returns the error.

Edit: `EditGuarantorDialog` (`components/org/EditGuarantorDialog.tsx`), opened from `StaffPage.tsx`, saved by `PATCH /api/staff` (Admin only).

| Field | Notes |
|---|---|
| Username | min 3 chars, no spaces; server also enforces 3-64 and uniqueness (`staff/route.ts:163`) |
| Name, Code | both required in the dialog |
| Phone, Address, Status | Status Active, Inactive or Suspended |
| New password | optional; checked by `validatePasswordPolicy` in the dialog and again on the server (`:181`) |

- Name, email, code, phone, address and status are written by the database function `update_guarantor_atomic`; username and password are then written in separate updates, so a failure between them leaves a partial edit.
- The dialog has no email or branch field. The branch link cannot be changed from here. The username is read from the user list, since it lives on the `Users` row.
- Delete: `DELETE /api/staff` is blocked if the guarantor still has leads, customers, loans, payout requests, deposits or deposit requests.

## Cheques Pledged
- `ChequesPledgedPage.tsx` is meant to list leads with a cheque number and status `Approved` (shown "Pledged") or `Converted` (shown "Active"), with a link to the cheque photo.
- Known issue: it is dead. AppShell has a `cheques` case (`components/AppShell.tsx:169`) but no menu or staff feature points to it, so no one can open it.
- Known issue: even if opened it shows nothing. It reads `j.data.leads`, but `GET /api/leads` returns `{rows, pagination}` (`lib/supabase-db.ts:439`), and the first page is only 20 rows.
- Cheque number and photo are still captured in the verification form ([[Verification and Documents]]).

## Rules and gotchas
- Known issue: `POST /api/staff` hashes the password with no `validatePasswordPolicy` call; only edits are checked server-side.
- Known issue: an empty `guarantorCode` is saved as `''`; a second such guarantor violates UNIQUE `code`, and loan ids become `NGF-` via the `'NGF'` fallback in `approveLoan`.
- Changing a guarantor's code does not rename old loan ids or the Drive folder; `GuarantorPage` matches loans by code or name.
- `guarantor_branches` and `update_guarantor_atomic` are not in the repo SQL files; they exist only in the live DB ([[Tables]], [[Open Security Leads]]).
- Branch and role setup: [[Branches and Staff]].

## Related
[[Loan Lifecycle Brain]] [[Lead to Loan]] [[Customers and Import]] [[Commissions and Payouts]] [[Deposits]] [[Branches and Staff]] [[Roles and Permissions]]
