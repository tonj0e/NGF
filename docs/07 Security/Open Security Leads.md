---
title: Open Security Leads
section: Security
status: current
last_verified: 2026-10-17
tags: [ngf, security, index]
---
# Open Security Leads
**The 24 leads from the 2026-10-17 audit, in suggested review order (not a severity ranking). All are open. None has been run, so all are "needs validation".**

## Live list (needs the Dataview plugin)
```dataview
TABLE area, fix_step, status
FROM "07 Security/Leads"
SORT priority ASC
```

## Static list
| # | Lead | Area | Who to what | Fix step |
|---|---|---|---|---|
| 1 | [[Lead 01 Open migrate-db route]] | Dev tools | Unauthenticated caller to production tables | 1 |
| 2 | [[Lead 02 Secrets in BRAIN.md and log.md]] | Secrets | Anyone who can read project files to full database and Drive access | 2 |
| 3 | [[Lead 03 Repayments POST has no ownership check]] | Money | Any logged-in user to any repayment | 4 |
| 4 | [[Lead 04 QR second step uses a public ID]] | Auth | Password-only attacker to second factor | 8 |
| 5 | [[Lead 05 File proxy has no ownership check]] | Files | Any logged-in user to any document | 7 |
| 6 | [[Lead 06 Role and status not rechecked per request]] | Auth | Demoted user keeps old role for 24h | 8 |
| 7 | [[Lead 07 Permanent block never blocks]] | Auth | Admin block not enforced | 8 |
| 8 | [[Lead 08 Agent can edit any lead]] | Leads | Any agent to other agents' leads | 5 |
| 9 | [[Lead 09 Agent can read other agents' GPS history]] | Field | Any agent to other agents' data | 6 |
| 10 | [[Lead 10 Collection sheet shows every customer]] | Money | Any non-guarantor role to all customers | 6 |
| 11 | [[Lead 11 Dashboard API shows capital to all roles]] | Money | Guarantor or agent to capital totals | 6 |
| 12 | [[Lead 12 Notifications leak to same-role users]] | Notifications | Guarantor to peers' lead decisions | 6 |
| 13 | [[Lead 13 Login rate limit can be spoofed]] | Auth | Unauthenticated to unlimited guesses | 10 |
| 14 | [[Lead 14 Renewal not bound to guarantor]] | Leads | Guarantor to another guarantor's customer | 10 |
| 15 | [[Lead 15 Receipt print window XSS]] | Client | Agent to guarantor's browser | 9 |
| 16 | [[Lead 16 ID card print window XSS]] | Client | Staff to admin's browser | 9 |
| 17 | [[Lead 17 Drive folder query injection]] | Files | Lead submitter to other customer's folder | 10 |
| 18 | [[Lead 18 Storage file name from client]] | Files | Any user to other storage objects | 10 |
| 19 | [[Lead 19 RLS gap in repo SQL]] | Database | Public key holder to agent tables | 10 |
| 20 | [[Lead 20 Payout can be re-processed]] | Money | Staff or stale screen | 10 |
| 21 | [[Lead 21 Settlement duplicates and unvalidated amounts]] | Money | Staff or forged QR | 10 |
| 22 | [[Lead 22 Deposit approval not atomic]] | Money | Double approval | 10 |
| 23 | [[Lead 23 Notification read flag any user]] | Notifications | Any user to others' read flag | 10 |
| 24 | [[Lead 24 Uploads have no size cap]] | Files | Any user to server memory | 10 |

## Rejected claims (not leads)
- Re-approving a converted lead does **not** delete paid repayments: the loan id rewrite fails first (live foreign keys have no update cascade). Missing status guard remains as a robustness issue.
- The Google token `postMessage` to any origin is unusable without the Google client secret kept on the server. Hardening only.

## Related
- [[Security Brain]], [[Security Fix Plan]]
- Full report with every trace: `SECURITY-AUDIT.md` in the project root.
