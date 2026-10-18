---
title: Lead 20 Payout can be re-processed
section: Security
status: fixed
last_verified: 2026-10-19
priority: 20
area: Money
fix_step: fix-10
fingerprint: commission-payout-patch-no-pending-state-guard
tags: [ngf, security, lead, money]
---
# Lead 20 Payout can be re-processed
**Staff or stale screen. Status: fixed in code (2026-10-19). The trace below describes the code before the fix.**

Fix: PATCH only decides a `Pending` request and accepts only `approve`/`reject`. POST caps the amount at eligible (finished-cycle) commission minus Paid and Pending, re-checks for a second Pending row after insert, and uses a collision-safe id. A database unique index is in `supabase/migrations/20261019120000_payout_one_pending.sql` (owner runs it). See [[Commissions and Payouts]].

## What the source shows
PATCH /api/commissions/payout (Admin or Staff) sets a payout to Paid or Rejected for any existing payout ID without requiring the current Status to be Pending. A Paid payout can be flipped to Rejected, or a Rejected one to Paid, repeatedly, and Processed At and Notes are overwritten each time. Any action other than 'reject' is treated as Paid. On the request side, a Guarantor's POST only checks amount > 0. The amount is not bounded by accrued unpaid commission, and the hasPending check is a non-atomic read-then-insert, so parallel POSTs can create several Pending rows. The UI hides actions for non-Pending rows, but that is client-side only. Every PATCH actor is a privileged Admin or Staff principal, and each POST request is reviewed by a human admin. The realistic impact is ledger or audit-trail integrity, such as a stale-UI double submission or a Staff user rewriting a processed decisi…

## Source trace
1. `app/api/commissions/payout/route.ts:106`: Admin/Staff PATCH reads payoutId and action from the body (lines 108-112). The role check is the only gate.
2. `app/api/commissions/payout/route.ts:115`: The payout row is looked up by ID and only existence is checked (line 116). Its Status is never examined.
3. `app/api/commissions/payout/route.ts:123`: updateById overwrites Status (Paid, or Rejected only when action === 'reject'), Processed At and Notes regardless of the prior state (lines 118-127).

## Why it is not confirmed
- No target code was executed: no OS-enforced sandbox with memory limits on this host; target code was not executed.
- Downstream financial effect depends on out-of-band payment practice. The PATCH only records status, and admins review the amount on each request. The decisive unobserved fact is whether admins pay on the stated amount without reconciling against commission, a…
- The caching behaviour and race window of readTable('PayoutRequests') were not observed at runtime.

## How to check it (safe, dummy data)
With dummy data in a local stack, PATCH an already-Paid payout with action 'reject' and observe Status become Rejected with an overwritten Processed At. PATCH it again with action 'approve' and observe Paid. Send action 'foo' and observe Paid. As a dummy Guarantor with a past 35-day cycle, POST an amount larger than any commission earned and observe a Pending row created. Fire two concurrent POSTs and count the Pending rows.

## Owner check
Owner should confirm the admin payout reconciliation process, whether the displayed requested amount is verified against earned commission before payment, and whether any other system consumes PayoutRequests.Status as the source of truth for payments.

## Related
- [[Open Security Leads]], [[Security Fix Plan]] (step 10), [[Security Brain]]
