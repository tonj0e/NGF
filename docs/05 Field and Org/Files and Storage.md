---
title: Files and Storage
section: Field and Org
status: current
last_verified: 2026-11-19
tags: [ngf, field-and-org, storage, drive, supabase]
---
# Files and Storage
**One line: where uploaded photos and proofs live (Google Drive and Supabase Storage), how they are named, and how they are served.**

## Key facts
| Store | What goes there today | Written by |
|---|---|---|
| Google Drive (root folder from `PHOTO_ROOT_FOLDER_ID`, now the "Next Gen Finance" folder in the ngfcfncorp account) | Lead and customer photos: customer, aadhaar front/back, house, landmark, cheque | `uploadLeadPhoto` in leads, customers and import-customer routes |
| Supabase bucket `payment-proofs` | Repayment payment proofs | `app/api/repayments/route.ts:127` |
| Supabase bucket `customer-docs` | Only Drive-to-Supabase migrations | `app/api/dev/migrate-images` |
| Supabase bucket `profiles` | Nothing in normal use | `app/api/profile/route.ts:77` (unused path) |
- Code: `lib/drive.ts` (Drive + wrappers), `lib/supabase.ts` (buckets, upload, download, URL helpers), `app/api/drive/**`, `components/ui/DriveImage.tsx`.
- Drive folders (changed 2026-10-19): `NGF-<guarantorCode>/<customerName> - <code>/`, files `<customerName> - <code> - <type>.<ext>` (types: customer, aadhaar_front, aadhaar_back, house, landmark, cheque). `<code>` is the lead ID while the lead is open and the 4-digit loan code (GBN-7425 -> 7425) once approved: `renameLeadDocs` renames the folder and files at approval (best effort; file IDs and saved links do not change). Imported customers get the loan code straight away. A new upload of the same type replaces the file in place. Saved value is `https://drive.google.com/open?id=<id>`. Code: `docLabel`, `getLeadDocFolder`, `renameLeadDocs`, `uploadLeadPhoto` in `lib/drive.ts`.
- Supabase names: customer docs `NGF-<code>/<Customer_Name>/<prefix>.<ext>`; proofs `<loanId>/<timestamp>_<fileName>`; profiles `<userId>/profile.<type>`. Stored value is `/api/drive/supabase:<bucket>/<path>` (`lib/supabase.ts:61`).
- Limits: the server checks no file size and no file type. Uploads are base64 in JSON bodies, `upsert: true`, so the same path is overwritten. Only host limits apply.

## How it works
Serving: `GET /api/drive/[fileId]` (`app/api/drive/[fileId]/route.ts`):
1. Requires a valid session (`getSession`) and `canReadFile` (`lib/fileAccess.ts`) on **every** request; a refusal is a 404. Nothing below is reached before both pass.
2. `?w=<px>` asks for a small version (snapped to 160/320/480/640/1024, longest side). For a Drive file the route reads the file's `thumbnailLink`, swaps its `=s220` for `=s<w>` and fetches it with the same OAuth client's access token (`getFileThumbnail` in `lib/drive.ts`; only `https` Google hosts, the token never reaches the browser). No thumbnail = the original (that file is then not asked again for 30 min). Supabase files always return the original.
3. Without `w`: Supabase ids (`supabase:<bucket>/...`) download from Supabase, anything else is a Drive id fetched via the OAuth Drive client (`getFileBuffer`: type lookup and download in parallel).
4. Server cache (`lib/fileCache.ts`, added 2026-11-19): per-process LRU of served files, keyed by file id (thumbnails `<id>@<w>`), 60 MB total, files over 8 MB not kept, entries expire after 30 min; requests arriving together share one download. Only consulted after step 1 passed.
5. Returns `Cache-Control: private, max-age=3600`. Any failure is a bare 404.

Browser side: one shared loader `lib/driveImage.ts` (`useDriveImage(url, token, { w, lazy, enabled })`). It turns a stored link (`?id=`, `/d/`, or `/api/drive/...`) into `/api/drive/<id>`, keeps object URLs in a module cache (300 items / 120 MB, emptied when the signed-in token changes), loads a picture only when it scrolls within 300 px of the screen, and runs at most 4 downloads at once. Used by `DriveImage` (detail photos, original), the avatars in Customers, My Customers and Loans (`w=160`), Payment Chat thumbnails (`w=640`, original when tapped open) and Payment Matching "View screenshot" (original, on open). Loading failure in `DriveImage` shows "Failed - click to open in Drive". Cheques Pledged only links to `/api/drive/...` (opens in a new tab without the bearer token).

Drive OAuth helper: Dev, "Refresh token" tab opens `/api/drive/auth` (redirect to Google), and `/api/drive/callback` returns an HTML page that posts the refresh token to the opener. Used to get a new value for `GOOGLE_OAUTH_REFRESH_TOKEN`. See [[Dev and Admin Tools]].

## Rules and gotchas
- Known issue: Supabase-stored files cannot be fetched with a slash in the path. The route is a single segment `[fileId]`, but identifiers look like `supabase:payment-proofs/<loan>/<file>`. Next will not match that URL, so it returns 404 (static route analysis; payment-proof and migrated customer-docs URLs are affected).
- Known issue: `/api/drive/auth` and `/api/drive/callback` need no login (`auth/route.ts:4`, `callback/route.ts:4`). The callback sends the refresh token to the opener with target origin `*` (`callback/route.ts:41`). Needs a valid Google code, but the token reaches whoever opened the window.
- Who may read which file is decided by `canReadFile` (Admin/Staff all; Guarantor/Agent only files named in their own records; profiles bucket all). See [[Open Security Leads]].
- Locally the Google refresh token in `.env.local` is expired, so Drive pictures 404 on localhost; the cache and thumbnails can only be seen working on the live site.
- Supabase customer-docs paths (`getOrCreateFolderSupabase`) still use the customer name only, so same-name customers could overwrite each other there. Drive folders no longer have this problem. Nothing in the app currently writes customer photos to that bucket.
- `getOrCreateFolder` builds a Drive query by string concatenation of the customer name (`lib/drive.ts:16`). A quote in a name breaks the query.
- Dev migration routes copy old Drive files into Supabase; they currently fail to update the row. See [[Dev and Admin Tools]].

## Related
- [[Field and Org Brain]]
- [[ID Cards and QR]]
- [[Lead to Loan]]
- [[Repayments and Collections]]
- [[Tech Stack and Folder Map]]
