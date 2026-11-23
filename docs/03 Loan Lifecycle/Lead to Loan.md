---
title: Lead to Loan
section: 03 Loan Lifecycle
status: current
last_verified: 2026-10-17
tags: [ngf, loan-lifecycle, leads, approval]
---
# Lead to Loan
> **Changed 2026-10-21:** the agent's visit needs the customer's OTP; approval only queues the lead (`Approved`); the loan and schedule are created by the new `disburse` action, with the first payment on the next Saturday after the handover. See [[Customer OTP and Disbursement]].
**The end-to-end path from a guarantor's lead to an active loan with a repayment schedule.**

## Key facts
Statuses in the order the code uses them (enum `lead_status`, `supabase_schema.sql:13`):

| Status | Set by | Where |
|---|---|---|
| Pending | Guarantor submits | `POST /api/leads` (`app/api/leads/route.ts:76`) |
| Agent Assigned | Admin/Staff `assignAgent` (also "Request Reverification") | `app/api/leads/[leadId]/route.ts:60`, `:200` |
| Partially Verified | NGF AGENT `submitPartialVerification` (customer not at home; added 2026-11-20) | `[leadId]/route.ts` |
| Verification Submitted | NGF AGENT `submitVerification`, or Admin/Staff `completeVerification` of a Partially Verified lead | `[leadId]/route.ts` |
| Approved | Branch approver or Admin approves. **Now means "waiting to be disbursed"** (OTP checked) | `adminReview` |
| Converted | **Mark disbursed**: end of `approveLoan` / `approveRenewal` | `[leadId]/route.ts` action `disburse` |
| Rejected | Admin/Staff reject, or auto-reject at creation | `[leadId]/route.ts:196`, `leads/route.ts:109` |

`Under Review` and `Verification In Progress` exist in the enum and `lib/config.ts:11` but no code ever sets them.

| Step | Role | Page | Route |
|---|---|---|---|
| Submit lead | Guarantor | `SubmitLeadPage.tsx` (button "+ New Lead" in `LeadsPage.tsx`) | `POST /api/leads` |
| Assign agent | Admin, Staff | `LeadsPage.tsx` | `PATCH /api/leads/:id` action `assignAgent` |
| Verify | NGF AGENT | `VerificationsPage.tsx` | action `submitVerification` |
| Partial verify (customer not at home) | NGF AGENT | `VerificationsPage.tsx` | action `submitPartialVerification` |
| Complete a partial verification | Admin, Staff (`leadsEdit`, own branch) | `LeadsPage.tsx` > `CompleteVerificationForm.tsx` | action `completeVerification` |
| Approve / reject / reverify | Admin, Staff | `LeadsPage.tsx` | action `adminReview` |
| Delete lead | Admin, Staff | `LeadsPage.tsx` | `DELETE /api/leads/:id` |

## How it works
1. Submit: server validates with `createLeadSchema` (name, phone >= 10 chars, product required, Aadhaar exactly 12 digits if given). If the Aadhaar already belongs to a `Converted` lead the new lead is saved as `Rejected` with decision "Auto-rejected: existing customer found." Admins are notified.
2. `GET /api/leads` adds `aadhaarStatus = exists` when another lead has the same Aadhaar; the UI shows "Existing Customer - High Risk of Fraud".
3. Assign: sets `Assigned Agent ID`, notifies the agent.
4. Verify: agent submits form, photos upload to Drive, Admin is notified. See [[Verification and Documents]].
5. Approve: the page sends the chosen product key (detail view) or none (list buttons, then the lead's own product is used; if not found, the first product).
6. `approveLoan` (`[leadId]/route.ts:310`):
   - Customer: reuse the one with this `Lead ID`, else insert (id from `makeId('CUST')`). `Active Loan ID`, `Status = Active`.
   - Loan id `<guarantorCode>-<4 random digits>` (`makeLoanId`, `:298`).
   - Loan: `Start Date` = next Saturday in IST (today if Saturday), `End Date` = start + (weeks-1)*7 days.
   - Repayments: one row per week, `Pending`, due every 7 days; last week uses `lastWeekCollection`.
   - Lead set to `Converted` and `Loan Product` rewritten to the product key.
   - If the customer already has an `Active` loan, that loan row is updated in place (new Loan ID, new terms) and its repayments are deleted first (comment cites the unique constraint).
7. Guarantor is notified of approve/reject.

## Rules and gotchas
- Roles are enforced by `requireRole` per action: `submitVerification` is NGF AGENT only; `assignAgent`, `update`, `adminReview`, `scanFolder`, DELETE are Admin or Staff.
- Known issue: the server does not check the lead's current status. `adminReview` approves any lead, even `Pending` or already `Converted` (`[leadId]/route.ts:166`). Only the UI gates by status.
- Known issue: status is set to `Approved` before `approveLoan` runs (`:185`). If `approveLoan` throws, the lead stays `Approved`; the UI only shows approve buttons at `Verification Submitted`, so it is stuck.
- Known issue: `Verification Status` column is read (`leads/route.ts:62`) but never written, so the "Verification Status" field is always blank. The agent's result is in `Recommendation Status`.
- Known issue: `SubmitLeadPage.tsx` lists only built-in products from `APP_CONFIG`, not the DB products ([[Loan Products and Math]]).
- Edit lead (`action update`) uses `body.x || lead.x`, so a field cannot be cleared.
- Deleting a lead cascades to customers with that `Lead ID`, their repayments and loans (`:257`). Not transactional.
- Admin/Staff see all leads; Guarantors only their own; agents only assigned ones (`leads/route.ts:25`). Pagination default is 20 rows.
- The list auto-refreshes every 15 s while idle.

## Related
[[Loan Lifecycle Brain]] [[Loan Products and Math]] [[Verification and Documents]] [[Renewals]] [[Customers and Import]] [[Roles and Permissions]] [[Enums and Status Values]] [[Repayments and Collections]] [[Data Access Layer]]

## Leads History by week and day (2026-10-26)
- The History tab groups leads by week (since 2026-11-23: Monday to Sunday with the shared labels "This week · 23–29 Nov", see below; before that Monday to Friday, "Oct 26 – 30"). Open a week to see its days, open a day to see that day's leads. Saturday/Sunday rows appear only if a lead was taken then. "Show older weeks" loads 12 more weeks.
- Code: `components/pages/LeadsHistoryWeeks.tsx`; server `GET /api/leads?tab=history&days=1&weeks=N` (counts per day) and `&day=YYYY-MM-DD` (that day's leads). Search and branch filters apply.
- A guarantor picks a **Lead day** when submitting (today by default, or a weekday up to the end of next week, so a lead taken late in the week is filed on next week; the server accepts up to the Sunday of next week since 2026-11-23, before that 14 days ahead) so a lead taken earlier lands in the right week. Field: `submittedDate`.
- On phones the Leads tabs scroll sideways in one row, short labels ("Renewal"), and the search/branch/delete controls stack.

- Guarantor "In Progress" page now has two side-by-side tabs under the New Lead / Renewal buttons (tap one to show only that list): **Not completed** (Pending, Agent Assigned) and **Completed** (agent submitted the verification, or Approved). A lead moves to Completed by itself when the agent finishes; Converted/Rejected go to History.

## Leads page speed (2026-11-07)
`GET /api/leads` now counts the tab badges at the same time as it loads the page rows (before, counting waited for the rows), and reads the branch tables while the scope is worked out. The Leads screen loads the agent and loan-product lists once, in parallel, in the background (before: two more calls in a row after the leads, and again every 15 seconds). Database is Supabase ap-southeast-2 (Sydney): every sequential round trip costs time, so fewer sequential steps = faster.

## Leads list speed, part 2 (2026-11-19)
- Tab badges: one call to the database function `lead_badge_counts` (migration `20261119120000_lead_badge_counts.sql`, same scope and rules as the seven head counts) instead of seven requests. Until that migration is applied the route gets "function not found", falls back to the seven head counts and does not try the function again for 10 minutes.
- `&counts=0` skips the badge counts (`counts: null` in the reply). The agent's Verifications list (`VerificationsPage.tsx`) uses it: it reads only the rows.
- After the page rows: guarantor and agent names read only `guarantor_id,name` / `agent_id,name`, and the same-Aadhaar check reads only `aadhaar_no` (it used to download every column of every lead with that Aadhaar just to count them). `byIds` / `selectAll` take an optional column list.
- An agent's own Agents row is read together with permission and scope, not after them.

## Leads list speed, part 3 (2026-11-19)
- The page rows, their guarantor and agent names, and the same-Aadhaar count now come back in **one** database call (before: page, then three follow-up reads). Names are embedded through the foreign keys `leads_guarantor_id_fkey` / `leads_assigned_agent_id_fkey`; the count is the computed column `lead_same_aadhaar_count` (migration `20261119170000_lead_same_aadhaar_count.sql`: leads with the same `aadhaar_no`, the lead itself included, service role only). Code: `leadsPage()` in `app/api/leads/route.ts`; `pageQuery` / `selectRows` take an optional `columns`.
- Until that migration is applied the one-call read fails ("column ... does not exist"), the route uses the plain page read and the three follow-up reads as before, and does not try the one-call form again for 10 minutes. Same JSON either way (checked with a read-only old-vs-new script on live data).

## Returned leads (2026-11-09)
New lead status **Returned** (database enum `lead_status`, columns `leads.return_reason`, `returned_at`, `returned_by`; migration `20261109130000_lead_returned.sql`). It is set by the planner's Return button on Verification Routes (see [[Verification Day Routes]]) when a customer cannot or does not want to continue yet. Guarantor: the Leads page, In Progress tab, has a third part **Returned** next to Not completed and Completed, each card showing "Returned by the office" and the reason. Office: Returned leads are left out of New leads (all three parts) and appear in History. Returned leads cannot be assigned an agent (`/api/leads/[leadId]` assign guard). A returned lead is not re-opened automatically: the guarantor sends a new lead when the customer is ready.

## Partial verification (2026-11-20)
The agent visits, the customer is not at home, the agent cannot come back. Full design: [[Verification and Documents#Partial verification (2026-11-20)]].
- New status **Partially Verified** (enum `lead_status`, migration `20261120100000_lead_partially_verified_status.sql`), set by the agent's `submitPartialVerification`. Columns `partial_verified_at/_by`, `office_completed_at/_by` (migration `20261120100100_lead_partial_verification_columns.sql`).
- Leads page, New leads: a fourth part **Partially verified** between Assigned and Completed (`&stage=partial`; badge `stagePartial` from `lead_badge_counts`, migration `20261120100200_lead_badge_counts_partial.sql`, which also stops counting these leads under "New leads"). Rows show an amber note and a **Complete verification** button (Admin, or Staff with `leadsEdit`), plus Reject for `leadsApprove`. No reassign / re-verification of a Partially Verified lead for now (pending the owner's decision; the server refuses it).
- Office completion makes the lead **Verification Submitted**, so the normal approval and disbursement follow unchanged.
- Counted as an open lead for the same-Aadhaar duplicate check at lead creation. Guarantor: stays under "Not completed" with the note "bring the customer to the office".
- Oreo: `businessCounts().leads.partiallyVerifiedOfficeToComplete`; the leads topics show it in its own bucket "Office to complete" (not "with the agents").
- `lib/config.ts` `LEAD_STATUSES` lists it (sent to the browser at sign-in).

## Leads by week (2026-11-23)
Every Leads list (guarantor In Progress: Not completed / Completed / Returned; office New leads with its four parts; Renewal requests; History) is organised by the week the lead was submitted. Weeks run **Monday to Sunday, India dates** (the company week, same as Payment Chat).
- **Week headers:** the page's leads (newest first by `submitted_date`) sit under headers "This week · 23–29 Nov", "Last week · 16–22 Nov", "Next week · …" (a lead can be filed up to the end of next week), other weeks "9–15 Nov" (the year only when the week is not in the current year: "15–21 Dec 2025"). Each header shows how many leads that week has in the whole list; when the week runs over two pages it also says how many are on this page, and the header repeats on the next page. Headers stick to the top of the scroller while their week scrolls. Grouping is per page; paging is unchanged (20 per page; the pager only shows with more than one page).
- **Submitted date on every card:** "Submitted Mon 17 Nov" next to the phone number. A guarantor's Returned lead in History carries a tag "Returned · also under In Progress › Returned".
- **Week filter:** ‹ / drop-down / › picker (All weeks, Next week, This week, Last week, 25 older weeks). From All weeks ‹ goes to This week; › stops at Next week. Office: second row on phones next to the branch filter (drop-down only); guarantor/agent: above the list.
- **While loading** a new tab, part, week, page or branch the list shows a skeleton (a new search only dims it) and no empty message; the part counts show "…" until the chosen week's counts arrive.
- **Opening part:** until the user taps a part, an empty part gives way to the first part with leads (guarantor: Not completed → Completed → Returned; office: New → Assigned → Partially verified → Completed).
- **History** (`LeadsHistoryWeeks.tsx`, week → day → leads): with All weeks, only weeks that have leads are listed and the newest one opens; a chosen week shows alone, open.
- **Office filters on phones:** search + ⋯ (Apply loan product, Delete leads) on the first row, branch + week on the second; desktop keeps the buttons in the row.
- **API:** `GET /api/leads?weekStart=YYYY-MM-DD` keeps only `submitted_date >= Monday and < next Monday` (a non-Monday date is moved back to its Monday; anything not a date is ignored). Same scope and permissions; also works with `days=1` (History).
  - `view=pending|done|returned` (tab=new, **guarantor only**; any other value is ignored): the three parts, filtered on the server so paging is right. The guarantor's tab=new answer has `viewCounts` (one status+date read of their in-progress leads, in parallel with the page).
  - `weekTotals=1` (only the Leads page sends it): `weekTotals` for the week headers. With a week chosen it is the list total; for a guarantor it comes from the `viewCounts` read; otherwise the page rows, plus one count per **edge week** that can run over pages (first week when page > 1, last week when there is a later page; `pageWeekTotals`). Other callers (Verifications, Cheques pledged, MCP) get the same answer as before.
  - `weekStageCounts` (office, tab=new, week chosen): one status read of that week's in-progress leads, split with `stageOf`.
- **Counts:** the tab badges at the top (In Progress / New Leads, History, Renewal, Disbursements) always count **all weeks** (unchanged). The counts under them follow the week filter. A line under the picker says so with a "Show all weeks" link.
- **Lead day:** `POST /api/leads` accepts a `submittedDate` up to the **Sunday of next week** (`lastLeadDay`; before 2026-11-23 it was today + 14 days, which could reach the week after next and fall outside the picker). The Submit Lead page offers weekdays up to next week's Friday.
- Fixed on the way: the guarantor's Not completed / Completed / Returned counts used to be counted from the 20 leads on the current page only; they are now the whole part, from the server.
- Code: `lib/leadWeeks.ts` (pure helpers: weeks, labels, `viewOf`, `stageOf`, `pageWeekTotals`, `lastLeadDay`, the status lists; test `tests/unit/leadWeeks.test.ts`), `components/pages/LeadWeeks.tsx` (`LeadWeekPicker`, `LeadWeekGroups`, `LeadListSkeleton`), `components/pages/LeadsPage.tsx`, `components/pages/LeadsHistoryWeeks.tsx`, `app/api/leads/route.ts`.
