---
title: Lead 04 QR second step uses a public ID
section: Security
status: open
last_verified: 2026-10-17
priority: 4
area: Auth
fix_step: fix-8
fingerprint: qr-stepup-factor-is-public-uid-in-preauth-token
tags: [ngf, security, lead, auth]
---
# Lead 04 QR second step uses a public ID
**Password-only attacker to second factor. Status: open, not yet fixed. Needs validation (nothing was run).**

## What the source shows
When Settings qrlogin:<role> is on for a non-Admin role, login returns a preAuth JWT after the password check. verify-qr issues a full session if the submitted uid equals the uid claim of that preAuth token. The JWT payload is only signed, not encrypted, so the client can read it. The ID-card QR holds the same plain uid (plus username, role and card number), so the second factor can be derived from the first-factor response and adds no assurance. With remember=true, verify-qr also returns a 365-day trust token that skips the QR step on later logins.

## Source trace
1. `app/api/auth/login/route.ts:95`: After a valid password check and when qrlogin:<role> equals '1', createPreAuthToken(user['User ID']) is created and returned in the needQr response. The signed JWT payload carries uid in plain base64…
2. `lib/auth.ts:65`: Signs the JWT { t:'preauth', uid } with HS256 and a 10-minute expiry. The token is integrity-protected but not confidential.
3. `lib/idCard.ts:28`: The ID-card QR encodes t, uid, un, role and card in plain JSON, with no server-held secret.
4. `app/api/auth/verify-qr/route.ts:31`: The only factor check is uid !== userId, where userId is the preAuth claim. If it passes, createToken issues a full session (line 61) and, when remember is set, a 365-day trust token (line 72).

## Why it is not confirmed
- Target code was not executed (no OS-enforced sandbox with memory limits on this host; target code was not executed), so the bypass was not observed at runtime.
- Whether qrlogin:<role> is enabled in the deployed Settings table is not source-visible. Admin is exempt in code and the feature is off unless the value is '1'.

## How to check it (safe, dummy data)
With dummy users and a dummy JWT_SECRET of 32 or more characters, call the login handler with a valid dummy password for a non-Admin user whose qrlogin:<role> setting is '1'. Base64url-decode the preAuth payload, POST {preAuth, uid: payload.uid} to verify-qr, and confirm a session token is returned without any QR scan.

## Owner check
The owner checks whether Settings rows qrlogin:Guarantor, qrlogin:NGF AGENT or qrlogin:Staff equal '1' in production. If none do, the step-up is inactive and the exposure does not apply. If any do, the step-up gives no protection against a password-only attacker.

## Related
- [[Open Security Leads]], [[Security Fix Plan]] (step 8), [[Security Brain]]
