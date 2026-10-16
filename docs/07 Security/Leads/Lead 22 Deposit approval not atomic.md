---
title: Lead 22 Deposit approval not atomic
section: Security
status: open
last_verified: 2026-10-17
priority: 22
area: Money
fix_step: fix-10
fingerprint: deposit-request-approve-nonatomic-no-revalidation
tags: [ngf, security, lead, money]
---
# Lead 22 Deposit approval not atomic
**Double approval. Status: open, not yet fixed. Needs validation (nothing was run).**

## What the source shows
PATCH /api/deposits/request (Admin/Staff only) checks Status === 'Pending' from a possibly cached read, appends an Interest Payout or Principal Withdrawal ledger row, and only afterwards marks the request Paid, with no transaction or conditional update. A double-submitted or concurrent approval, or an approval on an instance with a stale cache, can append a second ledger debit. A failure between the two writes leaves a ledger row and a still-Pending request, so a retry duplicates the debit. Parallel guarantor POSTs can create two Pending requests for the same interest, and approval never recomputes the account. Every approval needs an authenticated Admin or Staff caller, so the trigger is a privileged user's double-click or retry, or a guarantor's parallel POST followed by an admin approving both. Impact is limited to ledger integrity, and the exploitable window is unobserved.

## Source trace
1. `app/api/deposits/request/route.ts:71`: Admin/Staff approval by requestId. requireRole at line 72 gates the caller.
2. `app/api/deposits/request/route.ts:79`: Status !== 'Pending' check on a row from readTable('DepositRequests') (line 76), which is cache-eligible and not forceFresh.
3. `app/api/deposits/request/route.ts:87`: Deposits ledger row appended (Interest Payout or Principal Withdrawal) before the request is marked Paid. Amount comes from the stored request and is not recomputed.
4. `app/api/deposits/request/route.ts:93`: updateById sets Status to Paid afterwards. It is an unconditional update by id, not guarded by Status = 'Pending'.

## Why it is not confirmed
- No OS-enforced sandbox with memory limits on this host; target code was not executed.
- Whether concurrent PATCHes actually double-append depends on timing and deployment: single or multiple instances, cache state, and whether the database has a unique or constraint guard on Deposits per request ID. The Notes column holds the request ID only as…
- Exploitability needs a privileged Admin/Staff caller or admin approval of duplicate Pending requests, so impact across a trust boundary is limited to financial-integrity errors.

## How to check it (safe, dummy data)
With dummy Supabase data (or a mocked client) and no real credentials, send two concurrent PATCH calls for one dummy Pending request as a dummy Admin, then count the Deposits rows whose Notes contain that request ID and read the final request Status. Also send two parallel guarantor POSTs for one dummy guarantor with an eligible interest balance and count the Pending DepositRequests rows. Finally, inject a failure in updateById and confirm that a retry appends a second ledger row.

## Owner check
Owner confirms the number of server instances and whether the Deposits table has a unique constraint or trigger preventing duplicate ledger entries per request ID. Owner also checks the production Deposits ledger for more than one Interest Payout or Principal Withdrawal row with the same 'Withdrawal request <id>' Notes value.

## Related
- [[Open Security Leads]], [[Security Fix Plan]] (step 10), [[Security Brain]]
