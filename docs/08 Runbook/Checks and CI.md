---
title: Checks and CI
section: Runbook
status: current
last_verified: 2026-11-19
tags: [ngf, runbook, devops, ci]
---
# Checks and CI
**One line: every push is type-checked and unit-tested before it leaves your Mac and again on GitHub, and a public `/api/health` shows whether the live site and its database answer.**

## What runs where
| Where | What | Blocks a push? |
|---|---|---|
| Your Mac, on `git push` | `.githooks/pre-push` runs `npm run typecheck`, `npm run typecheck:tests`, `npm run test:unit` | Yes (skip once with `git push --no-verify`) |
| GitHub Actions (`.github/workflows/ci.yml`), on push to `main` and on pull requests | type-check, unit-test type-check, unit tests, lint, build (placeholder env values), `npm audit` for high advisories | Type-check, unit tests and build fail the run; lint and audit only report |
| Dependabot (`.github/dependabot.yml`) | weekly npm update pull requests, monthly Actions updates | No |

## Commands
- `npm run hooks`: turn on the pre-push check (once per clone; already done on the Mac mini).
- `npm run typecheck`: type-check the app (`tsc --noEmit`; `tests/unit` is excluded from the root `tsconfig.json`).
- `npm run typecheck:tests`: type-check `tests/unit` with `tests/tsconfig.json` (extends the root config, adds `allowImportingTsExtensions` because the tests import `lib/*.ts` with the extension).
- `npm run test:unit`: `scripts/run-unit-tests.mjs` runs every `tests/unit/*.test.ts` with `node --experimental-strip-types --no-warnings`, one file at a time, and stops at the first failure (exit 1). Needs Node 22.6+ (the script says so on older Node); works on Node 22 (CI, Hostinger) and Node 25 (owner's Mac). Optional filter: `node scripts/run-unit-tests.mjs payCode`.
- `npm run check`: all three above.
- `npm run lint`: lint `app components lib tests` (old code still has about 340 errors, mostly `no-explicit-any`, so lint is reported, not enforced).
- Unit tests are plain scripts (no framework): `node:assert/strict` throws on a wrong result and the file prints `ok` at the end. They may only import pure code (no Supabase, no env): today `lib/db-pure.ts`, `lib/features.ts`, `lib/paginate.ts`, `lib/payCode.ts` (pay code from loan ID), `lib/creditScore.ts` (score bands, cutoff) and the date-string helpers in `lib/dateUtils.ts`. Tests record current behaviour; a change in behaviour must change the test on purpose.
- `npm run test:e2e`: Playwright tests in `tests/` (need the dev server and the test env in `.env.test`; not run in CI yet).
- `npm run backup`: writes a git bundle of all committed work to `~/Backups/ngf-crm` (keeps the last 10). Does not include `.env*` or uncommitted changes. Database backups come from Supabase.
- `.env.example` lists every variable name the app reads (names only).

## Health check
`GET /api/health` (public) returns `{ok, db, time}` with 200, or 503 when the database does not answer. Point an uptime monitor at `https://secret.ngffincorp.com/api/health`.

## Limits to know
- Hostinger deploys on every push to `main` by itself. GitHub CI runs in parallel and cannot stop that deploy. To make CI a gate, protect `main` on GitHub (require the CI check and pull requests) or turn off auto-deploy and deploy from CI. Neither is done.
- CI uses Node 22; Hostinger's Node version should match (check hPanel).
- E2E tests and a staging site are not set up.

## Related
- [[Git and GitHub]], [[Run and Restart]], [[Troubleshooting]], [[Runbook Brain]]
