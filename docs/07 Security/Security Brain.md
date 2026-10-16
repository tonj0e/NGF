---
title: Security Brain
section: Security
status: current
last_verified: 2026-10-17
tags: [ngf, security,brain]
---

# Security Brain
**State of security for the CRM: what the 2026-10-17 audit found, what is fixed, what is next.**

## Five things to remember
1. The audit was **source-only**: no code was run, so all 24 leads are "needs validation", not confirmed. Each has a safe test plan.
2. The pattern behind most leads: a handler checks "is logged in" but not "owns this record". The app talks to the database with an all-powerful key, so these checks are the only protection.
3. **Nothing is fixed yet.** Fixes wait until the build is complete ([[Security Fix Plan]]).
4. Secrets were found in plain text in the old notes (`BRAIN.md`, `log.md`). They must be rotated. Never store secrets in notes.
5. Some earlier claims were wrong: re-approving a converted lead does not delete paid repayments (see [[Open Security Leads]]).

## Notes
| Note | What it answers | Read when |
|---|---|---|
| [[Open Security Leads]] | The 24 leads in review order, with Dataview table | Planning fixes |
| [[Security Fix Plan]] | Order of fixes, risk and what to test | Starting fixes |
| `07 Security/Leads/` | One note per lead: trace, test, status | Working on one lead |
| `SECURITY-AUDIT.md` (project root) | The full audit report | Need every trace and the method |

## Update this section when
A lead is fixed (set its `status: fixed` and move the date into its note), a new route or role check is added, or an audit is repeated.

## Related
- [[Auth and Sessions]], [[Roles and Permissions]], [[00 BRAIN]]
