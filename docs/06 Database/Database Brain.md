---
title: Database Brain
section: 06 Database
status: current
last_verified: 2026-10-17
tags: [ngf, database, brain]
---
# Database Brain
**One line: map of the Supabase Postgres database (27 public tables, 15 enums, 3 functions) and which note answers what.**

The live database is the source of truth, not `supabase_schema.sql`. This section was checked against the live project on 2026-10-17 using read-only queries.

## Key facts
- 27 tables in `public`, all with RLS on. Only 22 have a policy ("Service role full access"); 5 have none (see [[Live vs Repo Drift]]).
- The app talks to Postgres only through the service-role client in `lib/supabase-db.ts` (see [[Data Access Layer]]). RLS is a backstop, not the access model.
- Every primary key is app-generated text (e.g. `LN...`), except `branch_staff_roles`, `guarantor_branches`, `password_reset_otps` (uuid).
- Code uses Sheets-style names ("Loans", "Repayment ID"); `TABLE_MAP` and `COLUMN_MAP` translate them to snake_case.

## Five things to remember
1. Live has tables and a function with no repo SQL: `branch_staff_roles`, `guarantor_branches`, `update_guarantor_atomic`, plus `agents.branch_id`.
2. Live has NO `updated_at` triggers, though `supabase_schema.sql` creates 12. The function `update_updated_at_column` exists unused. Code must set `updated_at` itself.
3. Deposit code writes values the live enums reject: ledger types `Deposit`, `Interest Payout`, `Principal Withdrawal`, request types `Principal`/`Interest`, and request status `Paid`. Live `deposits` and `deposit_requests` are empty.
4. `Overdue` is never stored. `app/api/repayments/route.ts:39` turns a past-due `Pending` row into `Overdue` on read.
5. `supabase_schema.sql` cannot rebuild the live schema alone; it lacks later enum values and tables. Rebuild steps are in [[Live vs Repo Drift]].

## Notes
| Note | What it answers | Read when |
|---|---|---|
| [[Tables]] | Columns, keys, delete rules, who touches each table | Writing a query or a route |
| [[Enums and Status Values]] | Allowed values and status flows | A write fails with an enum error |
| [[Live vs Repo Drift]] | Where repo SQL and live differ, RLS, rebuild | Before trusting `supabase_schema.sql` |
| [[Migrations]] | Migration files and the safe way to add one | Changing the schema |
| [[Queries We Use]] | Read-only SQL for common questions | Investigating data |

## Known issues
- Deposit enum mismatches (item 3). Details in [[Live vs Repo Drift]] and [[Deposits]].
- Five tables have RLS on with no policy; fine for service role, but see [[Open Security Leads]].

## Update this section when
- A migration is applied or a table, column, enum value or function changes.
- `TABLE_MAP` in `lib/supabase-db.ts:11` changes.
- A route starts writing a new status value.

## Related
- [[00 BRAIN]], [[Data Access Layer]], [[Security Brain]], [[Runbook Brain]]

## Row limit (2026-10-26)
Supabase returns at most 1000 rows per request (`max_rows` = 1000 on the project). `readTable` used to read a whole table in one request, so anything past row 1000 was silently dropped (repayments reach that at about 50 loans). Since 2026-10-26 `readTable` reads page by page in primary-key order (`lib/paginate.ts` `fetchAllPages`, tested in `tests/unit/paginate.test.ts`). Still open: direct queries that cap rows themselves (`bank_transactions` limit 2000 in `lib/payments.ts` returns 1000; long `.in(...)` lists) and speed: routes still load whole tables, so 400 customers (about 8000 repayment rows) means about 8 requests per full read. Next step is to filter in the database (per branch / per Saturday) on the busiest routes.
