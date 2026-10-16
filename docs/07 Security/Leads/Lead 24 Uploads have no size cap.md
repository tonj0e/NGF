---
title: Lead 24 Uploads have no size cap
section: Security
status: open
last_verified: 2026-10-17
priority: 24
area: Files
fix_step: fix-10
fingerprint: authenticated-json-base64-upload-no-size-cap
tags: [ngf, security, lead, files]
---
# Lead 24 Uploads have no size cap
**Any user to server memory. Status: open, not yet fixed. Needs validation (nothing was run).**

## What the source shows
POST /api/leads, POST /api/repayments and POST /api/profile read the whole JSON body into memory. They pass attacker-supplied base64 strings to Drive or Supabase Storage with no length, MIME or aggregate limit. Each requires only a valid session of any role, including Guarantor. POST /api/repayments also needs an existing repaymentId and reads the full Repayments and Loans tables first. A large body is buffered and copied several times in the Node process, and large objects can be persisted to the shared Drive or Storage quota. Impact on other users depends on deployed body limits and process isolation, which source cannot show.

## Source trace
1. `app/api/leads/route.ts:76`: Any authenticated role calls POST /api/leads. getSession and csrfProtection are the only gates; there is no requireRole and no size check.
2. `lib/validation.ts:7`: await req.json() buffers and parses the whole body. The schema (lines 72-77) accepts the photo fields as z.string().optional() with no max length.
3. `app/api/leads/route.ts:123`: b64.split(',') creates extra copies of each large string, and the base64Data is passed on to the upload helper.
4. `app/api/leads/route.ts:128`: Up to six unbounded files per request are uploaded to Drive. The catch at line 134 swallows errors. Sibling sinks are app/api/repayments/route.ts:127 and app/api/profile/route.ts:77, both via saveFil…

## Why it is not confirmed
- Deployed body-size caps are not visible in source: the reverse proxy (nginx client_max_body_size) or the host (for example Vercel's 4.5 MB function limit).
- Process isolation and restart behaviour (pm2 or serverless) are unknown.
- no OS-enforced sandbox with memory limits on this host; target code was not executed

## How to check it (safe, dummy data)
In a memory-limited container with dummy Supabase and Drive mocks, run the Next server and POST /api/leads with a dummy Guarantor token and customerPhoto set to a data URL of 50 MB, then 200 MB. Record whether the request is accepted, peak RSS, and whether the mock upload receives the full payload. Repeat for /api/profile with photoFile. Stop at the first observed bound.

## Owner check
Owner to check the configured maximum request body size at the proxy or host in front of /api/*, and whether one Node process serves all users. Also check the Drive and Storage quota alerts.

## Related
- [[Open Security Leads]], [[Security Fix Plan]] (step 10), [[Security Brain]]
