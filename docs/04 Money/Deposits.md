---
title: Deposits
section: Money
status: current
last_verified: 2026-10-17
tags: [ngf, money, deposits]
---
# Deposits
**One line: the guarantor deposit scheme is a per-guarantor ledger that pays 4% simple interest per 122-day cycle, withdrawn through requests that an admin approves.**

## Key facts
| Item | Value |
|---|---|
| Logic | `lib/deposits.ts` (`computeDepositAccount`) |
| APIs | `app/api/deposits/route.ts` (account, ledger), `app/api/deposits/request/route.ts` (requests) |
| Page | `components/pages/DepositsPage.tsx` (Guarantor menu); admin side in `GuarantorPage.tsx` (~line 821-850) |
| Tables | `Deposits` (ledger, id `DEP...`), `DepositRequests` (id `DREQ<Date.now()>`), `Settings` (keys `deposit:*`) |
| Ledger types | `Deposit`, `Interest Payout`, `Principal Withdrawal` |
| Request types | `Interest`, `Principal` |
| Request statuses | `Pending`, `Paid` (no reject state exists) |
| Defaults | rate 4 (% per cycle), `cycleDays` 122, principal withdrawal off |
| Settings keys | `deposit:rate`, `deposit:cycleDays`, `deposit:principalWithdraw` (`'1'` = on), edited on the Dev page |

## How it works
1. Admin/Staff record ledger entries with `POST /api/deposits` (`guarantorId`, `type`, `amount > 0`, optional `date`, notes). Date defaults to today IST.
2. Account maths in `computeDepositAccount`:
   - `principal = max(0, sum(Deposit) - sum(Principal Withdrawal))`
   - `cycleStart` = date of the last `Interest Payout`, else first `Deposit`
   - `elapsed = days(cycleStart -> today)`; `completedCycles = floor(elapsed / cycleDays)`
   - `interestPerCycle = principal * rate / 100`
   - `availableInterest = round(interestPerCycle * completedCycles)`
   - `canWithdrawInterest = completedCycles >= 1 && availableInterest > 0`
   - `nextWithdrawalDate = cycleStart + max(1, completedCycles) * cycleDays`
3. Interest: `POST /api/deposits/request` type Interest is allowed only if `canWithdrawInterest`; amount is forced to `availableInterest`.
4. Principal: allowed only if `principalWithdrawEnabled`; amount must be > 0 and <= principal.
5. Only one `Pending` request per guarantor.
6. Approval: `PATCH /api/deposits/request {requestId}` by Admin/Staff appends a ledger row (`Interest Payout` or `Principal Withdrawal`, date today IST, note `Withdrawal request <id>`) and marks the request `Paid`. An interest payout resets the cycle start.
7. QR: the guarantor's receipt QR (`t = NGF_DEPOSIT_PAYOUT`, `rid`) is scanned on `GuarantorPage`, which calls the same PATCH. See [[Commissions and Payouts]].
8. Admin GET without `guarantorId` returns summaries (principal, availableInterest, daysRemaining) for all guarantors.

## Rules and gotchas
- Known issue: `DepositsPage.tsx:63` reads `data.settings.principalWithdraw`, but `GET /api/deposits` returns `principalWithdrawEnabled` (`lib/deposits.ts:13`). `principalAllowed` is always undefined, so the principal withdrawal form never shows even when the setting is on.
- Interest is simple, not compounding: unpaid cycles add up, and the full principal earns each cycle.
- Because an `Interest Payout` resets `cycleStart` to its date, leftover days after the last completed cycle are lost when interest is withdrawn.
- `computeDepositAccount` uses the server's local date (`ymd(new Date())`, `lib/deposits.ts:56`), not IST.
- No reject path: a request can only be approved (`Paid`). The note "Approved by <user id>" is written to `Notes`.
- Approval PATCH does not re-check that the amount is still available; it trusts the stored request amount.
- Guarantor reads are scoped by the session user; only Admin/Staff may pass `?guarantorId=`.

## Related
- [[Money Brain]], [[Commissions and Payouts]], [[Settlements]], [[Roles and Permissions]], [[Tables]], [[Runbook Brain]]
