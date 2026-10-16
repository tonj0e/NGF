---
title: Lead 05 File proxy has no ownership check
section: Security
status: open
last_verified: 2026-10-17
priority: 5
area: Files
fix_step: fix-7
fingerprint: drive-proxy-any-session-reads-any-object-no-ownership-binding
tags: [ngf, security, lead, files]
---
# Lead 05 File proxy has no ownership check
**Any logged-in user to any document. Status: open, not yet fixed. Needs validation (nothing was run).**

## What the source shows
GET /api/drive/:fileId requires only a valid session (getSession, no role check). An identifier of the form supabase:<bucket>/<path> for customer-docs, payment-proofs or profiles is downloaded with the service-role client and returned, with no check that the object belongs to the caller. Any other identifier goes to getFileBase64, which reads that Drive file ID with the OAuth Drive client and supportsAllDrives. A Guarantor or Agent who knows or guesses a path or ID could fetch other customers' ID, photo or payment-proof files, or other Drive files the account can read. Paths follow NGF-<guarantorCode>/<Customer_Name>/<prefix>.<ext>. The route returns 404 on any error, so it gives no existence oracle beyond success or failure.

## Source trace
1. `app/api/drive/[fileId]/route.ts:6`: Route handler. It calls only getSession at line 8 and then reads fileId from the URL at line 9. Any role passes.
2. `lib/supabase.ts:65`: Checks the 'supabase:' prefix and that the bucket is one of the three buckets. The path is unconstrained and no ownership check is made.
3. `lib/supabase.ts:26`: Service-role storage download at line 27. The route returns the bytes (route.ts lines 14-21). Non-Supabase IDs go to getFileBase64 (route.ts line 25; lib/drive.ts line 44) and are read through the OA…

## Why it is not confirmed
- No OS-enforced sandbox with memory limits on this host; target code was not executed
- Which object paths or Drive IDs a Guarantor or Agent can learn is not traced. List endpoints may expose document URLs only for scoped records.
- The OAuth account's Drive contents and scope, and the bucket public/private flags, are deployment facts that source cannot show.

## How to check it (safe, dummy data)
Use a dummy Supabase storage fixture. Create two guarantors with one customer each and an uploaded document under customer-docs. Log in as guarantor A and request /api/drive/supabase:customer-docs/NGF-<B code>/<B customer>/<file>. A 200 with the bytes confirms the missing ownership binding. Repeat with a stubbed Drive client and an unrelated Drive ID.

## Owner check
The owner checks which API responses expose document URLs or Drive IDs to Guarantor and Agent roles, whether the customer-docs bucket is public, and how much the OAuth account can read in Drive. The fix is to resolve the identifier to its owning lead or customer, enforce role and guarantor scope before download, and allow only Drive IDs recorded in the CRM.

## Related
- [[Open Security Leads]], [[Security Fix Plan]] (step 7), [[Security Brain]]
