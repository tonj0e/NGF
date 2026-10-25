---
title: Scale and Speed
section: Database
status: current
last_verified: 2026-10-26
tags: [ngf, database, scale, performance]
---
# Scale and Speed
**One line: the database does the filtering, searching, counting, paging and adding up; the app only shapes the answer.** Built 2026-10-26 for 50,000+ customers (about 1,000,000 weekly payment rows). Design: `docs/superpowers/specs/2026-10-26-scale-design.md`, plan `docs/superpowers/plans/2026-10-26-scale.md`.

## The rule
Request-time code must **not** call `readTable` on customers, loans, repayments, leads, collections or notifications. `readTable` stays for small tables (users, guarantors, agents, branches, settings, capital). Supabase returns at most 1000 rows per request (`max_rows`), so `readTable` and `selectAll` read page by page in primary-key order (`lib/paginate.ts`).

## Helpers (`lib/db.ts`, `lib/db-pure.ts`, `lib/supabase-db.ts`)
- `pageQuery(table, {filters, search, order, page, pageSize})` -> rows + exact total, one request. Last `order` entry must be the id, so pages never overlap.
- `byIds(table, column, ids)`: chunks of 200 ids in parallel, all pages. `selectAll`, `selectRows`, `countRows`, `getRowById` in `lib/supabase-db.ts`.
- `scopeOf(session)` + `withScope(qb, scope)`: Admin all, Guarantor own id, Staff their branches' guarantor ids, else none. Agents are scoped by `assigned_agent_id` in the route.
- `cleanSearch(text)`: removes characters that could add a filter inside `or=(...)`. `companyTotals()`: company-wide sums.
- Limit to remember: a scope with more than ~600 guarantor ids (a very large branch) makes a long address; plan a `branch_id` column on customers/loans/leads if a single branch ever grows that large.

## Database objects added (all read-only, no data changes; each approved by the owner)
Views: `loans_overdue`, `loans_renewal_eligible`, `repayments_enriched`, `collection_sheet_rows`, `settlement_lines`, `collections_enriched` (all `security_invoker`, service role only). Functions: `repayment_day_summary`, `repayment_paid_summary`, `dashboard_metrics`, `settlement_summary`, `company_totals`. Indexes: repayments `(due_date,status)`, pending partial, `paid_date`; trigram on customers name/phone and loans loan_id; created_at on customers/loans; settlements `(saturday_date, entity_id)`; collections `payment_date`. Files: `supabase/migrations/20261026100000` to `20261026150000`.

## Routes now paged / filtered by the database
`GET /api/customers` (page, pageSize, q, id), `/api/loans` (filter, page, q, createdFrom/createdTo), `/api/repayments` (mode, month, customerId, loanId, search, page), `/api/leads` (tab, branch, q, cheque, counts), `/api/collection-sheet` (page, q), `/api/notifications`, `/api/settlements` (+ `/summary`, `/due`), `/api/collections`, `/api/dashboard`, `/api/disbursements`, `/api/commissions/payout`, `/api/reports`. Totals: `/api/capital`, `/api/financial-analytics`, `/api/projection`, org chart earnings, staff list.
Bugs found and fixed on the way: Leads page showed only the first 20 leads; History and Past Month tabs were empty (server sent only unpaid weeks); dashboard hid unread notifications; Financial Analytics treated every loan as missing; disbursement list showed zero terms for renewals.

## Speed test (2026-10-26, fake data, since deleted)
Run in a temporary schema `scale_test` (dropped afterwards; the live database went 15 MB -> 133 MB -> 15 MB): 10,000 customers, 10,000 loans of 20 weeks, 200,000 repayments, 122,000 collections, 400 guarantors, 10 branches = one fifth of the 50,000-customer target. Instance: small (about 1 GB RAM). Times are the database's own, per query, one at a time:

| What | At 1/5 size | x5 (rough) |
|---|---|---|
| Customers page / count / search (name, phone, place, loan id) | 2 / 4 / 50-80 ms | 10 / 20 / 250-400 ms |
| Loans page overdue / renewal-eligible (+count) | 9 / 7 ms (+26) | 45 (+130) ms |
| Collection lists: Saturday, one guarantor, branch | 4-14 ms | under 100 ms |
| Collection "pending" count | 83 ms | 400 ms |
| History (paid) list, after tuning | 2 ms | 10 ms |
| Past-month totals | 61 ms | 300 ms |
| Dashboard: guarantor / branch (40 guarantors) | 27 / 125 ms | 135 / 600 ms |
| Dashboard: Admin (cached 45 s) | 700-800 ms | 3-4 s first load |
| Settlements: one Saturday (after tuning) | 1 ms | 5 ms |
| Settlements: unsettled, two older weeks | about 350 ms | 1-2 s |
| Collection sheet page (100) / one guarantor | 240 / 22 ms | 1.2 s / 110 ms |
| Company totals | 140 ms | 700 ms |
| Leads counts / page / search | 9 / 3 / 76 ms | 45 / 15 / 380 ms |

Found and fixed by the test: settlements unsettled took 9 s (index not used for the date window, payment mode looked up twice per row, collectors re-added per output row); paid-history took 260 ms (no index matching its sort). Still the heaviest: the Admin dashboard (one pass over every repayment; the 45-second cache hides it) and the exact counts on long lists. If pages feel slow past about 10,000 customers, upgrade the database compute size first (Supabase: Small or Medium), then add summary tables.

## Not done yet / watch list
- Reports page: done 2026-10-26. Summary, month list and month totals come from `/api/reports` (functions `reports_summary`, `reports_months`, `reports_month`, view `report_staff_collections`, migration 20261026180000); customer and guarantor tabs are searched pages with stat cards (`reports_customer_cards`, `reports_guarantor_cards`); month lists load 100 at a time with "Show more", and a guarantor's customer lines load only on "Show customers". Totals were compared with the old browser formulas on test data: identical.
- Admin assistant (`/api/agent`) now uses counts and `company_totals` (overdue figures added by migration 20261026170000).
- Bank-statement check (`lib/payments.ts`) shows the latest 1000 bank lines (server cap) although the code asks for 2000.
- Compute size: the project runs on a small instance (about 1 GB RAM, 60 connections). Expect to upgrade compute before 10,000+ customers; see the benchmark below.
