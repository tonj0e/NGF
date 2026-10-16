---
title: Lead 07 Permanent block never blocks
section: Security
status: open
last_verified: 2026-10-17
priority: 7
area: Auth
fix_step: fix-8
fingerprint: permanent-block-stores-null-blocked-until-not-enforced
tags: [ngf, security, lead, auth]
---
# Lead 07 Permanent block never blocks
**Admin block not enforced. Status: open, not yet fixed. Needs validation (nothing was run).**

## What the source shows
POST /api/staff/block (Admin only) with duration 'permanent' writes blocked_until=NULL, blocked_at=now, blocked_by and block_reason. Login and getSession enforce a block only when blocked_until is truthy and in the future, so NULL, the same value as an unblocked user, is never rejected. A user an admin believes is permanently blocked can still log in and keep using existing tokens. The API response says 'User blocked permanently'. Separately, durations such as '7d' and '30d' are parsed by parseInt(duration.replace('h','')) as 7 and 30 hours. A custom endDateTime is stored without validation. The GET handler and the org-hierarchy route also derive isBlocked from blocked_until alone.

## Source trace
1. `app/api/staff/block/route.ts:50`: Admin-only handler. duration === 'permanent' sets blockedUntil = null (lines 50-51). The check at line 61 explicitly allows null for 'permanent'.
2. `app/api/staff/block/route.ts:68`: Updates users with blocked_at=now, blocked_until=null, blocked_by and block_reason. The status column is not changed.
3. `app/api/auth/login/route.ts:55`: Rejects only if Status !== 'Active' (line 43) or ('Blocked Until' truthy and > now). A NULL value passes, so password verification and token issue proceed.
4. `lib/api.ts:31`: Re-reads blocked_until per request but rejects only if it is truthy and > now. Existing tokens of a permanently blocked user stay valid, and no other field is checked.

## Why it is not confirmed
- No OS-enforced sandbox with memory limits on this host; target code was not executed, so the runtime result (a permanently blocked user still authenticates) is unobserved.
- The production DB state is not source-visible. Source shows only ADD COLUMN IF NOT EXISTS in the migrations, so any trigger or default rewriting NULL blocked_until in the live database cannot be ruled out.

## How to check it (safe, dummy data)
With a dummy Supabase project or a mocked getSupabase, call the POST handler as a dummy Admin with duration 'permanent' for a dummy non-admin user. Then run the login handler for that user and call getSession with a token for that user. Expect both to succeed, which would show the block is not enforced. Also post '7d' and check that blocked_until is about 7 hours ahead. Fix: store a permanent block as 'infinity' or a far-future timestamp, or enforce blocked_at plus a permanent flag in login and getSession; parse d/h units properly; validate custom dates. Add a regression test that a permanent…

## Owner check
The owner checks, on a dummy account in a non-production project, that the users table has no trigger or default that rewrites NULL blocked_until, then performs the permanent block and confirms the dummy user can still log in.

## Related
- [[Open Security Leads]], [[Security Fix Plan]] (step 8), [[Security Brain]]
