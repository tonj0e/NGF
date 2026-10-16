---
title: Lead 13 Login rate limit can be spoofed
section: Security
status: open
last_verified: 2026-10-17
priority: 13
area: Auth
fix_step: fix-10
fingerprint: rate-limit-key-trusts-client-x-forwarded-for
tags: [ngf, security, lead, auth]
---
# Lead 13 Login rate limit can be spoofed
**Unauthenticated to unlimited guesses. Status: open, not yet fixed. Needs validation (nothing was run).**

## What the source shows
authRateLimit buckets by the first X-Forwarded-For value, falling back to X-Real-IP, then a shared 'unknown' bucket. If the reverse proxy appends to the header (nginx $proxy_add_x_forwarded_for) rather than overwriting it, a client can send a different value on each request and never exceed the 10/min limit. The login handler has no per-account failure counter or automatic lockout. Failed passwords only write an audit entry, and 'Blocked Until' is only read, never set on failure. So password guessing against known usernames, names or emails is throttled only by this IP key. If no proxy sets the header, all clients share one bucket and can lock each other out of login. Whether production overwrites the header is not visible in the repository.

## Source trace
1. `app/api/auth/login/route.ts:14`: authRateLimit(req) is the only brute-force control before credential checking; an unauthenticated caller reaches it.
2. `lib/rate-limiter.ts:11`: The key is the leftmost x-forwarded-for entry, then x-real-ip, else 'unknown' (function spans lines 10-15). The rateLimit store lookup at lines 26-36 uses this key.
3. `app/api/auth/login/route.ts:66`: Password guesses against the found user reach verifyPassword. Rotating the key gives a fresh 10/min bucket each time, so attempts are unbounded.

## Why it is not confirmed
- Whether the production reverse proxy overwrites or appends x-forwarded-for is not source-visible (it also depends on the hosting platform).
- No OS-enforced sandbox with memory limits on this host; target code was not executed.

## How to check it (safe, dummy data)
In a sandboxed harness with dummy NextRequest objects, call authRateLimit 11 times with a distinct x-forwarded-for value each time and assert none returns 429. Then call it 11 times with the same value and assert the 11th returns 429.

## Owner check
The owner sends two requests through the production proxy with a forged X-Forwarded-For header and inspects what the app receives, or reviews the proxy config, to confirm the header is overwritten with $remote_addr (or that the platform strips client values). Add a per-account failure counter or lockout regardless.

## Related
- [[Open Security Leads]], [[Security Fix Plan]] (step 10), [[Security Brain]]
