---
title: Data Access Layer
section: Architecture
status: current
last_verified: 2026-10-17
tags: [ngf, architecture, supabase, data]
---
# Data Access Layer
**One line: `lib/supabase-db.ts` hides Supabase behind a Sheets-style API (PascalCase rows, whole-table reads, 30 s cache) using the service-role key.**

## Key facts
- One shared client: `createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { persistSession: false })` (`lib/supabase-db.ts:183-192`). `lib/supabase.ts` makes a second identical client for storage.
- Service-role key bypasses RLS. Security rests entirely on the route code ([[Auth and Sessions]], [[Roles and Permissions]]).
- 26 logical tables in `TABLE_MAP` (`:12-39`), e.g. `Users` to `users`, `StaffAccess` to `staff_access`, `GuarantorBranches` to `guarantor_branches`. Full schema: [[Tables]].
- Rows come back as `Record<string,string>` with PascalCase keys ("User ID", "Loan ID").

## How it works
| Function | Behaviour | Line |
|---|---|---|
| `readTable(table, {forceFresh})` | `select('*')` on the whole table, converts keys to PascalCase, caches 30 s in a module `Map` | `:224` |
| `appendRow` | PascalCase to snake_case, insert, clear that table's cache | `:245` |
| `updateById(table, pk, data)` | update where primary key matches, clear cache. Preferred updater | `:313` |
| `updateRow` / `deleteRow` | find the pk by array index (`rowIndex - 2`) after a whole-table read; legacy | `:261,292` |
| `deleteById`, `clearTable` | delete one row / all rows | `:473,331` |
| `queryTable`, `getRowById`, `getRowsByField` | real filtered queries (no cache) | `:449-471` |
| `findRecord`, `makeId`, `nowIso`, `paginate`, `getNextSaturday` | small helpers. IDs are prefix + 8 random chars | `:405-446` |

**Name mapping**: `COLUMN_MAP` (`:42-179`) turns "Password Hash" into `password_hash`. Unknown names fall back to lowercase with underscores; reverse fallback title-cases each word (`:197,210`). Some quirks: "NGF Agent ID" maps to `collection_agent_id` (`:96`). Keys such as "Blocked Until" and "Block Reason" are not in the map and work only through the fallback.
Primary-key columns are listed twice in `getPrimaryKeyColumn` / `getPascalPrimaryKey` (`:341,373`). `StaffAccess` uses only `user_id` although the table is also keyed by branch.

**Storage** (`lib/supabase.ts`): buckets `customer-docs`, `payment-proofs`, `profiles`. Files are base64 in and out. Proxy URL form `/api/drive/supabase:<bucket>/<path>` served by `app/api/drive/[fileId]/route.ts`, which needs any valid session. Payment proofs (`repayments`) and profile photos (`profile`) are saved here. Lead and customer photos still upload to Google Drive (`uploadLeadPhoto` in `lib/drive.ts:75`, used by `leads/route.ts:128`); the Supabase variant `uploadLeadPhotoSupabase` exists but is not called by those routes. `getSignedUrl` exists (1 h) but pages use the proxy.

## Rules and gotchas
- **Scale**: every `readTable('Loans')` pulls all rows and filters in Node. Roles are scoped in JavaScript after the read, e.g. `customers/route.ts:26-45`. Cost grows with total rows, not with what the user may see. Expect slow routes once tables reach tens of thousands of rows.
- **Cache is per server instance**: a write on instance A does not clear instance B. Reads up to 30 s stale on multi-instance hosting. Login and several admin routes use `forceFresh`.
- **Cache returns the same array object**: mutating a returned row changes the cache.
- **No transactions**: multi-step writes (repayment then collection, loan then repayments) can half-fail.
- **Index based `updateRow`** races with inserts. Use `updateById`.
- Writes use `Record<string,string|null>`; numbers are passed as strings and Postgres coerces them.
- **Security consequence**: any bug that skips a role check exposes the full table. The anon key is not used server-side, so RLS policies protect nothing from this app. See [[Security Brain]].
- Legacy `lib/sheets.ts` is only imported by `app/api/dev/migrate-db/route.ts:3`.

## Related
- [[Architecture Brain]], [[Tables]], [[Enums and Status Values]], [[Integrations]], [[Config and Env Vars]], [[Open Security Leads]]
