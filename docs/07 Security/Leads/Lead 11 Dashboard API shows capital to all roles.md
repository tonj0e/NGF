---
title: Lead 11 Dashboard API shows capital to all roles
section: Security
status: open
last_verified: 2026-10-17
priority: 11
area: Money
fix_step: fix-6
fingerprint: dashboard-metrics-expose-capital-and-global-aggregates-to-all-roles
tags: [ngf, security, lead, money]
---
# Lead 11 Dashboard API shows capital to all roles
**Guarantor or agent to capital totals. Status: open, not yet fixed. Needs validation (nothing was run).**

## What the source shows
GET /api/dashboard authenticates with getSession only. It computes totalCapital, investorMoney, totalInterest and availableCapital from the whole Capital and Loans tables. It computes monthCollected, weekCollected, recollectionRate, collectedCount, pendingCount and activeCustomers from all repayments and customers. All of these go into the shared metrics object returned to any authenticated role, including Guarantor and NGF AGENT. Only loan counts, totalLoanAmount, thisWeekCollection and leads are role-scoped. The Admin-only cards are hidden in the browser by an isAdmin check in Dashboard.tsx, but the server response is not filtered. The sibling financial-analytics endpoint returns 403 to non-Admin callers, so this is inconsistent with the apparent intended policy. Source re-read confirms the trace. Nothing was executed, and whether the business intends guarantors and agents to see thes…

## Source trace
1. `app/api/dashboard/route.ts:9`: The handler calls getSession only. There is no requireRole and no role check before the financial fields are built.
2. `app/api/dashboard/route.ts:128`: totalCapital, investorMoney, totalInterest, totalPrincipal, totalCollected and availableCapital (lines 128-133) are computed from the full Capital, Loans and Repayments tables with no role branch.
3. `app/api/dashboard/route.ts:114`: monthCollected (114), weekCollected (106) and recollectionRate with collectedCount and pendingCount (119-124) are computed from all repayments, not from myLoans.
4. `app/api/dashboard/route.ts:148`: The metrics object returned to every authenticated role includes activeCustomers (154), monthCollected, weekCollected, totalCapital, investorMoney, totalInterest, availableCapital, recollectionRate,…

## Why it is not confirmed
- No OS-enforced sandbox with memory limits on this host; target code was not executed, so the actual JSON returned to a Guarantor or Agent token was not observed.
- Whether the business intends capital, investor and global collection totals to be visible to Guarantor and Agent users is a product-owner decision. The source shows only the client-side hiding and the sibling endpoint's Admin check.

## How to check it (safe, dummy data)
In an isolated environment with a dummy database and a dummy Guarantor session, call the GET handler. Check whether metrics contains totalCapital, investorMoney, totalInterest, availableCapital, monthCollected, weekCollected and activeCustomers computed from all dummy rows. Repeat with a dummy NGF AGENT session. Do not use production data.

## Owner check
The owner confirms whether capital and investor totals and global collection figures are meant to be Admin-only. The owner then checks whether any non-Admin user accounts exist in production.

## Related
- [[Open Security Leads]], [[Security Fix Plan]] (step 6), [[Security Brain]]
