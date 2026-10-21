---
title: Dev and Admin Tools
section: Field and Org
status: current
last_verified: 2026-10-17
tags: [ngf, field-and-org, dev, admin-tools, danger]
---
# Dev and Admin Tools
**One line: the Dev page and the `app/api/dev/*` routes (plus setup), what each does, how it is guarded, and which ones can destroy data.**

## Key facts
- Dev page: `components/pages/DevPage.tsx`, Admin menu "Dev". Sub-tabs: Refresh token, Capital, Calculator, Testing, Note, Branches, Products, User reset, Clear data.
- `lib/devOnly.ts`: `devOnlyGuard()` returns 404 when `NODE_ENV`, `VERCEL_ENV` or `APP_ENV` says production. Only two routes call it: `dev/user-password-reset` and `auth/email-config`. Every other dev route is live in production for any Admin.
- Testing tab flags are stored in the browser only (e.g. "Unlock payment day", bypasses the Saturday-only rule in Collection).

## Route table
| Route | Does | Guard | Risk |
|---|---|---|---|
| `POST /api/dev/clear` | Deletes all rows of chosen tables: Customers, Loans, Repayments, Collections, Settlements, Notifications, Logs, Leads, Agents, Guarantors, ReviewOptions, Capital | Admin + body `confirm: 'CLEAR ALL'` | Destroys data; also wipes the audit `Logs` table |
| `GET/POST /api/dev/user-password-reset` | Admin sets a new password for a username after typing `RESET <username>`; policy checked; audit logged; revokes that user's sessions | `devOnlyGuard` + Admin + rate limit | Production-blocked |
| `POST /api/dev/fix-passwords` | `fix-all` gives every non-bcrypt user a default password; `reset-one`; `verify-hash` returns hash prefix | Admin only | Dangerous: no dev guard, no policy, no audit |
| `POST /api/dev/seed-admin` | Creates a user with a chosen role if `users` is empty | Admin only | Dead in practice: needs an Admin, but refuses when any user exists |
| `GET /api/dev/migrate-db` | Copies every table from Google Sheets into Supabase with upsert | NONE (auth line is commented out, `migrate-db/route.ts:197`) | Dangerous: anyone can overwrite DB rows from old sheet data; `?dryRun=true` is safe |
| `POST /api/dev/migrate-db` `{action:'clear'}` | Deletes every row in all 22 tables, including `users` | Admin only | Most destructive route in the app |
| `GET /api/dev/migrate-images` | Moves lead photos from Drive to bucket `customer-docs`, logs in `migration_log` | Admin | Broken, see below |
| `GET /api/dev/migrate-payment-proofs` | Same for repayment and collection proofs to `payment-proofs` | Admin | Broken |
| `GET /api/dev/migrate-profiles` | Same for profile photos to `profiles` | Admin | Broken |
| `POST /api/setup` | One-time bootstrap: creates Drive folders, Google Sheets, writes headers and a seed `admin` user into the sheet | Header `x-setup-secret` equals env `SETUP_SECRET` | Legacy Sheets-era route; response echoes the seed admin login |
Migrate routes accept `dryRun`, `limit` (default 100), `offset`.

## Rules and gotchas
- Known issue: `migrate-db` GET is unauthenticated (`app/api/dev/migrate-db/route.ts:195-197`). A public GET without `dryRun` reads the Sheets data and upserts it over live tables. Add the Admin check and the dev guard. See [[Open Security Leads]].
- Known issue: `fix-passwords` `fix-all` sets one shared default password for all non-bcrypt accounts and prints it in the response (`fix-passwords/route.ts:30,47`). Production builds still expose it to any Admin.
- Known issue: the three `migrate-*` image routes cannot finish. They read `lead.__rowIndex`, which `readTable` no longer sets, so `updateRow` throws "Row NaN not found" (`lib/supabase-db.ts:261-274`). The file is already uploaded to Supabase but the lead / repayment is not repointed; errors are logged, and the same file is re-uploaded on the next run.
- Known issue: `setup` writes the seed admin password as a fixed literal in source (`app/api/setup/route.ts:81`). Change it at once if this route was ever run. No other route reads Sheets for live data.
- `/api/dev/clear` runs tables in parallel and ignores foreign keys, so a partial clear can leave orphan rows or per-table errors.
- The Dev UI only calls `clear`, `user-password-reset`, `/api/drive/auth`, plus normal capital, products, settings, projection, branches routes. Nothing in the UI calls fix-passwords, seed-admin, migrate-* or setup, so they are reachable only by hand.
- Dev, Branches tab edits staff permissions (`setAccess`) and adds or deletes branches. See [[Branches and Staff]].

## Related
- [[Field and Org Brain]]
- [[Branches and Staff]]
- [[Files and Storage]]
- [[Runbook Brain]]
- [[Security Brain]]
- [[Open Security Leads]]

## Dev > SMS tab (2026-10-21)
`components/pages/SmsPanel.tsx` + `app/api/sms/route.ts` (Admin only; not under `/api/dev`, so it works on the live site). Status of the SMS provider (names of missing env settings only) and a test send. See [[SMS Setup]].
