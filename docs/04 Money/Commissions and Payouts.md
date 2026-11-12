---
title: Commissions and Payouts
section: Money
status: current
last_verified: 2026-10-19
tags: [ngf, money, commissions, payouts]
---
# Commissions and Payouts
**One line: guarantors earn a fixed commission per loan, can request payout once a 35-day cycle has ended, and an admin records it by scanning the guarantor's QR.**

## Key facts
| Item | Value |
|---|---|
| Commission per loan | `Loans.Guarantor Commission`, copied from the product at disbursement (10K10W: 500) |
| Cycle | `CYCLE_DAYS = 35` (`lib/commissions.ts`, one shared copy: `buildCycles`, `computeSummary`) |
| Table | `PayoutRequests`: id `PYOUT<ms><4 random digits>`, Amount, Status, Requested At, Processed At, Notes |
| Statuses | `Pending`, `Paid`, `Rejected` |
| Guarantor page | `components/pages/CommissionsPage.tsx` |
| Admin pages | `PayoutRequestsPage.tsx` (approve/reject), `GuarantorPage.tsx` (QR scanner, manual payout) |

## How it works
1. Cycles (`lib/commissions.ts`, IST dates): loans sorted by `Start Date`. First loan's start opens a cycle ending `start + 35 days`; loans starting before that end join it; the next loan starts a new cycle. A cycle is **past** when `end <= today (IST)`.
2. `GET /api/commissions/payout?summary=1` (Guarantor) returns `earned, eligible, locked, paid, pending, available, todayIST, nextPayoutDate, cycles[]`. `available = max(0, eligible - Paid - Pending)`. The page no longer calculates cycles in the browser.
3. Request: `POST /api/commissions/payout` (Guarantor only). Rejects amount <= 0, an existing Pending request, no past cycle, or an amount above `available` (so commission from the current locked cycle cannot be requested). After insert it re-reads and the later of two racing Pending rows deletes itself. Calls `invalidateCache`. Migration `supabase/migrations/20261019120000_payout_one_pending.sql` (owner runs it) adds a partial unique index (one Pending per guarantor) and `amount > 0`.
4. `gp:commissions` is enforced on the server: a Guarantor with a custom page list (`pages:custom`) lacking it gets 403 from GET/POST here, and `/api/loans` blanks `guarantorCommission` for them (`guarantorCanSeeCommissions`). `AppShell` also refuses to render any page their menu hides.
5. The page builds a receipt with a QR payload `{t:'NGF_PAYOUT', pid, gn, uid, amt, pf, pt, rd}` and prints it. A rejected latest request allows a new request. Errors show a banner with Retry; refresh keeps old data on screen.
6. Admin/Staff review on `PayoutRequestsPage` (status and date filters, rejection reason shown): `PATCH {payoutId, action}` with `approve` or `reject`; only a Pending request can be decided. Notes record the admin user id.
7. QR path: admin scans on `GuarantorPage` (`jsQR`). It now PATCHes `{payoutId, action:'approve'}` first and only posts the `GuarantorCommission` row to [[Settlements]] if that succeeds, so the money cannot be recorded twice. Deposit withdrawal QRs (`t = NGF_DEPOSIT_PAYOUT`) go to `PATCH /api/deposits/request`. See [[Deposits]].
8. Manual "Record Payout" on `GuarantorPage` lets the admin record Cash, UPI or Bank Transfer payouts without a request.
9. "Commission Earned" on the dashboard, staff list, branch hierarchy and edit dialogs is now computed from loans (`lib/guarantorEarned.ts`), the same total as the Commissions page. Money and dates are formatted by `lib/format.ts`.

## One ledger (2026-11-13)
- Commission paid now counts **two** places as one: `PayoutRequests` rows with status Paid, plus cash-book lines (`Settlements`, entity type `GuarantorCommission`) that do not name a payout (`PYOUT...`). `computeSummary(loans, payouts, today, manualPaid)` and `manualCommissionPaid()` in `lib/commissions.ts`. Before this, a manual "Record Commission Payment" on the Guarantors page never showed on the guarantor's own Commissions page.
- Approve on Payout Requests now asks how it was paid (Cash, UPI, Bank Transfer) and a reference, and writes the cash-book line (`Notes: "<mode> payment PYOUT... ref ..."`). The QR scan path sends no mode, so it still writes its own line and nothing doubles.
- `POST /api/commissions/payout {action:'payNow', guarantorId, amount, mode, reference}` (Admin, or Staff with `payoutRequests`, own branch only): pays unlocked commission at once (amount <= available, no Pending request open), writes a Paid payout and the cash-book line.
- `GET /api/commissions/payout?all=1` also returns `commissions[]` per guarantor in scope (earned, unlocked, locked, paid, aheadPaid, pending, available, nextPayoutDate); the Payout Requests page shows it as the tracker.
- Staff need the `payoutRequests` feature to see Payout Requests. It is in the built-in manager and accountant defaults, but a saved `role_defaults` setting overrides the built-ins, so on a live database the Admin ticks it under NGF Branches (role defaults).
- Manual cash-book payments are not blocked before the 35 days end; the tracker shows them as "early".

## Rules and gotchas
- Commission is paid on every loan with the field set, whether the loan is Active, Completed or Closed (there is no Cancelled or Foreclosed status; foreclose and settle set `Completed`). Nothing is reversed.
- Open: renewal reuses the customer's loan row, which may overwrite the old loan's commission. Check against the live database.
- Open: `payout_status` has an unused `Approved` value; a Paid payout is not linked to its `Settlements` row by a key.
- Until the migration is run, the one-Pending rule is enforced only in code.

## Related
- [[Money Brain]], [[Settlements]], [[Deposits]], [[Loan Products and Math]], [[Roles and Permissions]], [[Open Security Leads]], [[Enums and Status Values]]
