---
title: Test Accounts
section: Runbook
status: current
last_verified: 2026-10-17
tags: [ngf, runbook,testing]
---

# Test Accounts
**Which test logins exist and where they are kept. This note never holds passwords.**

| Role | Account | Where the login is stored |
|---|---|---|
| Admin | `admin` | `.env.test.example` (admin variables) |
| Staff / manager | Vincent Antony | `.env.test` (`PLAYWRIGHT_MANAGER_*`) |
| Guarantor | Bindhu (`BINDHU@NGFGBN`), Revathy exists too | `.env.test` (`PLAYWRIGHT_GUARANTOR_*`) |
| NGF Agent | none stored yet | create one before testing agent screens |

## Rules
- All of these touch the **real database**. Treat test actions as real: record only payments you really mean.
- Guarantor usernames follow `NAME@NGF<code>` (for example `BINDHU@NGFGBN`). The Edit Guarantor form can change a username and password.
- Playwright reads the credentials from `.env.test`; both `.env*` files are ignored by git.

## Related
- [[Runbook Brain]], [[Security Fix Plan]], [[Roles and Permissions]]
