---
title: Lead 16 ID card print window XSS
section: Security
status: open
last_verified: 2026-10-17
priority: 16
area: Client
fix_step: fix-9
fingerprint: idcard-photo-src-unescaped-document-write
tags: [ngf, security, lead, client]
---
# Lead 16 ID card print window XSS
**Staff to admin's browser. Status: open, not yet fixed. Needs validation (nothing was run).**

## What the source shows
POST /api/profile stores body.photo verbatim as Profiles.Photo. Any Admin or Staff caller can target another user by passing userId (lines 60-61). GET /api/profile returns the stored value to the owner, and MyIdCardPage puts it in state and passes it to buildIdCardHtml as photoDataUrl. buildIdCardHtml interpolates it unescaped into `<img src="...">`. The page then calls document.write on that HTML in a window.open('') popup that shares the app origin. A Staff user could store a value such as `x" onerror="...` on an Admin's profile, and the script would run in the Admin's session when the Admin clicks Print ID Card. The popup shares the app origin, where the bearer token is kept in localStorage (per the architecture notes). A Guarantor or Agent cannot write another user's profile, because requireRole blocks them. Self-stored payloads are self-XSS only.

## Source trace
1. `app/api/profile/route.ts:75`: photoUrl = body.photo is stored as Profiles.Photo with no validation. body.userId lets Admin or Staff target other users (lines 60-61, requireRole(['Admin','Staff'])). The photoFile branch at lines 7…
2. `components/pages/MyIdCardPage.tsx:47`: setPhoto(j.data.photo) loads the stored value from GET /api/profile (the caller's own profile). printCard passes it as photoDataUrl at line 78.
3. `lib/idCard.ts:110`: `<img src="${user.photoDataUrl}" class="photo-img" />` is built with no escaping or scheme check.
4. `components/pages/MyIdCardPage.tsx:83`: w.document.write(buildIdCardHtml(...)) writes the HTML into a window.open('', '_blank') popup that inherits the app origin.

## Why it is not confirmed
- No browser execution: no OS-enforced sandbox with memory limits on this host; target code was not executed.
- Whether Staff is a lower-trust principal than Admin is a policy decision. The route only enforces requireRole(['Admin','Staff']), so Staff can write any user's profile.
- Whether a deployed CSP or header blocks inline event handlers in the popup. next.config.ts sets none in source, but the host or proxy was not observed.

## How to check it (safe, dummy data)
Use dummy accounts in a disposable local environment. As dummy Staff, POST /api/profile with userId set to the dummy Admin's id and photo set to `x" onerror="alert(document.domain)`. Log in as the dummy Admin, open My ID Card and click Print ID Card. Expected: the onerror handler fires in the popup and document.domain is the app origin. Then check whether the popup can read the ngf_token entry in localStorage.

## Owner check
The owner confirms that Staff is meant to be lower-trust than Admin, and that no CSP or proxy header blocks inline handlers on the deployed host. The fix is to accept only data:image/(png|jpeg|webp);base64 or /api/drive/ URLs on the server and in the client, and to attribute-escape (including quotes) in buildIdCardHtml.

## Related
- [[Open Security Leads]], [[Security Fix Plan]] (step 9), [[Security Brain]]
