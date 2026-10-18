---
title: Checks and CI
section: Runbook
status: current
last_verified: 2026-10-19
tags: [ngf, runbook, devops, ci]
---
# Checks and CI
**One line: every push is type-checked before it leaves your Mac and again on GitHub, and a public `/api/health` shows whether the live site and its database answer.**

## What runs where
| Where | What | Blocks a push? |
|---|---|---|
| Your Mac, on `git push` | `.githooks/pre-push` runs `npm run typecheck` | Yes (skip once with `git push --no-verify`) |
| GitHub Actions (`.github/workflows/ci.yml`), on push to `main` and on pull requests | type-check, lint, build (placeholder env values), `npm audit` for high advisories | Type-check and build fail the run; lint and audit only report |
| Dependabot (`.github/dependabot.yml`) | weekly npm update pull requests, monthly Actions updates | No |

## Commands
- `npm run hooks`: turn on the pre-push check (once per clone; already done on the Mac mini).
- `npm run check` / `npm run typecheck`: type-check.
- `npm run lint`: lint `app components lib tests` (old code still has about 340 errors, mostly `no-explicit-any`, so lint is reported, not enforced).
- `npm run test:e2e`: Playwright tests in `tests/` (need the dev server and the test env in `.env.test`; not run in CI yet).
- `npm run backup`: writes a git bundle of all committed work to `~/Backups/ngf-crm` (keeps the last 10). Does not include `.env*` or uncommitted changes. Database backups come from Supabase.
- `.env.example` lists every variable name the app reads (names only).

## Health check
`GET /api/health` (public) returns `{ok, db, time}` with 200, or 503 when the database does not answer. Point an uptime monitor at `https://ngffincorp.com/api/health`.

## Limits to know
- Hostinger deploys on every push to `main` by itself. GitHub CI runs in parallel and cannot stop that deploy. To make CI a gate, protect `main` on GitHub (require the CI check and pull requests) or turn off auto-deploy and deploy from CI. Neither is done.
- CI uses Node 22; Hostinger's Node version should match (check hPanel).
- E2E tests and a staging site are not set up.

## Related
- [[Git and GitHub]], [[Run and Restart]], [[Troubleshooting]], [[Runbook Brain]]
