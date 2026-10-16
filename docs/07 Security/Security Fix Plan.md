---
title: Security Fix Plan
section: Security
status: current
last_verified: 2026-10-17
tags: [ngf, security,plan]
---

# Security Fix Plan
**The order to fix the audit leads, the risk of each fix and what to test. Do this after the build is complete.**

## Before any fix
1. **Back up** the whole project folder (leave out `node_modules.nosync` and `.next.nosync`). There is no git history to undo with.
2. Have test logins ready: Admin, Guarantor (Bindhu), Manager/Staff (Vincent), and an Agent. See [[Test Accounts]].
3. Change one thing at a time, run the TypeScript check, test the screens, then move on.

## Steps
| Step | Fix | Risk | Test after |
|---|---|---|---|
| 1 | Put the Admin check back on `GET /api/dev/migrate-db` | Very low | Dev page as Admin works; no token returns 401 |
| 2 | Remove secrets from old notes and add them to `.gitignore` | None | n/a |
| 3 | **Rotate** the database key, Google secret and token, setup secret, admin password | Medium: old keys stop at once | App loads; Drive upload works after a new token |
| 4 | Ownership check on `POST /api/repayments` (and no overwrite of Paid or Waived) | Low to medium | Collection page for every role |
| 5 | Agent can submit verification only for assigned leads | Low to medium | Agent verification screen |
| 6 | Scope agent history, collection sheet, notifications, dashboard by role | Low | Each role's dashboard and lists |
| 7 | File proxy ownership | **Highest** | Customers, ID card, payment proofs, photos for each role |
| 8 | Read role and status from the database each request; make permanent block work | Medium | Block, unblock, demote a test user |
| 9 | Escape print windows; allow only image data in profile photo | Low | Print a receipt and an ID card |
| 10 | Remaining hardening (see each lead) | Low to medium | Per lead |

Leads map to steps through their `fix_step` field: see [[Open Security Leads]].

## Related
- [[Security Brain]], [[Test Accounts]], [[Runbook Brain]]
