---
title: Lead 17 Drive folder query injection
section: Security
status: open
last_verified: 2026-10-17
priority: 17
area: Files
fix_step: fix-10
fingerprint: drive-folder-query-unescaped-customer-name
tags: [ngf, security, lead, files]
---
# Lead 17 Drive folder query injection
**Lead submitter to other customer's folder. Status: open, not yet fixed. Needs validation (nothing was run).**

## What the source shows
getLeadDocFolder passes the client-supplied customerName to getOrCreateFolder, which builds the Drive files.list q string with name='${name}' and no escaping of quotes or backslashes. A name such as `x' or mimeType='application/vnd.google-apps.folder` changes the boolean structure. Because 'and' binds tighter than 'or', the query becomes (parent and name=x) or (mimeType=folder and trashed=false). It can then match any folder visible to the OAuth account, and the first match is returned as the upload parent. Lead photos are uploaded into that folder, so KYC documents can land in another customer's folder. The route swallows errors, so a malformed name only fails silently.

## Source trace
1. `app/api/leads/route.ts:121`: body.customerName is passed to getLeadDocFolder when any photo field is present. The entrypoint is an authenticated lead submission. customerName is validated only as a non-empty string (lib/validati…
2. `lib/drive.ts:72`: customerName is forwarded unchanged as the folder name to getOrCreateFolder under the NGF-<code> parent folder.
3. `lib/drive.ts:16`: drive.files.list q is built as `'${parentId}' in parents and name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`. The first returned file id (line 21) becomes the uplo…

## Why it is not confirmed
- Google Drive q parser precedence for 'or' versus 'and' and its handling of the injected clause is provider-side behavior and was not observed.
- Impact depends on the production OAuth Drive account holding other folders, and on PHOTO_ROOT_FOLDER_ID being a Drive folder rather than Supabase-only mode.
- No OS-enforced sandbox with memory limits on this host; target code was not executed.

## How to check it (safe, dummy data)
With a mocked googleapis Drive client (no network, dummy IDs), call getOrCreateFolder('PARENT', "x' or mimeType='application/vnd.google-apps.folder") and assert on the captured q string. Expected: `'PARENT' in parents and name='x' or mimeType='application/vnd.google-apps.folder' and mimeType='application/vnd.google-apps.folder' and trashed=false`. Separately, confirm in Google's documented Drive search grammar that 'and' has higher precedence than 'or'.

## Owner check
Owner, on a test Drive account with two dummy folders, submits a lead with the crafted customerName and a photo. The owner then checks whether the photo landed in a folder other than NGF-<code>/<name>. Owner also confirms that PHOTO_ROOT_FOLDER_ID points at a Drive folder in production.

## Related
- [[Open Security Leads]], [[Security Fix Plan]] (step 10), [[Security Brain]]
