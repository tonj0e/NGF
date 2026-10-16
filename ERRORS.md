# NGF CRM — Bug Reference Guide

A record of all bugs encountered and fixed in this project. Use this as a reference to avoid repeating the same mistakes.

---

## Key Rules (Read This First)

1. **Always publish OAuth apps to production** before deploying. Testing mode tokens expire after 7 days.
2. **Always use IST offset for date calculations.** The server runs UTC. India is UTC+5:30. Never use `getDay()`, `setDate()`, `getDate()` — always use `getUTCDay()`, `setUTCDate()`, `getUTCDate()` after applying `istOffset = 5.5 * 60 * 60 * 1000`.
3. **Keep `LEADS_COLUMNS` (and any SHEETS config) in sync with the actual Google Sheet headers.** Any column added in code must also be added to the sheet. Verify after every change.
4. **After fixing a column mismatch, clear all garbage data from the affected sheet rows** before going live. Test an append with a dummy row first.
5. **Always verify the actual API response shape** before referencing fields in frontend code. Use the exact camelCase field names the API returns.
6. **Always provide a fallback for React list keys** when data integrity cannot be guaranteed (e.g., `key={item.id || index}`).

---

## Error #1 — OAuth Refresh Token Expiring Every 7 Days

**Symptom:** Authentication breaks every 7 days; API calls fail with token expiry errors.

**Cause:** The Google OAuth consent screen was left in "Testing" mode. In testing mode, Google automatically expires refresh tokens after 7 days.

**Fix:** Published the app to production in Google Cloud Console:
- Navigate to APIs & Services → OAuth consent screen → Audience
- Click "Publish app" to move out of Testing mode

**Prevention:** Always publish the OAuth consent screen to "In production" before deploying the app to any environment used by real users. Never leave it in Testing mode in production.

---

## Error #2 — Customer Photos Showing "Failed — click to open in Drive"

**Symptom:** Customer photos fail to load in the CRM; the image placeholder shows "Failed — click to open in Drive".

**Cause:** The Google OAuth refresh token had expired. This is a downstream effect of Error #1 — the app was still in Testing mode and the 7-day token had lapsed.

**Fix:**
1. Generated a new refresh token by visiting `/api/drive/auth`
2. Updated `GOOGLE_OAUTH_REFRESH_TOKEN` in `.env.local` with the new token
3. Restarted the server

**Prevention:** Keep the OAuth app in production mode at all times (see Error #1). A production-mode refresh token does not have the 7-day expiry.

---

## Error #3 — New Loan Repayment Due Dates Landing on Wrong Day (Thursday Instead of Saturday)

**Symptom:** Newly created loans had repayment due dates set to Thursday instead of the correct Saturday.

**Cause:** `getNextSaturday()` in `lib/sheets.ts` used `new Date()` which returns UTC server time. India is UTC+5:30, so when it was Wednesday morning IST the server's UTC clock still showed Tuesday — causing the Saturday calculation to be off by two days.

**Fix:** Updated all date utility functions to apply the IST offset before performing day-of-week calculations:
- `getNextSaturday()` — added IST offset, switched to `getUTCDay()` and `setUTCDate()`
- `addDays()` — switched to `setUTCDate()`/`getUTCDate()`
- `firstSaturday()` in the import-customer route
- `thisSaturday()` in `SettlementsPage`
- `getSchedule()` in `ImportCustomerPage`

**IST offset constant:**
```ts
const istOffset = 5.5 * 60 * 60 * 1000;
const nowIST = new Date(Date.now() + istOffset);
```

**Prevention:** ALWAYS apply the IST offset when doing any date or day-of-week calculation. Never use the local date methods (`getDay()`, `setDate()`, `getDate()`) on a UTC server. Use only:
- `getUTCDay()` — day of week
- `getUTCDate()` / `setUTCDate()` — day of month
- `getUTCHours()` — hours

---

## Error #4 — Lead Submissions Writing to Wrong Columns in Google Sheets (Blank Rows in Admin Portal)

**Symptom:** New lead submissions appeared as blank rows in the admin portal. Data was being written to far-right columns (IS, IT, etc.) instead of column A onwards.

**Cause:** `Account Number` and `IFSC Code` were added to `LEADS_COLUMNS` in `lib/config.ts`, bringing the total to 37 columns. However, the corresponding header columns were never added to the actual Google Sheets Leads spreadsheet, which still had only 35 headers. Because `appendRow` writes values positionally by array index, a 37-value array written to a 35-column sheet caused Google Sheets to scatter the last values into far-right columns.

**Fix:**
1. Added `Account Number` and `IFSC Code` headers to the sheet via the Sheets API
2. Rewrote the entire header row to exactly match the order in `LEADS_COLUMNS`
3. Corrected the 9 existing data rows where `Updated At` had been misplaced into the `Account Number` column
4. Cleared all garbage data from row 12 onwards (previous broken submissions had written to columns IS–KC)

**Prevention:** Whenever you add or remove columns in `LEADS_COLUMNS` or any other SHEETS config array, you MUST also update the header row in the actual Google Sheet to match. The sheet headers and `LEADS_COLUMNS` must always be identical in both content and order. Run a verification step after any column change.

---

## Error #5 — Google Sheets Append Writing to Wrong Row (Row 18 at Column IS Instead of Row 12 at Column A)

**Symptom:** After fixing the column mismatch (Error #4), new appends still went to the wrong location — row 18 at column IS instead of the next empty row at column A.

**Cause:** The previous broken submissions (from Error #4) had written data scattered across hundreds of columns (IS, IT, KC, etc.). Google Sheets' `values.append` with `range: 'Leads'` detects the "last used range" across the entire sheet, including those far-right cells. This caused new appends to be placed far to the right and below existing data.

**Fix:** Cleared all data from row 12 onwards using the Sheets API:
```
spreadsheets.values.clear on range 'Leads!A12:ZZ999'
```

**Prevention:** After fixing any column mismatch, always clear all garbage data from the sheet before resuming normal operation. Test append behavior with a single dummy row and verify it lands in the correct position before going live.

---

## Error #6 — "Coming Saturday" Tab Showing Wrong Date

**Symptom:** The "Coming Saturday" tab in the repayments view displayed an incorrect date.

**Cause:** Same root cause as Error #3 — the server calculated the next Saturday using UTC time instead of IST, producing a date that was off by one week in edge cases around midnight IST.

**Fix:** Applied the IST offset to the Saturday calculations in the repayments route.

**Prevention:** See Error #3. Every Saturday (or any day-of-week) calculation anywhere in the codebase must use the IST offset.

---

## Error #7 — Guarantor View Showing 0 Customers, 0 Commission, 0 Balance

**Symptom:** The guarantor detail view displayed zeroes for customer count, commission, and balance despite the guarantor having active loans.

**Cause:** The frontend was referencing wrong API response field paths (`data.rows` instead of `data.loans` / `data.customers`) and wrong field names — raw sheet column names like `"Guarantor ID"` instead of the camelCase enriched field names like `guarantorCode` that the API actually returns.

**Fix:** Updated the guarantor view to use the correct field paths and camelCase field names that match the actual API response shape.

**Prevention:** Always inspect the actual API response (e.g., via the browser network tab or a test `console.log`) before wiring up field names in frontend code. Do not assume field names match raw sheet column headers — the API layer transforms them to camelCase.

---

## Error #8 — Active Customers Count Showing Zero in Guarantor View

**Symptom:** The active customers count in the guarantor view showed 0 even when the guarantor had customers with active loans.

**Cause:** The filter was checking `c.status === 'Active'`, but the customers API returns the field as `loanStatus` (not `status`) to represent the active loan state.

**Fix:** Changed the filter condition from `c.status === 'Active'` to `c.loanStatus === 'Active'`.

**Prevention:** Check the exact field names returned by each API endpoint. Do not guess field names or assume they follow a universal convention — each endpoint may use different names. Confirm with the actual response object.

---

## Error #9 — Duplicate React Key Error in LeadsPage

**Symptom:** React console warning: "Encountered two children with the same key." Some lead rows may have rendered incorrectly or been skipped.

**Cause:** Some lead rows in the Google Sheet had empty Lead ID values (a result of the corrupted rows from Error #4). Multiple list items rendered with `key=""`, which React treats as a duplicate key.

**Fix:** Changed `key={l.leadId}` to `key={l.leadId || i}`, using the array index as a fallback when the Lead ID is missing.

**Prevention:** Always provide a fallback for React list keys whenever data comes from an external source (database, spreadsheet, API) where rows may be incomplete or corrupted. The pattern `key={item.id || index}` is a safe default for such cases.

---

## Error #10 — Hostinger Deployment: `GOOGLE_SERVICE_ACCOUNT_KEY` JSON Parse Failure

**Symptom:** Login shows `Unexpected token '\', '\{"type":"'... is not valid JSON` after deploying to Hostinger.

**Cause:** Hostinger's environment variable storage corrupts JSON values — it adds escaping backslashes before `{` characters and mangles `\n` newlines inside the private key. Any raw JSON pasted into Hostinger's env var field will be corrupted.

**Fix:** Base64-encode the entire JSON key before storing it in Hostinger:
```bash
# On your Mac terminal, run:
cat .env.local | grep GOOGLE_SERVICE_ACCOUNT_KEY | sed "s/GOOGLE_SERVICE_ACCOUNT_KEY=//;s/^'//;s/'$//" | node -e "const chunks=[]; process.stdin.on('data',d=>chunks.push(d)); process.stdin.on('end',()=>console.log(Buffer.from(chunks.join('')).toString('base64')))"
```
Then store the resulting base64 string (starts with `eyJ`) as the env var value in Hostinger.

Update `lib/google.ts` to decode base64 at runtime:
```ts
let jsonStr = key.trim()
if (!jsonStr.startsWith('{')) {
  jsonStr = Buffer.from(jsonStr, 'base64').toString('utf8').trim()
}
const creds = JSON.parse(jsonStr)
```

**Also fixed during this deployment:**
- Moved `@tailwindcss/postcss` and `tailwindcss` from `devDependencies` to `dependencies` in `package.json` — Hostinger production builds skip devDependencies, causing the CSS build to fail with `@tailwindcss/postcss module not found`.

**Prevention:**
- Never store raw JSON in Hostinger environment variables — always base64 encode it first.
- Always put CSS build tools (`tailwindcss`, `@tailwindcss/postcss`) in `dependencies` (not `devDependencies`) for Hostinger deployments.
- When adding a new env var with JSON or special characters for Hostinger, base64 encode it first.

---

## Error #11 — Closed/Completed Loans Appearing in Upcoming Settlements

**Symptom:** A guarantor's "This Saturday" settlement card showed a ₹1,000 cash collection from a customer whose loan was already closed, plus uncollectible unpaid dues. The amount was attributed to the guarantor as cash even though nobody collected it and it wasn't Saturday.

**Cause:** `/api/settlements/due` filtered repayments only by `Due Date === saturday`, ignoring loan status. A week marked `Paid` on a `Completed` loan — with no Collection Agent ID, no Payment Mode, and no Notes — was read by the Settlements page as `Paid` + empty mode (→ "Cash") + empty collector (→ attributed to guarantor), producing a phantom collection. Closing a loan leaves the repayments' original `Due Date` intact, so they keep matching the settlement Saturday.

**Fix:** In `/api/settlements/due`, exclude weeks belonging to `Closed`/`Completed` loans unless they were genuinely collected. The reliable signal for a real collection is a non-empty `Collection Agent ID` (the repayments API always stamps `session.userId` when a payment is marked). Rule: for an inactive loan, keep a week only if `Status === 'Paid' && Collection Agent ID` is set; always drop `Waived`; leave active loans untouched.

**Prevention:**
- Settlement/collection date filters must also be loan-status aware — a repayment's `Due Date` is not cleared when its loan is closed, foreclosed, or settled.
- Treat `Collection Agent ID` as the source of truth for "was this actually collected by someone." `Paid` status alone is not sufficient (it can be set administratively or via import with no collector).
- Before patching this class of bug, dump the real repayment rows (status, paid date, collector, mode, notes, loan status) instead of assuming which close action produced the state.

---

*Last updated: 2026-06-11*
