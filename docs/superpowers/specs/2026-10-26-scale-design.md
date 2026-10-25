# Scale to 50,000+ customers

Date: 2026-10-26. Owner: Tony (Admin). Status: waiting for owner review.

## Goal
400 customers are loaded after the build, +40 a week, growing to 50,000 or more in about two years. Every page must stay fast (list pages under 0.5 s, dashboards under 1.5 s at 50,000 customers and about 1,000,000 repayment rows) and never show wrong numbers.

## Why it breaks today (measured in the code, 2026-10-26)
1. Reads: `readTable` loaded whole tables. Since 2026-10-26 it reads every page (no wrong numbers), but each read is still one request per 1,000 rows (1,000,000 rows = 1,000 requests, tens of seconds, hundreds of MB).
2. Work in memory: routes load 4 to 6 whole tables, then filter with `.find()` inside loops. `GET /api/customers` does `loans.find` per customer: 50,000 x 50,000 = 2.5 billion steps. It times out long before 50,000.
3. About 26 routes do this (customers, loans, repayments, leads, leads/[leadId] 18 reads, dashboard, collection-sheet, settlements/due, collections, financial-analytics, projection, capital, commissions/payout, agent, disbursements, otp, renewalRules, paymentLinks, fileAccess).
4. Scores (`bulkScores`) read all repayments to rank customers.
5. The database itself is fine: Postgres handles millions of rows. Indexes on loan_id, customer_id, due_date, status, guarantor_id already exist.

## Design
### A. Data-access layer, `lib/db.ts` (new)
- `pageQuery(table, { filters, search, order, page, pageSize })` -> `{ rows, total }`: one request, filtering, ordering, counting and paging done by the database (`.range()`, `count: 'exact'`).
- `byIds(table, column, ids)`: chunks of 200 ids so URLs stay short, runs chunks in parallel.
- `scopeOf(session)`: the restriction every list needs, computed once from small tables (guarantors, guarantor_branches, branch_staff_roles, agents): Admin none; Staff the guarantor ids of their branches; Guarantor their id; Agent their loans.
- Rule after this change: request-time code never calls `readTable` on customers, loans, repayments or leads. `readTable` stays for small tables (users, branches, settings...).

### B. Lists done in the database, paged
Customers, Leads, Loans, Collection lists (pending, today, coming Saturday, past month, history), Disbursements, Payout requests: the route takes `page, pageSize, search, status, branch` and returns one page plus the total. The pages already show 20-50 per page; their search/filter boxes now call the server (debounced). Only the rows of the page are enriched with guarantor/agent/loan data (`byIds`).

### C. Totals and reports done by SQL
Dashboard, Reports, Financial Analytics, Collections, Capital, Projection, Settlements due, Collection sheet: Postgres functions (`rpc`) that return totals, grouped by branch / guarantor / week. Results cached 60 seconds on the server (per role and branch). Collection sheet streams in pages.

### D. Scores
`bulkScores` computes only for the 50 customers on the page, with one grouped query per page. (No stored column unless measurement says it is needed.)

### E. Indexes (DDL, each approved by the owner)
`pg_trgm` GIN indexes for name and phone search on customers and leads; `repayments(due_date, status)`, `repayments(loan_id, status)` partial index for Pending/Delayed; `loans(status, guarantor_id)`; `customers(created_at)`. Checked with `EXPLAIN ANALYZE`.

### F. Proof at scale
Generate fake data in a separate schema `scale_test` (50,000 customers, 50,000 loans, about 1,000,000 repayments, 2,000 guarantors, 20 branches) with the same tables and indexes, never touching live tables. Benchmark the new queries there (timings and `EXPLAIN`), then drop the schema. The owner approves creating and dropping the schema.

### G. Order of work (each step ships on its own)
1. `lib/db.ts` + tests. 2. Customers list. 3. Collection lists + sheet + settlements due. 4. Leads, loans, disbursements, leads/[leadId] (read one row by id, not whole tables). 5. Dashboard, reports, analytics, capital, projection, collections via SQL functions. 6. Scores per page. 7. Indexes. 8. Load test in `scale_test`, then fix what it shows. 9. Docs.

## Safety
- No live data changes; DDL is only new indexes and read-only SQL functions, each shown to the owner first.
- Every converted route keeps its current response shape (so pages keep working) and is compared to the old result on the live 2-row data and on the generated data.
- Permission checks (features, branch scope) stay exactly as now; the scope moves into the query.

## Not now
Archiving old repayments (needed only past about 10,000,000 rows), read replicas, moving off Hostinger.
