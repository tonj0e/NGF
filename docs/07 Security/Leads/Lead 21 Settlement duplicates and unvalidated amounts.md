---
title: Lead 21 Settlement duplicates and unvalidated amounts
section: Security
status: open
last_verified: 2026-10-17
priority: 21
area: Money
fix_step: fix-10
fingerprint: settlements-post-text-marker-dedupe-and-unvalidated-amounts
tags: [ngf, security, lead, money]
---
# Lead 21 Settlement duplicates and unvalidated amounts
**Staff or forged QR. Status: open, not yet fixed. Needs validation (nothing was run).**

## What the source shows
POST /api/settlements (Admin/Staff only) dedupes only when the client-supplied notes contain 'QR Payout' and match /PYOUT\d+/. It then does a read-then-insert substring match over Settlements.Notes for the same entityId. If the caller omits the marker, changes the text, or posts in parallel, several settlements can be recorded for the same payout. The settlement is never linked to or verified against the PayoutRequests row. totalCashDue, totalUpiDue and amountSubmitted are not type- or range-checked, and recordedBy is taken from the body instead of the session. The collections, repayments and loans reads and inactiveLoanIds are computed but never used. Source also shows PATCH with the same numeric gaps. The checked-in supabase_schema.sql declares settlements.total_cash_due, total_upi_due, amount_submitted and balance as DECIMAL(12,2) and recorded_by as NOT NULL REFERENCES users(user_id)…

## Source trace
1. `app/api/settlements/route.ts:28`: requireRole(['Admin','Staff']) at line 29, then entityType, entityId, notes, amounts and recordedBy are read from the JSON body at lines 30-31.
2. `app/api/settlements/route.ts:36`: Dedupe runs only if notes include 'QR Payout' and match PYOUT\d+. It then does a read-then-compare substring check on Settlements Notes at lines 39-41, with no lock or unique key.
3. `app/api/settlements/route.ts:57`: appendRow('Settlements') inserts the client-supplied amounts, Notes and Recorded By, plus a Status and Balance computed from them.

## Why it is not confirmed
- No OS-enforced sandbox with memory limits on this host; target code was not executed.
- The live Supabase settlements schema is not observable from source. It is unknown whether column types, a payout-ID unique key, or CHECK constraints differ from supabase_schema.sql.
- The actor is Admin/Staff only, so impact is ledger integrity. It is unknown whether the live recorded_by FK rejects an empty or forged recordedBy.

## How to check it (safe, dummy data)
Use a dummy database with the checked-in schema and dummy Admin credentials. POST two settlements for the same entityId, one with notes 'QR Payout PYOUT1' and one with notes 'payout'. Confirm both are stored. Then POST two parallel requests with the marker and see whether both succeed. Next POST amountSubmitted=-5, a huge value, and a non-numeric string, and record the stored Amount Submitted, Balance and Status. Finally POST recordedBy as an empty string and as another user's ID.

## Owner check
The owner should check the live settlements table: column types, any unique index or CHECK on amounts, and the recorded_by FK. They should also confirm whether the table is written through the service-role key only.

## Related
- [[Open Security Leads]], [[Security Fix Plan]] (step 10), [[Security Brain]]
