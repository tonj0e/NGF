---
title: Open Security Leads
section: Security
status: current
last_verified: 2026-10-17
tags: [ngf, security, index]
---
# Open Security Leads
**The 24 leads from the 2026-10-17 audit, in suggested review order (not a severity ranking). On 2026-10-18 the code fixes were made: see "Fix status" below.**

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


## Fix status (2026-10-18)
Backup first: git tag `backup-before-security-2026-10-18` and a bundle in `~/ngf-backups/`. Checked with a 17-check script against a local production build and the live database (16 pass; the one miss is a test-setup issue, not a bug), plus a direct test of the file rule.

| Lead | Status | What changed |
|---|---|---|
| 1 | Fixed | `GET /api/dev/migrate-db` needs Admin again |
| 2 | Not in the repo | No secret values found in tracked files or git history. Owner: delete `~/Downloads/ngf-production.env`; rotate anything ever shown in chat |
| 3 | Fixed | `POST /api/repayments`: Guarantor own loans, agent assigned loans, Admin/Staff all; a Paid or Waived week cannot be changed |
| 4 | Open (off in production) | QR login is switched off (`qrlogin:Guarantor` = 0). Making the QR a real second factor needs a per-card secret: a design change, to be decided |
| 5 | Fixed | `lib/fileAccess.ts`: Admin/Staff any file; Guarantor and Agent only files named in their own records; profile pictures open to all signed-in users |
| 6, 7 | Fixed | `getSession` reads role and status from the database each request; a permanent block is stored as `9999-12-31` and enforced; "7d"/"30d" blocks now count days |
| 8 | Fixed | Agent can submit verification only for a lead assigned to them while it is `Agent Assigned` |
| 9 | Fixed | Agent attendance and trips: an agent always gets their own |
| 10 | Fixed | Collection sheet: an agent sees only customers whose loan is assigned to them |
| 11 | Fixed | Dashboard: capital, investor, interest totals only for Admin and Staff |
| 12, 23 | Fixed | Notifications: role match only for broadcast rows; mark-read only by the recipient |
| 13 | Fixed | Login also limited per account (15 per 5 min); `x-real-ip` preferred over a client `x-forwarded-for` |
| 14 | Fixed | Renewal approval: customer must belong to the requesting guarantor and have no active loan |
| 15, 16 | Fixed | Commission receipt text escaped; ID card photo must be an embedded image; profile API accepts only an image |
| 17 | Fixed | Drive folder query escapes quotes |
| 18 | Fixed | Storage keys: no `..`, safe extension and prefix, image/PDF only; proof file names cleaned |
| 19 | Fixed (live) | Every table in the live database has RLS on (checked 2026-10-18) |
| 20 | Fixed | Payout can only be decided while `Pending`; a request cannot exceed earned commission minus paid |
| 21 | Fixed | Settlement amounts must be valid non-negative numbers; recorder is the signed-in user |
| 22 | Fixed | Deposit approval claims the request in one database step and re-checks the balance |
| 24 | Partly | 8 MB cap and image/PDF type on storage and Drive uploads; a proxy-level body limit is a Hostinger setting |

Also on 2026-10-18: Next.js 16.2.6 to 16.3.8 and next-auth 4.24.14 to 4.24.15 (all 4 critical advisories cleared, plus the high ones tied to them). 5 high advisories remain, all in `braces` via `eslint-config-next` (build tooling only); the only fix is a downgrade.
