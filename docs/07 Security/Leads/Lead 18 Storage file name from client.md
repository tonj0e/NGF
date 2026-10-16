---
title: Lead 18 Storage file name from client
section: Security
status: open
last_verified: 2026-10-17
priority: 18
area: Files
fix_step: fix-10
fingerprint: storage-object-key-from-unsanitized-client-filename
tags: [ngf, security, lead, files]
---
# Lead 18 Storage file name from client
**Any user to other storage objects. Status: open, not yet fixed. Needs validation (nothing was run).**

## What the source shows
POST /api/repayments (session required, any role) uploads paymentProof to the payment-proofs bucket under `${Loan ID}/${ts}_${paymentProof.fileName}`. POST /api/profile uploads to the profiles bucket under `${userId}/profile.${body.photoFileType}`. fileName and photoFileType are raw client strings, and photoFileType is also used as the MIME type. uploadToSupabase (service-role client) calls upload with upsert:true and the client contentType. It does no segment, extension, size or MIME validation. If Storage accepts `..` or extra `/` segments in the key, a low-privilege caller could overwrite other loans' proof objects or other users' profile photos in the same bucket. Without that, the confirmed issues are only the missing size and type validation and the arbitrary stored contentType. The customer-docs variant in the same file sanitizes its path components, so the missing validation her…

## Source trace
1. `app/api/repayments/route.ts:129`: paymentProof.fileName from the JSON body is concatenated into the key after `${r['Loan ID']}/${ts}_`. The route only calls getSession, with no role check and no validation of fileName, mimeType or si…
2. `lib/drive.ts:92`: Passes bucket, path, base64 data and mimeType unchanged to uploadToSupabase.
3. `lib/supabase.ts:44`: getSupabase().storage.from(bucket).upload(path, buffer, { contentType: mimeType, upsert: true }) with the service-role client, so RLS does not apply and the raw key is used.

## Why it is not confirmed
- Whether Supabase Storage rejects or normalizes `..` and extra `/` segments in object keys is provider behavior that source cannot show. No OS-enforced sandbox with memory limits on this host; target code was not executed.
- The forced prefixes `${Loan ID}/${ts}_` and `${userId}/profile.` limit any overwrite to keys reachable through traversal, and the timestamp makes exact-name collisions hard. The photoFileType path (`../../OTHER/profile.jpg` style) is more direct. Neither was…
- Bucket public/private flag, allowed MIME types and size limit are Supabase dashboard settings and are not in the repo.

## How to check it (safe, dummy data)
Against a local Supabase Storage test project with dummy buckets and objects, call the upload with fileName `../OTHERLOAN/x.jpg` and photoFileType `../OTHERUSER/profile.jpg` as a dummy low-privilege user. Then list the bucket to see whether the key is rejected, normalized or written outside the intended prefix, and whether an existing dummy object is overwritten.

## Owner check
Owner checks the payment-proofs and profiles bucket settings in the Supabase dashboard (public/private, allowed MIME types, file size limit) and the Storage version's key validation. Fix: use only a server-generated name such as `${ts}_${randomUUID()}.${ext}` with ext from a MIME allowlist, reject path separators, use upsert:false, and enforce a size cap.

## Related
- [[Open Security Leads]], [[Security Fix Plan]] (step 10), [[Security Brain]]
