---
title: Lead 19 RLS gap in repo SQL
section: Security
status: open
last_verified: 2026-10-17
priority: 19
area: Database
fix_step: fix-10
fingerprint: rls-not-enabled-on-agent-trips-attendance-and-branch-tables
tags: [ngf, security, lead, database]
---
# Lead 19 RLS gap in repo SQL
**Public key holder to agent tables. Status: open, not yet fixed. Needs validation (nothing was run).**

## What the source shows
supabase_schema.sql enables RLS with service-role-only policies on 22 tables (lines 446-467), but agent_trips (line 536, GPS start/end coordinates) and agent_attendance (line 558, latitude/longitude) are created with no ENABLE ROW LEVEL SECURITY anywhere in the repo SQL (grep of all *.sql finds only CREATE TABLE and CREATE INDEX statements for them). branch_staff_roles and guarantor_branches are mapped in lib/supabase-db.ts TABLE_MAP but have no CREATE TABLE or RLS statement in any repo SQL file. The app uses the service-role key, so RLS never affects it and the gap is hidden. If RLS is off in the live project and default anon/authenticated grants exist, the public anon key could read or modify these tables through PostgREST. The anon key is not in the repo.

## Source trace
1. `supabase_schema.sql:536`: CREATE TABLE IF NOT EXISTS agent_trips with GPS columns; no ENABLE ROW LEVEL SECURITY in any repo SQL file.
2. `supabase_schema.sql:558`: CREATE TABLE IF NOT EXISTS agent_attendance with latitude/longitude; no RLS enablement.
3. `lib/supabase-db.ts:36`: TABLE_MAP maps AgentTrips, AgentAttendance, BranchStaffRoles and GuarantorBranches (lines 36-39) to tables not covered by any RLS statement in the repo.

## Why it is not confirmed
- Live RLS and grant state of the Supabase project is not source-visible (RLS may have been enabled out-of-band, or Supabase's default for tables created via the dashboard may apply).
- The anon key is not in the repo and the app does not use it, so an attacker must obtain it; it is normally public in the client of any Supabase-fronted app, but this app does not expose it.
- no OS-enforced sandbox with memory limits on this host; target code was not executed

## How to check it (safe, dummy data)
Grep all *.sql for ENABLE ROW LEVEL SECURITY per table and diff against TABLE_MAP values in lib/supabase-db.ts; already done in source: agent_trips, agent_attendance, branch_staff_roles and guarantor_branches have no RLS statement.

## Owner check
Owner runs in the Supabase SQL editor: select tablename, rowsecurity from pg_tables where schemaname='public' and tablename in ('agent_trips','agent_attendance','branch_staff_roles','guarantor_branches'); also check grants for anon/authenticated and the Security Advisor 'RLS disabled' lint. Where rowsecurity is false, run ALTER TABLE ... ENABLE ROW LEVEL SECURITY with no policies and add the DDL…

## Related
- [[Open Security Leads]], [[Security Fix Plan]] (step 10), [[Security Brain]]
