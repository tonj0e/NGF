---
title: Lead 14 Renewal not bound to guarantor
section: Security
status: open
last_verified: 2026-10-17
priority: 14
area: Leads
fix_step: fix-10
fingerprint: renewal-lead-source-customer-from-notes-not-bound-to-guarantor-or-eligibility
tags: [ngf, security, lead, leads]
---
# Lead 14 Renewal not bound to guarantor
**Guarantor to another guarantor's customer. Status: open, not yet fixed. Needs validation (nothing was run).**

## What the source shows
A Guarantor can submit a lead with loanProduct 'RENEWAL' and notes 'Renewal request - Customer ID: <any customer id>'. When an Admin or Staff user approves it, approveRenewal looks up that customer from the notes. It copies the customer's latest loan terms into a new Active loan with a repayment schedule, sets the customer's Active Loan ID, and marks the lead Converted. The server does not check that the customer belongs to the submitting guarantor, that the previous loan is Completed, or that no loan is already active. The renewal-eligibility rules exist only in browser code. The new loan is attributed to the customer's own guarantor. A human Admin or Staff approval is the only gate. Whether that reviewer can see the notes-bound customer is not established from source.

## Source trace
1. `app/api/leads/route.ts:76`: A Guarantor session is accepted. guarantorId is forced to the caller's own guarantor, but nothing validates the customer referenced in the notes.
2. `app/api/leads/route.ts:160`: Loan Product and Notes are stored verbatim from the request body, so the Customer ID reference is attacker-controlled.
3. `app/api/leads/[leadId]/route.ts:182`: Dispatches to approveRenewal when Loan Product === 'RENEWAL'.
4. `app/api/leads/[leadId]/route.ts:414`: Regex-extracts Customer ID from Notes and loads any matching customer, with a Phone+Name fallback taken from the lead. It then appends a new Active loan and Repayments and sets Active Loan ID, with n…

## Why it is not confirmed
- No OS-enforced sandbox with memory limits on this host; target code was not executed.
- Impact depends on whether Admin or Staff review in the UI shows the Notes field and the notes-bound customer. That UI behaviour is not confirmed from the API source alone. If it is not shown, a mismatch is easy to miss at the human approval step.

## How to check it (safe, dummy data)
In a dummy dataset with two guarantors (A and B), each with one customer, post a RENEWAL lead as guarantor A with notes naming guarantor B's customer id. Approve it as Admin. Assert that a loan is created only if the customer belongs to A, has a Completed previous loan, and has no Active loan. Based on source, the loan is created today.

## Owner check
Owner check: in the lead review UI, confirm whether the Notes field and the target customer are shown to the approving Admin or Staff before they click Approve Loan.

## Related
- [[Open Security Leads]], [[Security Fix Plan]] (step 10), [[Security Brain]]
