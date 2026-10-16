---
title: Lead 01 Open migrate-db route
section: Security
status: open
last_verified: 2026-10-17
priority: 1
area: Dev tools
fix_step: fix-1
fingerprint: dev-migrate-db-get-unauthenticated-sheet-to-db-overwrite
tags: [ngf, security, lead, dev-tools]
---
# Lead 01 Open migrate-db route
**Unauthenticated caller to production tables. Status: open, not yet fixed. Needs validation (nothing was run).**

## What the source shows
The GET handler of the dev migration route has its Admin check commented out, and it has no dev-only or production guard. apiHandler only maps thrown errors to status codes and adds no authentication. Any unauthenticated caller can trigger a migration. The service-account Sheets client reads each legacy sheet, and the service-role Supabase client upserts the rows into users, settings, loans, repayments, capital and the other tables. If Sheets holds stale or legacy data, a remote caller could revert passwords and roles, null out password hashes (empty strings listed in EMPTY_STRING_FIELDS become null), and roll back financial state. The `table` query parameter selects a single table, which is not checked against the allowed table list. With dryRun=true the endpoint still drives Google API quota. Whether an overwrite actually succeeds depends on deployment facts that source cannot settle.…

## Source trace
1. `app/api/dev/migrate-db/route.ts:195`: No authentication or role check, because the requireRole line is commented out. It reads dryRun and table from the query string.
2. `app/api/dev/migrate-db/route.ts:139`: Calls readFromSheets(table) and normalises each row with cleanRow. Empty protected fields such as password_hash become null.
3. `lib/sheets.ts:23`: Reads the hardcoded spreadsheet IDs from lib/config.ts with the Google service-account client. The first row is used as column keys unchanged.
4. `app/api/dev/migrate-db/route.ts:153`: supabase.from(targetTable).upsert(cleaned, {onConflict: pk}) with the service-role client would overwrite live rows if the sheet keys match column names.

## Why it is not confirmed
- No OS-enforced sandbox with memory limits on this host; target code was not executed
- Whether the live Sheets tabs use headers that map to Supabase column names is unknown. Title Case headers make every upsert fail with a column error, and snake_case headers allow the overwrite.
- Whether GOOGLE_SERVICE_ACCOUNT_KEY is set in production and whether the legacy sheets still hold data is unknown
- Whether the route is deployed and reachable in production, with the dev route not removed or blocked at the proxy, is unknown

## How to check it (safe, dummy data)
In an isolated fixture with dummy Supabase and Sheets stubs and no real credentials, call GET /api/dev/migrate-db?table=Users&dryRun=true with no Authorization header. Confirm a 200 response and a nonzero success count. Then call it without dryRun against a throwaway Supabase fixture, once with snake_case sheet headers and once with Title Case headers. Confirm the users row is overwritten only in the snake_case case.

## Owner check
Without calling the live endpoint, the owner checks whether the configured spreadsheets contain the tabs with data and which header style they use. They also confirm whether GOOGLE_SERVICE_ACCOUNT_KEY is set in production, and review access logs for unauthenticated GET /api/dev/migrate-db requests. Fix: restore `await requireRole(req, ['Admin'])` and call devOnlyGuard() in both handlers, or delet…

## Related
- [[Open Security Leads]], [[Security Fix Plan]] (step 1), [[Security Brain]]
