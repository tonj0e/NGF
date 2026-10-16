---
title: Lead 12 Notifications leak to same-role users
section: Security
status: open
last_verified: 2026-10-17
priority: 12
area: Notifications
fix_step: fix-6
fingerprint: notifications-get-role-match-exposes-per-user-notifications
tags: [ngf, security, lead, notifications]
---
# Lead 12 Notifications leak to same-role users
**Guarantor to peers' lead decisions. Status: open, not yet fixed. Needs validation (nothing was run).**

## What the source shows
GET /api/notifications returns rows where User ID equals the caller OR Role equals the caller's role. notifyUser writes the target user's role onto user-targeted notifications, so those rows also match every other user of that role. Any Guarantor can read other guarantors' 'Lead Approved' and 'Lead Rejected' notifications, which contain the customer name and the loan decision. Any NGF AGENT can read other agents' 'Lead Assigned' notifications naming the customer under verification. No server-side control on the path (session check only, service-role reads, JS-side filter) restricts the Role branch to broadcast rows.

## Source trace
1. `app/api/notifications/route.ts:11`: After getSession (line 6) and a whole-table readTable (line 10), the filter `n['User ID'] === session.userId || n['Role'] === session.role` is applied with no check that the row is a broadcast row.
2. `lib/notifications.ts:4`: A user-targeted row is created with its User ID (line 6) and the target's Role (line 7), so the Role branch also matches it for peers.
3. `app/api/leads/[leadId]/route.ts:190`: A Guarantor-targeted notification 'Lead Approved' is created with message '<Customer Name> has been approved for a loan.' (rejection analogue at line 199; agent assignment at line 80).
4. `app/api/notifications/route.ts:13`: The response mapping (lines 13-17) returns userId, title, message and entityId of the matched rows to the caller.

## Why it is not confirmed
- No OS-enforced sandbox with memory limits on this host; target code was not executed, so the live row shape in the deployed Notifications table was not observed.
- The deployed notifications table definition (whether user_id is nullable and whether notifyUser rows persist both user_id and role) must be observed by the owner.

## How to check it (safe, dummy data)
With a dummy-data harness that stubs readTable('Notifications') with two rows (one notifyUser-shaped with User ID=G1 and Role='Guarantor', one broadcast row with null User ID), call the GET handler with a session for dummy guarantor G2 (Role='Guarantor'). Expect the G1 row to be returned. Then change the filter to `n['User ID'] ? n['User ID']===session.userId : n['Role']===session.role` and expect the G1 row to be excluded.

## Owner check
Owner check: in the live Supabase notifications table, confirm that rows created by notifyUser carry a non-null user_id plus a role value, and whether user_id is nullable. Fix by applying the Role match only when User ID is null or empty.

## Related
- [[Open Security Leads]], [[Security Fix Plan]] (step 6), [[Security Brain]]
