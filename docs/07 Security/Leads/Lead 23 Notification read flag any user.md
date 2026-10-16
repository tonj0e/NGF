---
title: Lead 23 Notification read flag any user
section: Security
status: open
last_verified: 2026-10-17
priority: 23
area: Notifications
fix_step: fix-10
fingerprint: notifications-patch-missing-recipient-check
tags: [ngf, security, lead, notifications]
---
# Lead 23 Notification read flag any user
**Any user to others' read flag. Status: open, not yet fixed. Needs validation (nothing was run).**

## What the source shows
PATCH /api/notifications authenticates the caller with getSession, but the result is unused. It finds the notification by the body notificationId only, then sets Is Read to 'true' through updateById. It never compares User ID or Role to the session. Any authenticated user who holds another recipient's notification ID can mark that notification read. For role-addressed rows this also flips the shared read state for everyone in that role. The impact is limited to the integrity of a read flag. No data is disclosed.

## Source trace
1. `app/api/notifications/route.ts:21`: The handler calls getSession (line 22) and reads notificationId from the JSON body (line 23). The session value is never used afterwards.
2. `app/api/notifications/route.ts:25`: The notification is found by Notification ID only, with no check of User ID or Role.
3. `app/api/notifications/route.ts:27`: updateById sets Is Read to 'true' for whichever row matched, whoever its recipient is.

## Why it is not confirmed
- No OS-enforced sandbox with memory limits on this host; target code was not executed, so the result is source-only.
- Exploitation needs another recipient's Notification ID. How IDs are generated (guessable or sequential) and whether they are exposed to other users elsewhere (for example in entityId or other routes) was not traced. This decides likelihood, but impact stays l…

## How to check it (safe, dummy data)
With a local dummy Supabase and two dummy users, user A and user B, create a Notifications row addressed to A. Send PATCH /api/notifications as B with A's notificationId. Today, expect success true and Is Read set to 'true' on A's row. After adding a recipient check, expect success false and no change. Separately, inspect the notification ID generator in the code that inserts into Notifications to judge guessability.

## Owner check
Not applicable.

## Related
- [[Open Security Leads]], [[Security Fix Plan]] (step 10), [[Security Brain]]
