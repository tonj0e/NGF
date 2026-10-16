---
title: Live vs Repo Drift
section: 06 Database
status: current
last_verified: 2026-10-17
tags: [ngf, database, drift, rls]
---
# Live vs Repo Drift
**One line: where the live Supabase schema differs from `supabase_schema.sql` and the migration files, plus RLS state and how to rebuild.**

Compared 2026-10-17: live (read-only `information_schema` / `pg_catalog` queries) against `supabase_schema.sql` (570 lines), `migrations/` and `supabase/migrations/`.

## Exists live, no repo SQL
| Object | Notes |
|---|---|
| table `branch_staff_roles` | uuid PK, role check, unique active manager per branch (`uq_branch_manager`). Used in `app/api/staff/route.ts:84`, `branches/route.ts:99` |
| table `guarantor_branches` | uuid PK, unique (guarantor_id, branch_id). Used in `staff/route.ts:58`, `branches/route.ts:138` |
| column `agents.branch_id` | FK to branches, SET NULL |
| function `update_guarantor_atomic(p_user_id, p_name, p_email, p_guarantor_code, p_phone, p_address, p_status)` | SECURITY DEFINER; called at `app/api/staff/route.ts:191`. Live history has 3 migrations for it (add, fix status enum, harden security) that are NOT in the repo |
| function `rls_auto_enable()` | SECURITY DEFINER; looks like a Supabase helper; purpose not verified |

## Exists in repo, missing live
- All 12 `update_updated_at_column` triggers from `supabase_schema.sql:509+`: live has zero triggers (the function exists, unused). `updated_at` stays unchanged unless code sets it.
- Nothing else: all 24 repo tables exist live. Live has 27: the 24, plus `password_reset_otps` (migration file exists) and the 2 unscripted branch tables.

## Enum drift (repo `supabase_schema.sql:11-25` vs live)
Live adds: user_role `NGF AGENT`; user_status `Deleted`; agent_type `Verification & Collection`; verification_result `Submitted`; loan_status `Closed`; settlement_status `Settled`; capital_type `Own`, `Investor`. Some came from loose files `fix_all_enums.sql`, `fix_capital_enum.sql`, `phase3_completion.sql`; the rest were applied in the dashboard.

## Values the code writes that live enums reject
| Code | Writes | Column | Live allows |
|---|---|---|---|
| `lib/deposits.ts:4-6`, `deposits/route.ts:73` | Deposit, Interest Payout, Principal Withdrawal | deposits.type (deposit_type) | Commission, Capital, Refund, Other |
| `deposits/request/route.ts:36,62` | Principal, Interest | deposit_requests.type | same four |
| `deposits/request/route.ts:94` | Paid | deposit_requests.status | Pending, Approved, Rejected |
Live `deposits` and `deposit_requests` have 0 rows, which fits: these writes fail. See [[Deposits]]. Everything else I traced (lead, loan, repayment, payout, settlement values) is accepted; see [[Enums and Status Values]].

## Migration history drift
Live `list_migrations` shows 7 versions. Repo `supabase/migrations/` has 4. Live-only: 20261015162402, 20261015162739, 20261015163957 (all guarantor function). Repo-only: `migrations/2026-09-05-complete-fixes.sql` (dashboard-run, never in the Supabase history). OTP migration is `20261016120000` in the repo but `20261016101737` live (same content, different version id). See [[Migrations]].

## RLS state
All 27 tables: RLS enabled. 22 tables have one policy "Service role full access" (`auth.role() = 'service_role'`, command ALL). No policy: `agent_attendance`, `agent_trips`, `branch_staff_roles`, `guarantor_branches`, `password_reset_otps`. With no policy, only the service role (which bypasses RLS) can touch them. The repo enables RLS and creates policies for 22 tables (`supabase_schema.sql:446-488`); `agent_trips` and `agent_attendance` have none there either. Recheck query in [[Queries We Use]].

## How to rebuild the schema
1. Create a new Supabase project.
2. Run `supabase_schema.sql` (tables, base enums, triggers, policies).
3. Run `fix_all_enums.sql` (NGF AGENT, Verification & Collection, Own, Investor).
4. Run `migrations/2026-09-05-complete-fixes.sql`, then the 2026-10-14 and 2026-10-16 files in date order.
5. Hand-add what has no SQL: `Deleted`, `Submitted`, `Closed`, `Settled` enum values, `agents.branch_id`, both branch tables, `update_guarantor_atomic`. Best fix: dump live with `supabase db dump --schema public` and commit it.

## Related
- [[Database Brain]], [[Tables]], [[Migrations]], [[Security Brain]], [[Open Security Leads]], [[Runbook Brain]]
