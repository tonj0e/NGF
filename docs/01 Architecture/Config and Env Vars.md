---
title: Config and Env Vars
section: Architecture
status: current
last_verified: 2026-10-17
tags: [ngf, architecture, config, env]
---
# Config and Env Vars
**One line: constants in `lib/config.ts` and the names (never values) of every environment variable the code reads.**

## Key facts: `lib/config.ts` (`APP_CONFIG`)
| Constant | Meaning |
|---|---|
| `APP_NAME` | "NGF FINCORP Finance Operations Platform", returned at login |
| `COMPANY_PREFIX` | `NGF` |
| `SPREADSHEET_ID`, `LEADS_SPREADSHEET_ID`, `PHOTO_ROOT_FOLDER_ID` | Google IDs for the legacy Sheets and the lead photo folder |
| `SESSION_TTL_SECONDS` (21600) | Unused. Real token life is 24 h in `lib/auth.ts:14` |
| `LOAN_PRODUCTS` | One built-in product `10K10W`, sent to the browser at login. The live list is the `loan_products` table ([[Loan Products and Math]]) |
| `LEAD_STATUSES`, `VERIFICATION_RESULTS` | Lead and verification status lists ([[Enums and Status Values]]) |
| `ROLES` | `Admin, Guarantor, NGF AGENT, Staff` |
| `STAFF_FEATURES` | 7 grantable features: customers, leads, collection, settlements, guarantors, reports, agentTracking. Each maps to an AppShell `view` |
| `BRANCH_ROLES` | manager, accountant, cashier, collection_agent with suggested permission sets (not auto-granted) |
Also exported: `SHEETS` (legacy column lists per table) and `LEADS_COLUMNS` (used by setup and the Sheets code only).

## Environment variable names
| Name | Needed for | Read in |
|---|---|---|
| `JWT_SECRET` | Signs all tokens and OTP hashes. Must be 32+ chars | `lib/auth.ts:7`, `lib/otp.ts:15` |
| `CSRF_SECRET` | Signs CSRF tokens. Has an insecure default | `lib/csrf.ts:5` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | `lib/supabase-db.ts`, `lib/supabase.ts` |
| `SUPABASE_SERVICE_ROLE_KEY` | Full DB and storage access | same |
| `RESEND_API_KEY`, `EMAIL_FROM` | Reset-code email | `lib/email.ts` |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN` | Drive uploads and reads | `lib/google.ts`, `app/api/drive/*` |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Sheets/Drive service account | `lib/google.ts:8` |
| `NEXT_PUBLIC_APP_URL` | OAuth redirect base (default `http://localhost:3000`) | `lib/google.ts:47`, `app/api/drive/auth`, `callback` |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Agent tracking map | `AgentTrackingPage.tsx:29` |
| `NVIDIA_API_KEY`, `NVIDIA_BASE_URL`, `NVIDIA_MODEL` | Admin assistant (URL and model have defaults) | `app/api/agent/route.ts` |
| `SETUP_SECRET` | Guards `POST /api/setup` | `app/api/setup/route.ts:12` |
| `NODE_ENV`, `VERCEL_ENV`, `APP_ENV` | Production detection; any one equal to `production` disables dev-only routes and sets `secure` on the CSRF cookie | `lib/devOnly.ts`, `lib/csrf.ts` |

Not read from env (despite the packages): `next-auth` has no config here.

## Rules and gotchas
- Never print or commit values. `.env*` files are not documented here by design.
- Missing `JWT_SECRET` makes every auth call throw `JWT_SECRET must be set ...` (kept visible, `lib/auth.ts:55`).
- Missing Supabase vars throw `Missing Supabase env vars` on first query.
- Dev-only routes: `devOnlyGuard()` gives 404 in production. Only `dev/user-password-reset` and `auth/email-config` use it. Other `/api/dev/*` routes rely on Admin role only; `GET /api/dev/migrate-db` has no check ([[Open Security Leads]]).
- Runtime-tunable settings live in the `settings` table (Dev page): `qrlogin:<Role>`, `agent:*` and others. See [[Auth and Sessions]], [[Integrations]].

## Related
- [[Architecture Brain]], [[Tech Stack and Folder Map]], [[Runbook Brain]], [[Branches and Staff]]
