---
title: Settlements
section: Money
status: current
last_verified: 2026-10-17
tags: [ngf, money, settlements]
---
# Settlements
**One line: the Saturday cash handover per guarantor, how cash due and UPI due are computed, and how payout QR scans also land in the same table.**

## Key facts
| Item | Value |
|---|---|
| Page | `components/pages/SettlementsPage.tsx` (tabs: today, unsettled, history) |
| APIs | `app/api/settlements/route.ts` (GET, POST, PATCH), `app/api/settlements/due/route.ts` (GET) |
| Access | Admin and Staff only (`requireRole`) |
| Table | `Settlements` (Settlement ID `STL...`) |
| Statuses | `Settled`, `Partial`; UI also shows `Pending` when no row exists |
| Entity Type | `Guarantor` (page) or `GuarantorCommission` (default, and QR payouts) |

## How it works
1. `GET /api/settlements/due?saturday=YYYY-MM-DD` returns the repayments due that day, each with guarantor, collector and payment mode. Mode comes from `Collections` first, then the repayment row (`due/route.ts:69`).
2. Excluded: `Waived` weeks, and weeks of Closed/Completed loans unless `Paid` with a real `NGF Agent ID` (`due/route.ts:45-54`). `?all=true` returns all earlier Saturdays (due date before `saturday`) for the Unsettled tab.
3. The page groups rows per guarantor (`SettlementsPage.tsx:231-285`):
   - `totalDue` = sum of all weeks; `unpaid` = sum of non-Paid weeks.
   - Paid and mode contains `upi`, `qr` or `bank` -> `upiDue`.
   - Paid and not UPI and (no collector user or collector role Guarantor) -> `cashDue`.
   - Cash taken by an agent or staff is shown in the per-collector breakdown but is **not** in the guarantor's `cashDue`.
4. Record Cash Submission -> `POST /api/settlements` with `totalCashDue`, `totalUpiDue`, `amountSubmitted`, `saturdayDate`.
5. Server sets `Balance = max(0, cashDue - submitted)`; `Status = Settled` if submitted >= cashDue, else `Partial` (`route.ts:67-68`).
6. If `cashDue` is 0 the "Settle" button posts a row with `amountSubmitted = upiDue` and note "Auto-settled: cash due is 0" (`SettlementsPage.tsx:332`). If cash is still due the button only shows a toast.
7. `PATCH` (settlementId, amountSubmitted, notes) recomputes `Balance` and `Status` against the stored `Total Cash Due`; here balance can go negative (no `max(0,...)`).

### Payout QR settlements
- `GuarantorPage.tsx:611` posts an extra row after a commission QR scan: entityType `GuarantorCommission`, `totalCashDue = amountSubmitted = amount`, `saturdayDate` = today, notes `QR Payout · PYOUT<digits> · Period: a to b`.
- Duplicate guard: if notes contain `QR Payout` and a `PYOUT\d+` id, any existing row with that id in notes for the same `Entity ID` is rejected with "Payout already recorded for this QR" (`route.ts:36-42`).
- These rows are an outflow (company paying guarantor), stored in the same table as inflow cash handovers.

## Rules and gotchas
- Known issue: in the Unsettled-weeks builder the `summaries.push(...)` sits inside the per-repayment loop (`SettlementsPage.tsx:179-186`), so a guarantor can be pushed once per repayment row. Check before trusting counts there.
- Known issue: the guarantor payout balance on `GuarantorPage.tsx:441` subtracts `Amount Submitted` of **all** settlement rows for that guarantor (including Saturday cash submissions) from total commission. Cash handovers distort that balance.
- `POST` loads Collections, Repayments, Loans and builds `inactiveLoanIds`, but never uses them (`route.ts:45-52`).
- `Total Cash Due` is trusted from the client; the server does not recompute it from repayments.
- Rows are keyed per guarantor per Saturday only by convention; a second POST for the same Saturday creates a second row.
- Dates: `thisSaturday()` in the page is a local IST copy of `getThisSaturday()`; QR payout `saturdayDate` uses the UTC date of the browser.

## Related
- [[Money Brain]], [[Repayments and Collections]], [[Commissions and Payouts]], [[Enums and Status Values]], [[Roles and Permissions]], [[Tables]], [[Open Security Leads]]
