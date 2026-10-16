---
title: Lead to Loan
section: 03 Loan Lifecycle
status: current
last_verified: 2026-10-17
tags: [ngf, loan-lifecycle, leads, approval]
---
# Lead to Loan
**The end-to-end path from a guarantor's lead to an active loan with a repayment schedule.**

## Key facts
Statuses in the order the code uses them (enum `lead_status`, `supabase_schema.sql:13`):

| Status | Set by | Where |
|---|---|---|
| Pending | Guarantor submits | `POST /api/leads` (`app/api/leads/route.ts:76`) |
| Agent Assigned | Admin/Staff `assignAgent` (also "Request Reverification") | `app/api/leads/[leadId]/route.ts:60`, `:200` |
| Verification Submitted | NGF AGENT `submitVerification` | `[leadId]/route.ts:84` |
| Approved | Admin/Staff approve, set just before `approveLoan` | `[leadId]/route.ts:185` |
| Converted | end of `approveLoan` / `approveRenewal` | `[leadId]/route.ts:404`, `:456` |
| Rejected | Admin/Staff reject, or auto-reject at creation | `[leadId]/route.ts:196`, `leads/route.ts:109` |

`Under Review` and `Verification In Progress` exist in the enum and `lib/config.ts:11` but no code ever sets them.

| Step | Role | Page | Route |
|---|---|---|---|
| Submit lead | Guarantor | `SubmitLeadPage.tsx` (button "+ New Lead" in `LeadsPage.tsx`) | `POST /api/leads` |
| Assign agent | Admin, Staff | `LeadsPage.tsx` | `PATCH /api/leads/:id` action `assignAgent` |
| Verify | NGF AGENT | `VerificationsPage.tsx` | action `submitVerification` |
| Approve / reject / reverify | Admin, Staff | `LeadsPage.tsx` | action `adminReview` |
| Delete lead | Admin, Staff | `LeadsPage.tsx` | `DELETE /api/leads/:id` |

## How it works
1. Submit: server validates with `createLeadSchema` (name, phone >= 10 chars, product required, Aadhaar exactly 12 digits if given). If the Aadhaar already belongs to a `Converted` lead the new lead is saved as `Rejected` with decision "Auto-rejected: existing customer found." Admins are notified.
2. `GET /api/leads` adds `aadhaarStatus = exists` when another lead has the same Aadhaar; the UI shows "Existing Customer - High Risk of Fraud".
3. Assign: sets `Assigned Agent ID`, notifies the agent.
4. Verify: agent submits form, photos upload to Drive, Admin is notified. See [[Verification and Documents]].
5. Approve: the page sends the chosen product key (detail view) or none (list buttons, then the lead's own product is used; if not found, the first product).
6. `approveLoan` (`[leadId]/route.ts:310`):
   - Customer: reuse the one with this `Lead ID`, else insert (id from `makeId('CUST')`). `Active Loan ID`, `Status = Active`.
   - Loan id `<guarantorCode>-<4 random digits>` (`makeLoanId`, `:298`).
   - Loan: `Start Date` = next Saturday in IST (today if Saturday), `End Date` = start + (weeks-1)*7 days.
   - Repayments: one row per week, `Pending`, due every 7 days; last week uses `lastWeekCollection`.
   - Lead set to `Converted` and `Loan Product` rewritten to the product key.
   - If the customer already has an `Active` loan, that loan row is updated in place (new Loan ID, new terms) and its repayments are deleted first (comment cites the unique constraint).
7. Guarantor is notified of approve/reject.

## Rules and gotchas
- Roles are enforced by `requireRole` per action: `submitVerification` is NGF AGENT only; `assignAgent`, `update`, `adminReview`, `scanFolder`, DELETE are Admin or Staff.
- Known issue: the server does not check the lead's current status. `adminReview` approves any lead, even `Pending` or already `Converted` (`[leadId]/route.ts:166`). Only the UI gates by status.
- Known issue: status is set to `Approved` before `approveLoan` runs (`:185`). If `approveLoan` throws, the lead stays `Approved`; the UI only shows approve buttons at `Verification Submitted`, so it is stuck.
- Known issue: `Verification Status` column is read (`leads/route.ts:62`) but never written, so the "Verification Status" field is always blank. The agent's result is in `Recommendation Status`.
- Known issue: `SubmitLeadPage.tsx` lists only built-in products from `APP_CONFIG`, not the DB products ([[Loan Products and Math]]).
- Edit lead (`action update`) uses `body.x || lead.x`, so a field cannot be cleared.
- Deleting a lead cascades to customers with that `Lead ID`, their repayments and loans (`:257`). Not transactional.
- Admin/Staff see all leads; Guarantors only their own; agents only assigned ones (`leads/route.ts:25`). Pagination default is 20 rows.
- The list auto-refreshes every 15 s while idle.

## Related
[[Loan Lifecycle Brain]] [[Loan Products and Math]] [[Verification and Documents]] [[Renewals]] [[Customers and Import]] [[Roles and Permissions]] [[Enums and Status Values]] [[Repayments and Collections]] [[Data Access Layer]]
