---
title: Notifications
section: Field and Org
status: current
last_verified: 2026-10-17
tags: [ngf, field-and-org, notifications]
---
# Notifications
**One line: in-app notifications are rows in `notifications`, created by lead events only; the header bell is a hard-coded mock.**

## Key facts
- Table `notifications`: id, user_id (nullable), role, title, message, entity_type, entity_id, is_read, created_at.
- `user_id` was made nullable by `migrations/2026-09-05-complete-fixes.sql:54` so role-wide rows work. `supabase_schema.sql` still shows NOT NULL.
- Helpers in `lib/notifications.ts`: `notifyUser(userId, role, ...)` and `notifyRole(role, ...)` (user_id null).
- Page: `NotificationsPage.tsx`, menu entry "Notifications" for every role; Staff land on it first.
- API: `app/api/notifications/route.ts`, GET (list, paged) and PATCH (mark read).

## How it works
Who creates them (all in lead code):
| Event | Call | Recipient |
|---|---|---|
| Lead submitted | `app/api/leads/route.ts:188` | role Admin |
| Agent assigned | `app/api/leads/[leadId]/route.ts:80` | that agent's user |
| Verification submitted | `leads/[leadId]/route.ts:158` | role Admin |
| Lead approved / rejected | `leads/[leadId]/route.ts:190,199` | the guarantor's user |
Nothing else (repayments, settlements, payouts) creates notifications. See [[Lead to Loan]].

Who sees what: `GET` reads the whole table and keeps rows where `user_id` equals the caller OR `role` equals the caller's role (`route.ts:11`). Sorted newest first, default page size 20 (`paginate` in `lib/supabase-db.ts:439`).

Read state: the page shows a "Mark read" button, which PATCHes `{notificationId}` and sets `is_read` true. Role-wide rows are one shared row, so one Admin marking it read marks it for every Admin.

Header bell: `components/AppShell.tsx:343-393` (and the twin block near line 450) is static markup: red badge "3" and three fake items. It reads no data. "View all" opens the real page.

## Rules and gotchas
- Known issue: read items never look read. `is_read` is boolean, the page tests `n.isRead === 'true'` (`NotificationsPage.tsx:32,39`), so everything stays "unread" with a Mark read button.
- Known issue: header bell badge and list are fake (see above). No unread count exists anywhere.
- `PATCH` does not check ownership. Any signed-in user can mark any notification id read (`route.ts:21-29`).
- Role strings must match the `user_role` enum in the DB; `notifyUser` passes the agent row's role or `'NGF AGENT'`. See [[Enums and Status Values]].
- Role-wide rows reach `Staff` only if the role is literally `Staff`; branch staff do not get Admin notifications.
- Deleting a user deletes their own notifications (`app/api/staff/route.ts:373`).
- Notification failures inside lead routes are not caught separately; a failed insert would fail the request after the main write.

## Related
- [[Field and Org Brain]]
- [[Lead to Loan]]
- [[Roles and Permissions]]
- [[Tables]]
