---
title: Lead 10 Collection sheet shows every customer
section: Security
status: open
last_verified: 2026-10-17
priority: 10
area: Money
fix_step: fix-6
fingerprint: collection-sheet-get-missing-role-and-agent-scope
tags: [ngf, security, lead, money]
---
# Lead 10 Collection sheet shows every customer
**Any non-guarantor role to all customers. Status: open, not yet fixed. Needs validation (nothing was run).**

## What the source shows
GET /api/collection-sheet calls only getSession. The Guarantor role is bound to its own Guarantor ID from the session. Every other role, including NGF AGENT, skips that branch. With no guarantorId the customer list stays unfiltered. A guarantorId query parameter lets any non-Guarantor role pick any guarantor's sheet. The response returns name, phone, place, outstanding balance, loan code (last 4 digits of the Loan ID) and guarantor for every customer with an active loan and unpaid repayments. /api/customers restricts NGF AGENT to customers on assigned loans, so the collection sheet is inconsistent with it. The sheet is a role-wide view of the whole book, so product intent for agents is unconfirmed.

## Source trace
1. `app/api/collection-sheet/route.ts:10`: getSession only; no requireRole or role check on viewing
2. `app/api/collection-sheet/route.ts:35`: Only the Guarantor role is forced to its own Guarantor ID. Other roles take the client guarantorId (line 40) or none.
3. `app/api/collection-sheet/route.ts:54`: scoped = all customers unless guarantorId is non-empty; there is no agent branch
4. `app/api/collection-sheet/route.ts:104`: ok() returns rows with name, phone, place, balance, loan code and guarantor for the whole scoped set

## Why it is not confirmed
- No OS-enforced sandbox with memory limits on this host; target code was not executed, so the result is derived from source only
- Whether product intent allows NGF AGENT (and other non-Admin roles) to see the all-customer collection sheet is not documented in source and needs owner confirmation

## How to check it (safe, dummy data)
With dummy data, call the GET handler with a session whose role is NGF AGENT, no assigned loans and no guarantorId. Expect rows for all dummy customers that have an active loan. Repeat with a guarantorId of another dummy guarantor and expect that guarantor's rows. After a fix, expect a 403 or an agent-scoped result.

## Owner check
Owner to confirm whether NGF AGENT users are meant to see the all-customer collection sheet. Also confirm which user accounts hold the NGF AGENT or Staff roles in production.

## Related
- [[Open Security Leads]], [[Security Fix Plan]] (step 6), [[Security Brain]]
