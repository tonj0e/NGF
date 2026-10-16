---
title: Repayments and Collections
section: Money
status: current
last_verified: 2026-10-17
tags: [ngf, money, repayments, collection]
---
# Repayments and Collections
**One line: how a weekly repayment is recorded (Collection page -> `POST /api/repayments`), what rows change, and how Saturday and IST dates drive it.**

## Key facts
| Item | Value |
|---|---|
| Page | `components/pages/CollectionPage.tsx` |
| API | `app/api/repayments/route.ts` (GET list, POST record) |
| Dates | `lib/dateUtils.ts` (IST = UTC+5:30, `IST_OFFSET_MS`) |
| Form statuses | Paid, Delayed, Not Paid (`CollectionPage.tsx:42`) |
| Form modes | Cash, UPI / QR, Bank Transfer (`CollectionPage.tsx:97-99`) |
| Accepted modes (API) | Cash, UPI, UPI / QR, Bank, Bank Transfer, Cheque, Other (`route.ts:109`) |
| Stored modes | Cash, UPI, Bank, Cheque, Other (UPI / QR -> UPI, Bank Transfer -> Bank) |
| Status map | Paid->Paid, Delayed->Delayed, Not Paid->Pending, Pending->Pending (`route.ts:113`) |

## How it works
1. Agent, guarantor or admin opens a repayment card and picks status, mode, notes, optional proof photo and a review label.
2. `POST /api/repayments` maps labels to DB enums. Paid needs a mode (`route.ts:118`).
3. Proof (base64) is saved to storage bucket `payment-proofs` under `<LoanID>/<timestamp>_<file>` via `saveFileSupabase`.
4. The repayment row is updated: `Status`, `Paid Date` (today IST only when Paid, else null), `NGF Agent ID` = session user, `Payment Mode` (Paid only), `Proof File ID`, `Notes` (notes + `Review: <label>`).
5. Only when Paid, a row is appended to `Collections` (`COL` id, repayment id, loan, customer, agent = session user, amount = repayment amount, mode, proof, notes).
6. Loan completion: if every repayment of the loan is `Paid` (the one just saved counts), the loan is set to `Completed` (`route.ts:164-171`). `Delayed` and `Pending` weeks block completion.
7. Caches for Repayments, Collections, Loans are invalidated.

### Listing (GET)
- Pending rows with `Due Date` before today IST are shown as `Overdue` (computed on read, not stored, `route.ts:39`).
- Role filter: agent sees loans where `Assigned Agent ID` is theirs; guarantor sees own `Guarantor ID` loans; admin/staff see all.
- `mode=today` and `mode=nextsaturday` both filter on `getThisSaturday()`; default hides Paid; `mode=all` includes Paid; `customerId` returns full history sorted by week.
- Guarantor search matches only the **last 4** of Loan ID or phone; others match substring.
- Today/next-Saturday modes add `summary` (count, total amount, guarantor count).

### Saturday and IST logic
- `getTodayIST()` shifts `Date.now()` by 5.5h then reads the UTC date. `getThisSaturday()` returns today if Saturday, else the next one. `getNextSaturday()` is always this Saturday + 7.
- UI gate: `canRecord = isTodaySaturday || unlocked` (`CollectionPage.tsx:174`). `unlocked` is a localStorage flag `ngf_payment_unlock` set from the Dev page. `isTodaySaturday` is computed once at module load.

### Collection sheet (download window)
- `GET /api/collection-sheet` returns one row per active customer: name, balance (sum of unpaid, non-Waived weeks), next unpaid week no, last 4 of Loan ID, phone, place, guarantor. Sorted by guarantor, then lowest balance.
- `?download=1` is allowed for Admin/Staff any time; others only Friday 17:00 IST through Saturday (`app/api/collection-sheet/route.ts:22`, mirrored in `CollectionPage.tsx:585`).
- The browser builds an HTML page in a new window and calls `window.print()` (user saves as PDF). Pop-ups must be allowed.

## Rules and gotchas
- Known issue: `mode=nextsaturday` filters on `getThisSaturday()`, not `getNextSaturday()` (`route.ts:46`). The "Coming Saturday" tab therefore shows this Saturday's rows. `getNextSaturday` is imported but unused there.
- Known issue: POST has no server-side Saturday check and no role or ownership check beyond a valid session (`route.ts:103-106`). Any logged-in user can post for any `repaymentId`. See [[Open Security Leads]].
- Known issue: `Paid` on an already-Paid repayment appends a second `Collections` row (no guard).
- "Not Paid" and "Delayed" write no Collections row; `Delayed` stays unpaid in lists.
- `Collections.Agent ID` and `Repayments.NGF Agent ID` hold the session **user id**, even when a guarantor collects.
- Settlements read the collector from `NGF Agent ID` to decide whose cash it is. See [[Settlements]].

## Related
- [[Money Brain]], [[Settlements]], [[Loan Products and Math]], [[Lead to Loan]], [[Enums and Status Values]], [[Tables]], [[Roles and Permissions]]
