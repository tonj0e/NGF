---
title: Queries We Use
section: 06 Database
status: current
last_verified: 2026-10-17
tags: [ngf, database, sql, queries]
---
# Queries We Use
**One line: safe read-only SQL for common questions; run them in the Supabase SQL editor or the read-only MCP.**

All snippets are READ-ONLY (`SELECT` only). Do not select from `users` or `password_reset_otps`; they hold hashes. Column names are the live snake_case ones from [[Tables]].

## Repayments due this week (READ-ONLY)
```sql
select r.repayment_id, r.loan_id, r.week_no, r.due_date, r.amount, r.status
from repayments r
where r.status in ('Pending','Delayed')
  and r.due_date between current_date and current_date + 6
order by r.due_date;
```

## Past-due rows the app shows as Overdue (READ-ONLY)
`Overdue` is not stored; the API derives it (`app/api/repayments/route.ts:39`).
```sql
select loan_id, count(*) as late_weeks, min(due_date) as oldest_due
from repayments
where status = 'Pending' and due_date < current_date
group by loan_id order by late_weeks desc;
```

## Unpaid weeks per loan (READ-ONLY)
```sql
select l.loan_id, l.status, l.duration_weeks,
       count(*) filter (where r.status = 'Paid') as paid,
       count(*) filter (where r.status <> 'Paid' and r.status <> 'Waived') as unpaid
from loans l join repayments r on r.loan_id = l.loan_id
group by l.loan_id, l.status, l.duration_weeks;
```

## Guarantor branch links (READ-ONLY)
```sql
select g.guarantor_id, g.name, b.name as branch, gb.is_active
from guarantor_branches gb
join guarantors g on g.guarantor_id = gb.guarantor_id
join branches b on b.branch_id = gb.branch_id
order by b.name, g.name;
```

## Active branch staff roles (READ-ONLY)
```sql
select b.name as branch, s.role_in_branch, s.user_id
from branch_staff_roles s join branches b on b.branch_id = s.branch_id
where s.is_active order by b.name, s.role_in_branch;
```

## Enum values (READ-ONLY)
```sql
select t.typname, string_agg(e.enumlabel, ', ' order by e.enumsortorder) as vals
from pg_type t join pg_enum e on e.enumtypid = t.oid
join pg_namespace n on n.oid = t.typnamespace and n.nspname = 'public'
group by 1 order by 1;
```

## Foreign keys and delete rules (READ-ONLY)
```sql
select conrelid::regclass as tbl, pg_get_constraintdef(oid) as def
from pg_constraint
where connamespace = 'public'::regnamespace and contype = 'f' order by 1;
```

## RLS and policy count per table (READ-ONLY)
```sql
select c.relname, c.relrowsecurity as rls,
  (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=c.relname) as policies
from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r' order by 1;
```

## Status counts for a table (READ-ONLY)
```sql
select status, count(*) from loans group by status;  -- swap loans for leads, repayments, payout_requests
```

## Rules and gotchas
- Cast enums to text when comparing with free text: `status::text`.
- `agent_trips`, `agent_attendance` etc. may be empty; an empty result is not an error.
- Never run `UPDATE`/`DELETE` from this note; use a [[Migrations]] file or a route.

## Related
- [[Database Brain]], [[Tables]], [[Enums and Status Values]], [[Repayments and Collections]], [[Branches and Staff]]
