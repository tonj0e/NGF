---
title: Commissions and Payouts
section: Money
status: current
last_verified: 2026-10-17
tags: [ngf, money, commissions, payouts]
---
# Commissions and Payouts
**One line: guarantors earn a fixed commission per loan, can request payout once a 35-day cycle has ended, and an admin records it by scanning the guarantor's QR.**

## Key facts
| Item | Value |
|---|---|
| Commission per loan | `Loans.Guarantor Commission`, copied from the product at disbursement (10K10W: 500) |
| Cycle | `CYCLE_DAYS = 35` (`app/api/commissions/payout/route.ts:6`) |
| Table | `PayoutRequests`: id `PYOUT<Date.now()>`, Amount, Status, Requested At, Processed At, Notes |
| Statuses | `Pending`, `Paid`, `Rejected` |
| Guarantor page | `components/pages/CommissionsPage.tsx` |
| Admin pages | `PayoutRequestsPage.tsx` (approve/reject), `GuarantorPage.tsx` (QR scanner, manual payout) |

## How it works
1. Cycles (`buildCycles`, duplicated in the API and the page): loans sorted by `Start Date`. First loan's start opens a cycle ending `start + 35 days`; loans starting before that end join it; the next loan starts a new cycle.
2. A cycle is **past** when `end <= today`. Only past cycles are eligible.
3. Page maths: `eligible` = commission of loans in past cycles; `locked` = current cycle; `availableAmount = max(0, eligible - sum of Paid payouts)`; `canRequestPayout = pastCycles > 0 && available > 0 && no Pending` (`CommissionsPage.tsx:106-109`).
4. Request: `POST /api/commissions/payout` (Guarantor only) with `amount`. Rejects amount <= 0, an existing Pending request, or no past cycle ("Payout unlocks after 35 days").
5. The page then builds a receipt with a QR payload `{t:'NGF_PAYOUT', pid, gn, uid, amt, pf, pt, rd}` and prints it (`CommissionsPage.tsx:171`). A rejected latest request allows a new request.
6. Admin/Staff review on `PayoutRequestsPage`: `PATCH {payoutId, action}`. `reject` needs a reason (client-side) and writes `Rejected`; any other action writes `Paid`. Notes record the admin user id.
7. QR path: admin scans on `GuarantorPage` (`jsQR`). It matches the guarantor, posts a `GuarantorCommission` row to [[Settlements]], then PATCHes the payout. Deposit withdrawal QRs (`t = NGF_DEPOSIT_PAYOUT`) go to `PATCH /api/deposits/request` instead. See [[Deposits]].
8. Manual "Record Payout" on `GuarantorPage` lets the admin record Cash, UPI or Bank Transfer payouts without a request.

## Rules and gotchas
- Known issue: the QR scan PATCH sends only `{payoutId}` (`GuarantorPage.tsx:621`), but the API requires `action` (`route.ts:112`). The call fails with "payoutId and action required"; the settlement row is already saved, the request stays Pending, and the UI shows "Settlement saved but payout status update failed".
- Known issue: `POST` does not check `amount` against earned commission or the available balance; the cap exists only in the page (`route.ts:70`).
- `PATCH` does not check the current status, so a Paid request can be set to Rejected and back.
- `POST` appends to `PayoutRequests` but does not call `invalidateCache` (only `PATCH` does).
- Known issue: Dashboard "Commission Earned" reads `Guarantors.Commission Earned`, which is written as 0 at creation and never updated (`app/api/staff/route.ts:53`). The real figure is the sum of loan commissions shown on the Commissions page.
- `CommissionsPage.tsx:80` computes `todayStr` from UTC, not IST, so the cycle boundary can be off by one day late at night IST.
- Commission is paid on every loan with the field set, whether the loan is Active, Completed or foreclosed.

## Related
- [[Money Brain]], [[Settlements]], [[Deposits]], [[Loan Products and Math]], [[Roles and Permissions]], [[Open Security Leads]], [[Enums and Status Values]]
