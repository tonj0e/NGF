---
title: Lead 03 Repayments POST has no ownership check
section: Security
status: open
last_verified: 2026-10-17
priority: 3
area: Money
fix_step: fix-4
fingerprint: repayments-post-no-role-ownership-or-state-guard
tags: [ngf, security, lead, money]
---
# Lead 03 Repayments POST has no ownership check
**Any logged-in user to any repayment. Status: open, not yet fixed. Needs validation (nothing was run).**

## What the source shows
POST /api/repayments authenticates with getSession only, which checks the token, password version and block state but not role. It finds the repayment by ID across the whole Repayments table. It does no role check, no check that the loan belongs to the caller, and no check of the repayment's current Status. Any valid-token user, including a Guarantor, can mark another guarantor's or agent's customer repayment Paid. That appends a Collections row for the full amount with Agent ID set to the caller, and may set the loan Completed. Re-posting a Paid row appends duplicate Collections rows. Posting Pending or Not Paid on a Paid row reverts it to Pending, clears Paid Date, and leaves the earlier Collections row in place. STATUS_MAP does not accept Waived as an input status. However, the handler never reads the existing Status, so a Waived row (foreclosure weeks, which settlement reporting exc…

## Source trace
1. `app/api/repayments/route.ts:103`: POST calls getSession (line 104), which does not check role, then reads repaymentId, status, paymentMode and paymentProof from the body (lines 105-106).
2. `app/api/repayments/route.ts:121`: The repayment is found by ID in the full Repayments table. Nothing then checks the loan's Guarantor ID or Assigned Agent ID against the session, and nothing checks r.Status.
3. `app/api/repayments/route.ts:138`: updateById overwrites Status, Paid Date, NGF Agent ID (set to session.userId), Payment Mode, Proof File ID and Notes for any repayment, including ones already Paid or Waived.
4. `app/api/repayments/route.ts:150`: appendRow adds a new Collections row on every Paid post, with Agent ID = session.userId and the full repayment Amount. Lines 164-171 set the Loan to Completed when every week is Paid.

## Why it is not confirmed
- No target code was executed: no OS-enforced sandbox with memory limits on this host; target code was not executed.
- The intended policy is not visible in source: which roles are meant to record repayments, and whether Guarantors may record repayments only for their own loans. This is a business decision for the owner.
- Live database triggers or constraints cannot be seen from source. The service-role key bypasses RLS, but a trigger could still reject status regressions or duplicate Collections rows.

## How to check it (safe, dummy data)
On a dummy Supabase project, create two dummy guarantors A and B and a loan with repayments for B. Call POST /api/repayments with A's bearer token, repaymentId on B's loan, status Paid and paymentMode Cash. Confirm the Repayment becomes Paid and a Collections row is appended with Agent ID = A. Replay the same call and confirm a second Collections row appears. Then post status 'Not Paid' for the same repayment and confirm it returns to Pending while both Collections rows remain. Optionally set a dummy repayment to Waived and confirm a Pending post overwrites it.

## Owner check
The owner confirms which roles may record repayments and whether Guarantors may record only for their own loans. The owner also confirms whether any DB trigger or constraint on Repayments or Collections rejects status regressions or duplicate Collections rows, and checks production Collections for duplicate Repayment IDs.

## Related
- [[Open Security Leads]], [[Security Fix Plan]] (step 4), [[Security Brain]]
