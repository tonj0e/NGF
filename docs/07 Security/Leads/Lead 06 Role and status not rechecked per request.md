---
title: Lead 06 Role and status not rechecked per request
section: Security
status: open
last_verified: 2026-10-17
priority: 6
area: Auth
fix_step: fix-8
fingerprint: session-role-and-status-not-rechecked-per-request
tags: [ngf, security, lead, auth]
---
# Lead 06 Role and status not rechecked per request
**Demoted user keeps old role for 24h. Status: open, not yet fixed. Needs validation (nothing was run).**

## What the source shows
getSession verifies the JWT and re-reads only blocked_until, block_reason, password_hash and updated_at from users, then returns the role, name and guarantorCode from the token claims. It never checks users.status or users.role. The Admin-only PATCH /api/staff role change (non-guarantor path) updates Role, Username, Name, Email and Updated At but leaves the password hash unchanged unless a password is supplied. For tokens carrying a pv claim, the updated_at check is skipped. A demoted Admin or Staff user therefore keeps passing requireRole for the old role until the 24h token expires. Status is enforced only at login. Whether a deactivation path exists that leaves the hash and blocked_until unchanged (the guarantor edit RPC) is not visible in the repo.

## Source trace
1. `lib/api.ts:10`: Bearer token is verified with verifyToken; the claims become the session.
2. `lib/api.ts:16`: DB re-read selects only blocked_until, block_reason, password_hash, updated_at; role and status are not selected.
3. `lib/api.ts:36`: Returns the token's session claims (role etc.) unchanged.
4. `app/api/staff/route.ts:230`: Role is updated in the DB via updateById; Password Hash is only changed if body.password is supplied, so pv still matches for the old token.
5. `lib/api.ts:41`: Role check runs against the stale token role.

## Why it is not confirmed
- no OS-enforced sandbox with memory limits on this host; target code was not executed
- The update_guarantor_atomic RPC definition is not in the repo, so whether it writes users.status without changing password_hash or blocked_until is not visible.
- Whether the deployment accepts a 24h demotion/deactivation window is a policy decision; the role-demotion path is source-visible, but the deactivation path is unobserved.

## How to check it (safe, dummy data)
With dummy data, issue a token for a dummy Admin, change that user's Role to Guarantor via the PATCH /api/staff handler without supplying a password, then call an Admin-only handler with the old token and confirm it is still accepted (200 instead of 403). Repeat with users.status set to Inactive directly in a dummy database.

## Owner check
Owner checks the update_guarantor_atomic function body in the Supabase project to see whether it sets users.status, and whether any other flow deactivates a user without changing password_hash or blocked_until.

## Related
- [[Open Security Leads]], [[Security Fix Plan]] (step 8), [[Security Brain]]
