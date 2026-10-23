---
title: Full Regression Report 2026-10-23
section: Runbook
status: current
last_verified: 2026-10-23
tags: [ngf, runbook, testing, regression]
---

# Full regression report, 2026-10-23
**Plain version: the loan journey (lead to loan, weekly payments, renewal, early closure) works. Two features are broken by the live database (Deposits cannot be saved; the Assistant Branch Manager role cannot be created), a few screens show or change data of other branches, and one agent page crashed (fixed in code).**

Run against the live database from `http://localhost:3000` with fake data only (names start with `REGTEST`, phones `90000000xx`, Aadhaar `9999999999xx`). No real SMS or WhatsApp was sent (neither is configured). Cleanup has NOT been done yet: see [[#Cleanup]] and `regtest-ledger.json` in this folder.

## Summary
| Area | Result | In plain words |
|---|---|---|
| 1 Lead flow: guarantor creates lead | PASS | Valid lead saved; same Aadhaar twice refused (even from another guarantor); an agent or other non-guarantor role is refused; bad Aadhaar length and bad phone refused. Minor: an unknown loan product name is accepted at lead time (see bugs). |
| 1 Branch accepts, assign agent | PASS | Manager assigns the agent; the manager of another branch is refused. |
| 1 Customer OTP | PASS | Wrong code refused; 5 wrong tries lock the code; an expired code is refused; a resend is blocked for 1 then 2 minutes; verified code cannot be reused; changing the phone after verification needs a new OTP; override needs 10+ characters. |
| 1 Approve and disburse | PASS | Approval only queues; disburse makes customer, loan and 10 weekly rows (Rs 1000 each, Rs 8500 net, first Saturday 2026-10-24, last 2026-12-26). Two clicks at once: exactly one wins. |
| 2 Cash, UPI/UTR, Waived, double pay | PASS | Cash and UPI paid; same payment sent twice in parallel: exactly one accepted; paying a paid or waived week is refused; Delayed and Not Paid are recorded; duplicate UTR is flagged, can be fixed, discarded or overridden by Admin only. |
| 2 Payment links | PASS | Link created and reused; a replaced (cancelled) link that the customer still paid is credited; a second payment on a Paid link is "already processed"; a payment on a newer link when the week is already paid is not credited and Admin is told; fee 1% adds Rs 10; fee outside 0-10 or "abc" refused; webhook without signature refused; closure link closes the loan. |
| 2 Guarantor settlement | PASS (with leak) | Cash and UPI amounts are right; negative, "NaN", "abc" and huge amounts refused. A manager of another branch can also record one (see bugs). |
| 2 Amount checks | PASS | 0, negative, NaN, text, null and 1e12 are refused on deposits, settlements, payouts, bank upload. Repayments take no amount from the caller. |
| 2 Loan completion | PASS | Loan became Completed when the last unpaid week was paid; foreclose marks the rest Waived and completes. |
| 3 Renewal (OTP) | PASS | Not allowed with a running loan, on hold, or for another guarantor's customer; duplicate request refused; needs the customer's OTP; accountant cannot override a renewal OTP; manager approves; disburse made a new loan. |
| 3 Close & Hold, Close permanently, Re-admit | PASS | Hold sets renewal date to the old end date (2026-12-26); permanent blocks renewal and new lead with the same Aadhaar; only Admin re-admits (needs 20+ characters); two parallel closes: one wins. Closure through a payment link also works. |
| 4 Commissions | PASS | 5 loans x Rs 500 = Rs 2500 earned for the test guarantor; one 35-day cycle 2026-10-24 to 2026-11-28; payout locked until then; payout request of 0, -1, NaN refused. |
| 4 Deposits | FAIL | Saving a deposit always fails (live database does not know the type names). The "withdraw more than balance" test could not run. |
| 4 Settlements, collection sheet | PASS | See above. Sheet lists the right customer and balance; download gate for guarantors opens Friday 5pm. |
| 4 Payouts | PASS (with leak) | Guarantor cannot see the all-requests list; any Staff can (other branches too). |
| 4 NGF Score | PASS | Customer with one completed loan shows 200 of 850, "Building". |
| 4 Reports and dashboard numbers | PARTIAL | Admin totals match the data (paid weeks equal collections, month total adds up after each test). Guarantor, agent and staff dashboards show whole-system totals (see bugs). |
| 5 Attendance, location | PASS | One attendance per day; bad coordinates refused; Staff see only their own branch's agents in the location list (manager A sees only agent A). |
| 5 Trips | FAIL then FIXED | Logging a trip with no lead failed; the Trip Details page crashed. Both fixed in code, see bugs. |
| 5 Visit routes, notifications, ID cards | PASS | Routes status reachable by all staff roles; notifications are per user; ID card (profile) works; a bad photo value is refused. |
| 6 Roles and menus | PASS | Admin 19 menus, branch manager 11, accountant 6, agent 7, guarantor 10; every menu opens without console errors. Forbidden calls return 401 or 403 (agent or guarantor on admin routes, guarantor on another's lead, staff creating an Admin). |
| 6 Staff branch isolation | FAIL (known) | Leads, disbursements, close-loan, OTP, location are isolated. Not isolated: see the leak table. |
| 7 Menu pages, Dev tabs | PASS | All 19 admin pages and all 12 Dev tabs load with no console errors, except the Google Maps key refusing `localhost` on Agent Tracking (an allowed-website setting, not code). One unexplained "IntersectionObserver" page error appeared once in the first sweep and did not repeat. |
| 7 Agent Tracking request rate | PASS | 6 requests in 30 seconds (one every 5 seconds). |
| Assistant Branch Manager role | FAIL | Cannot be created (database rule). Role not testable. |

Totals: 19 areas PASS (2 with leaks), 1 PARTIAL, 4 FAIL (2 of them fixed in code), 0 NOT TESTED in scope except the items listed under Untested.

## Bugs found
| # | Severity | Where | How to repeat | Status |
|---|---|---|---|---|
| 1 | High | Deposits (`POST /api/deposits`) | As Admin record a Deposit of 1000 for any guarantor: error "invalid input value for enum deposit_type". The live enum has only Commission, Capital, Refund, Other; the app sends Deposit, Interest Payout, Principal Withdrawal | NOT fixed in code; migration file written, NOT applied (owner decides). Also: the POST has no balance check, so once saved a withdrawal above the balance would be accepted (balance is clamped at 0 in the screen). |
| 2 | High | NGF Branches, create staff with role Assistant Manager | Create Staff with branch role `assistant_manager`: "violates check constraint branch_staff_roles_role_in_branch_check". Live constraint allows manager, accountant, cashier, collection_agent only | NOT fixed; same migration file (not applied) |
| 3 | Medium | Payment Matching (`/api/payments`) | Manager of branch B marks a UTR payment for a branch A guarantor's customer: accepted and the week became Paid | FIXED in code 2026-10-23 (uncommitted): `lib/payments.ts` limits Staff to guarantors of their branches (mark, edit UTR, override, discard, collect sheet, records, bank report, guarantor list). Typecheck clean; live re-test not done (demo logins in `.env.test` were rejected). |
| 4 | Medium | Staff branch isolation, still leaking | Branch B manager: customers GET (sees all 7 test customers), customers PATCH (edited a branch A customer), loans, repayments (list; POST by code), settlements GET and POST (recorded a settlement for branch A's guarantor), payouts list (all branches), profile GET of a branch A agent, customer history/score GET, attendance GET of another branch's agent, `/api/agent/location` stream (PATCH) takes any agent id. Staff list `/api/staff` shows all 17 users (no password hashes). Deposits not testable (bug 1) | FIXED in code 2026-10-23 (uncommitted) for customers GET/PATCH (DELETE now Admin only), customer history, loans, repayments list and POST, settlements GET/POST/PATCH and due, payouts list and approve, profile, attendance GET, location stream. Still open: `/api/staff` lists all users. Live re-test not done. |
| 5 | Medium | Dashboard for Guarantor, Agent, Staff | Guarantor's dashboard shows month collected 39000 and 7 active customers, which is the whole system, not their own | FIXED in code 2026-10-23 (uncommitted): `app/api/dashboard/route.ts` scopes loans, repayments, customers, leads and totals per role; Staff capital cards removed (Admin only). Live re-test not done. |
| 6 | Medium | Agent trips (`POST /api/agent/trips`) | Log a trip without a lead: foreign key error (empty text saved as lead id) | FIXED: `app/api/agent/trips/route.ts` now saves null. Verified. |
| 7 | Medium | Agent "Trip Details" page | Open it as an agent that has a trip: "This page couldn't load" (`toFixed` of undefined). The API returned raw column names, the page wants camelCase | FIXED: same file, GET now returns camelCase. Typecheck clean. UI re-check was still running when this was written (API output verified). |
| 8 | Low | Lead creation | A lead with loan product `NOPE` is accepted; it only fails at approval ("Unknown loan product") | Open |
| 9 | Low | `POST /api/repayments` with an unknown repayment id | HTTP 200 with `success:true` and inner `success:false` | FIXED in code 2026-10-23: now HTTP 404. |
| 10 | Low | Agent attendance and trip week | Dates use the server's UTC day, not IST: attendance between 00:00 and 05:30 IST counts as yesterday; trip `weekStart` stored as Sunday 2026-10-18 instead of Monday 10-19 | Open |
| 11 | Low | Customer paid a replaced link after the week was already paid | Money is received but not credited; Admin gets "Online payment could not be applied" | By design; needs a refund routine |
| 12 | Info (code reading, not run) | `PATCH /api/loans` settleBalance | Marks weeks Paid without writing Collections rows, so reports undercount; foreclose and settleBalance have no CSRF or status guard | Open |
| 13 | Info | `POST /api/staff` | No password policy on create (PATCH has one) | Open |
| 14 | Info | Agent Tracking page on `localhost` | Google Maps "RefererNotAllowedMapError": the key does not allow localhost | Settings, not code |

### Code changes made (not committed)
- `app/api/agent/trips/route.ts`: POST saves `Lead ID` as null when there is no lead; GET returns camelCase trip fields.
- `supabase/migrations/20261023100000_fix_deposit_type_and_assistant_manager.sql`: new file, **NOT applied**. Adds the three deposit type names to `deposit_type` and allows `assistant_manager` in the branch role check. Additive.

## Untested items and why
- Automatic SMS and WhatsApp sending: no provider keys (by rule). OTP codes were read from the local development response only.
- Production-mode 404s for dev and AI routes: not testable on a local server.
- Deposit withdrawal above balance, deposit requests with money, interest cycle: blocked by bug 1.
- Assistant Branch Manager behaviour: role cannot be created (bug 2).
- Photo uploads to Drive and payment proof files: not used (each verification does create a Drive folder, see Cleanup).
- Real gateway (only the practice simulator), bank statement matching beyond upload, QR login, Branch Town 3D, Google road distances (no calls made).
- Collection payouts approve/reject (no cycle is complete yet: next unlock 2026-11-28).
- Overdue and late-week behaviour: all test weeks are in the future or today, so overdue colours and score penalties were not exercised.

## Cleanup
Done 2026-10-23 on the owner's approval, only rows traced to the ids in `regtest-ledger.json`. Rows deleted per table: payment_events 7, payment_lines 14, payment_groups 5, bank_transactions 2, loan_closures 3, payment_links 3, collections 47, repayments 60, loans 6, customers 5, customer_otps 8, agent_trips 3, agent_attendance 2, leads 8, settlements 2, profiles 6, notifications 70, logs 102, staff_access 3, branch_staff_roles 3, guarantor_branches 2, guarantors 2, agents 2, users 7, branches 2.

Final live counts equal the baseline: leads 2, customers 2, loans 2, repayments 20, collections 2, payment_groups 0, payment_links 0, customer_otps 0, loan_closures 0, deposits 0, users 10. No REGTEST-named row remains in users, customers, leads, guarantors, agents, branches, bank_transactions or notifications. Settlements `STLXYI3T3PQ` and `STLI81OAFYB` and 2 older payment_events (from before this test) were left alone.

Not removed (owner decides): the 5 Google Drive folders created by the test verifications (ids in the ledger); the migration file `20261023100000_fix_deposit_type_and_assistant_manager.sql` is not applied; the trips fix in `app/api/agent/trips/route.ts` is uncommitted. Logs of the demo logins (not tied to test ids) were kept.

## Related
[[Runbook Brain]], [[Bug Sweep 2026-10-21]], [[Customer OTP and Disbursement]], [[Open Security Leads]]

## Staff branch-isolation check with real sessions (2026-10-23, evening)
Temporary branch "REGTEST Branch B" and two temporary Staff accountants (one in NGF HQ, one in the empty temp branch) were created, tested read-only, then deleted (users back to 10, branches 1, no orphan staff_access/roles/profiles).
- Staff in NGF HQ: sees the 2 customers, 2 loans, 18 repayment rows, 2 settlements, 2 payouts (same as Admin).
- Staff in the other branch: sees 0 customers, 0 loans, 0 repayments, 0 settlements, 0 payouts; customer history 403; Staff DELETE on customers 403.
- Admin: unchanged, sees everything.
- Payment Matching (`/api/payments`) returned 403 for both temp staff (they had no payment-matching permission); Admin sees the list. Not re-tested with that permission ticked.
- Not tested (would change real data): Staff POST repayment / PATCH customer on another branch's ids; checked by code only.
