---
title: Auth and Sessions
section: Architecture
status: current
last_verified: 2026-10-17
tags: [ngf, architecture, auth, jwt, security]
---
# Auth and Sessions
**One line: password login, optional ID-card QR second step, a 24 h Bearer JWT that dies on password change, and an email-code password reset.**

## Key facts
| Item | Value | Where |
|---|---|---|
| Token type | JWT HS256 via `jose`, secret from `JWT_SECRET` (min 32 chars) | `lib/auth.ts:6-12,39-45` |
| Session lifetime | 86400 s (24 h), `clockTolerance` 60 s | `lib/auth.ts:14,50` |
| Claims | `userId, username, role, name, email, guarantorCode, pv, iat, exp` | `app/api/auth/login/route.ts:100-108` |
| Password hashing | bcrypt, 12 rounds | `lib/auth.ts:15` |
| Pre-auth token (after password, before QR) | 10 min | `lib/auth.ts:65-68` |
| Device trust token | 365 days, claim `t=qrtrust` | `lib/auth.ts:76-79` |
| Reset token | 10 min, claim `t=pwreset` + OTP id | `lib/auth.ts:87-90` |
| Client storage | `localStorage` `ngf_token`, `ngf_qrtrust` | `app/page.tsx:141`, `Login.tsx:40` |

`APP_CONFIG.SESSION_TTL_SECONDS` (21600) in `lib/config.ts:7` is not used anywhere. The real lifetime is the `TTL` in `lib/auth.ts`.

## How it works
**Login** (`POST /api/auth/login`): rate limit 10/min per IP, zod body check, read `Users` fresh. Match by Username, then Name, then Email. Reject if Status is not `Active` or `Blocked Until` is in the future. Verify bcrypt. All failures and successes go to the audit log.

**QR second step**: only roles `Guarantor`, `NGF AGENT`, `Staff` (`login/route.ts:11,81`). Admin is never asked. It is on only if Settings key `qrlogin:<Role>` is `1` (toggled in Dev page). If on and no valid trust token for this user, the API returns `{ needQr, preAuth }`. The browser scans the ID-card QR (jsQR) and posts `POST /api/auth/verify-qr` with `preAuth` and the scanned `uid`. It must equal the pre-auth user. With `remember`, the reply includes a trust token so this device skips QR next time. Logout clears it (`app/page.tsx:186`).

**Every API call** (`getSession`, `lib/api.ts:6-37`): verify JWT, then load the user row from the DB and check:
- user still exists;
- `pv` claim equals the keyed fingerprint of the current `password_hash` (so a password change revokes all older tokens);
- legacy tokens without `pv` are rejected if `updated_at` is after `iat`;
- `blocked_until` is not in the future (error text carries the reason).
So blocking and revocation take effect on the next request, not at expiry.

**Password reset by email code** (UI: `app/auth/forgot-password/page.tsx`):
1. `POST /api/auth/forgot`: always returns the same generic reply. Per-email cap 5/h plus per-IP 10/min. If exactly one Active user has that email, `issueOtp` makes a 6-digit code (10 min, 5 attempts, 5 per hour per user, 50 s cooldown), stored only as a keyed HMAC in `password_reset_otps` (`lib/otp.ts`). Mail is sent after the response through Resend (`lib/email.ts`).
2. `POST /api/auth/verify-otp`: email + code gives a 10 min reset token. All failures return the same message.
3. `POST /api/auth/reset`: password policy (min 10 chars, 3 of 4 classes, not common, not containing username/email name; `lib/passwordPolicy.ts`), must differ from current, OTP consumed once, new hash saved. This revokes all sessions via `pv`. Applies to every role, Admin included.

## Rules and gotchas
- **No middleware**: protection is per route. A route that forgets `getSession`/`requireRole` is open. See [[Request Flow]].
- Known issue: CSRF never rejects a wrong token. `csrfProtection` calls `verifyCsrfToken` (async) without `await`, so `!Promise` is false (`lib/csrf.ts:61`). Only a missing token/cookie gives 403. Only `POST/PATCH` in `leads`, `leads/[leadId]`, `agent/attendance`, `agent/trips` call it. The login reply sets an httpOnly `csrf_token` cookie (SameSite=Strict) that satisfies the presence check. `LeadsPage.tsx:153` reads `csrfJson.data?.csrfToken` but `/api/csrf` returns `csrfToken` at top level, so the header is empty and the cookie is used.
- Known issue: `CSRF_SECRET` falls back to a hard-coded default string if unset (`lib/csrf.ts:4-6`). Set it in production.
- Known issue: rate limiter is an in-memory `Map` per server instance; it resets on restart and is not shared across serverless instances. It keys on `x-forwarded-for`, which a client can spoof if the proxy does not overwrite it (`lib/rate-limiter.ts:10-15`). Only auth routes and `dev/user-password-reset` use it. `apiRateLimit` and `strictRateLimit` are defined but unused.
- Known issue: login prints the submitted username and the full list of usernames to the server console on an unknown user (`login/route.ts:33`). Remove it.
- Known issue: QR trust token is not tied to password version; it only skips the QR step (password is still required).
- `GET /api/auth/email-config` returns 404 in production (`lib/devOnly.ts`).
- Role is inside the JWT but the DB role is not re-read in `getSession`. A role change takes effect only after the user's token is replaced (password change or expiry).
- `generateSalt` uses `Math.random` (`lib/auth.ts:60`); salt is unused by bcrypt.

## Related
- [[Architecture Brain]], [[Roles and Permissions]], [[Security Brain]], [[Open Security Leads]], [[Integrations]], [[Config and Env Vars]], [[Branches and Staff]]
