---
title: Decision Log
section: Decisions
status: current
last_verified: 2026-10-17
tags: [ngf, decisions]
---

# Decision Log
**Newest first. One line each; add a full [[Decision Record]] note when a decision is big.**

| Date | Decision | Why |
|---|---|---|
| 2026-10-17 | Repo on GitHub (`tonj0e/NGF`, private); git data kept outside iCloud; retired notes with secrets are ignored | Avoid pushing secrets; avoid iCloud corrupting `.git` |
| 2026-10-17 | New Obsidian vault in `docs/`, written fresh; old `BRAIN.md`, `log.md` and other notes to be retired | Old notes were stale and held secrets |
| 2026-10-17 | Security audit fixes wait until the build is complete | Avoid breaking screens mid-build; back up first |
| 2026-10-17 | Collection form sends `UPI` and `Bank`; "Not Paid" is saved as Pending | Database only accepts Cash, UPI, Bank, Cheque, Other |
| 2026-10-17 | Branch lists show a guarantor only through an active `guarantor_branches` link; Add User now creates it | Guarantors were missing from branches |
| 2026-10-17 | Recollection meter bands: red 0-30, orange 30-70, green 70-100, with a needle | Owner's design |
| 2026-10-16 | `node_modules` and `.next` moved to `.nosync` folders; kept the inner `node_modules` level | iCloud offloaded files; `bcrypt` needs the real path |
| 2026-10-16 | Dev server starts by itself with a macOS startup job | Survives power cuts |
| 2026-10-16 | Guarantor edit form can change name, username and password (password rules apply) | Admin needs to reset logins |

## Related
- [[Decisions Brain]]

## 2026-10-18: UTR payments are marked by staff, not claimed by guarantors
The owner wanted collection-day marking by staff (search the customer's 4-digit code, enter the UTR, group customers on one UTR) instead of guarantor-submitted claims, so guarantors cannot submit someone else's screenshot. A duplicate UTR is saved as Flagged (not rejected) so both sides can be compared and corrected; only users the admin grants override permission can approve a duplicate, with a written reason. Bank statement upload is a later cross-check. Guarantors get a view-only diagram of their own customers. See [[Payment Matching]].
