---
title: Migrations
section: 06 Database
status: current
last_verified: 2026-10-17
tags: [ngf, database, migrations]
---
# Migrations
**One line: every migration file in the repo, in date order, versus what the live project recorded, and how to add a new one safely.**

Two folders hold SQL: `migrations/` (dated names, run by hand in the SQL editor) and `supabase/migrations/` (timestamp names, the Supabase CLI format). Loose fix files sit in the project root.

## In date order
| Date | File | What it does | Live history |
|---|---|---|---|
| 2026-09-05 | `migrations/2026-09-05-complete-fixes.sql` | Adds `updated_at` to loan_products and payout_requests; drops and recreates `update_updated_at_column()` and 12 triggers | Not recorded; live has no triggers |
| 2026-10-14 | `migrations/2026-10-14-fix-agent-deletion-leads-fk.sql` and `supabase/migrations/20261014100000_...` | leads.assigned_agent_id FK becomes ON DELETE SET NULL | 20261014100000 |
| 2026-10-14 | `...fix-agent-deletion-loans-fk.sql` and `20261014100100_...` | Same for loans.assigned_agent_id | 20261014100100 |
| 2026-10-14 | `...add-user-blocking.sql` and `20261014175559_add-user-blocking.sql` | users.blocked_at, blocked_until, blocked_by, block_reason + partial index | 20261014175559 |
| 2026-10-14 | `migrations/2026-10-14-fix-user-deletion-logs-fk.sql` | logs.user_id nullable, FK SET NULL. No `supabase/` copy | Not recorded, but live FK is SET NULL |
| 2026-10-15 | none in repo | Guarantor atomic update function (3 versions) | 20261015162402, ...162739, ...163957 |
| 2026-10-18 | `migrations/2026-10-18-payment-matching.sql` | Adds payment_groups, payment_lines, payment_events, bank_transactions (RLS on, no policy) and customers.pay_code; backfills pay codes. Applied to live 2026-10-18 | not recorded in history |
| 2026-10-19 | `migrations/2026-10-19-verification-routes.sql` | Adds visit/route columns to leads, route_plans, route_dist_cache (RLS on, no policy). Applied to live 2026-10-19 | not recorded in history |
| 2026-10-16 | `migrations/2026-10-16-add-password-reset-otps.sql` and `20261016120000_...` | Creates password_reset_otps (RLS on, no policy, CHECK on email_status) | 20261016101737 |

Root fix files (not migrations, run manually): `fix_all_enums.sql`, `fix_capital_enum.sql`, `fix_payout_requests_updated_at.sql`, `phase3_completion.sql`. The two-folder duplicates are identical SQL; the OTP file header still says "PROPOSED" though it is applied.

## Safe way to add a migration
1. Read the live state first (see [[Queries We Use]]); do not trust `supabase_schema.sql` ([[Live vs Repo Drift]]).
2. Write the file in `supabase/migrations/` as `YYYYMMDDHHMMSS_short_name.sql`. Copy to `migrations/` only if you want to keep the old dated habit.
3. Make it additive and repeatable: `IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `ADD VALUE IF NOT EXISTS`.
4. New table: enable RLS in the same file. Policies are optional because the app uses the service role, but follow the existing "Service role full access" pattern.
5. Prefer `apply_migration` / the CLI so the version lands in live history. Dashboard SQL leaves no record.
6. Never DROP or rewrite data in the same step as a schema change; take a backup first (see [[Runbook Brain]]).
7. After applying, update [[Tables]] and [[Enums and Status Values]] and add the file here.

## Rules and gotchas
- `ALTER TYPE ... ADD VALUE` cannot be undone and cannot be used in the same transaction that then uses the new value.
- Dropping and re-adding an FK (as the 2026-10-14 files do) briefly removes protection; run it in one transaction.
- Known issue: version ids differ between repo and live for the OTP migration, so `supabase db push` may try to re-run it. The SQL is idempotent (`IF NOT EXISTS`).
- Known issue: the guarantor function migrations exist only in live history. Pull them with `supabase db dump` before the next rebuild.

## Related
- [[Database Brain]], [[Live vs Repo Drift]], [[Tables]], [[Runbook Brain]], [[Tech Stack and Folder Map]]
