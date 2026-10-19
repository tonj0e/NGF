---
title: Files and Storage
section: Field and Org
status: current
last_verified: 2026-10-17
tags: [ngf, field-and-org, storage, drive, supabase]
---
# Files and Storage
**One line: where uploaded photos and proofs live (Google Drive and Supabase Storage), how they are named, and how they are served.**

## Key facts
| Store | What goes there today | Written by |
|---|---|---|
| Google Drive (root folder from `PHOTO_ROOT_FOLDER_ID`) | Lead and customer photos: customer, aadhaar front/back, house, landmark, cheque | `uploadLeadPhoto` in leads, customers and import-customer routes |
| Supabase bucket `payment-proofs` | Repayment payment proofs | `app/api/repayments/route.ts:127` |
| Supabase bucket `customer-docs` | Only Drive-to-Supabase migrations | `app/api/dev/migrate-images` |
| Supabase bucket `profiles` | Nothing in normal use | `app/api/profile/route.ts:77` (unused path) |
- Code: `lib/drive.ts` (Drive + wrappers), `lib/supabase.ts` (buckets, upload, download, URL helpers), `app/api/drive/**`, `components/ui/DriveImage.tsx`.
- Drive folders (changed 2026-10-19): `NGF-<guarantorCode>/<customerName> - <code>/`, files `<customerName> - <code> - <type>.<ext>` (types: customer, aadhaar_front, aadhaar_back, house, landmark, cheque). `<code>` is the lead ID while the lead is open and the 4-digit loan code (GBN-7425 -> 7425) once approved: `renameLeadDocs` renames the folder and files at approval (best effort; file IDs and saved links do not change). Imported customers get the loan code straight away. A new upload of the same type replaces the file in place. Saved value is `https://drive.google.com/open?id=<id>`. Code: `docLabel`, `getLeadDocFolder`, `renameLeadDocs`, `uploadLeadPhoto` in `lib/drive.ts`.
- Supabase names: customer docs `NGF-<code>/<Customer_Name>/<prefix>.<ext>`; proofs `<loanId>/<timestamp>_<fileName>`; profiles `<userId>/profile.<type>`. Stored value is `/api/drive/supabase:<bucket>/<path>` (`lib/supabase.ts:61`).
- Limits: the server checks no file size and no file type. Uploads are base64 in JSON bodies, `upsert: true`, so the same path is overwritten. Only host limits apply.

## How it works
Serving: `GET /api/drive/[fileId]` (`app/api/drive/[fileId]/route.ts`):
1. Requires any valid session (`getSession`), no role or ownership check.
2. If the id starts with `supabase:` and names a known bucket, downloads from Supabase and returns bytes with the stored MIME type.
3. Otherwise treats the id as a Drive file id and fetches via the OAuth Drive client (`lib/google.ts`).
4. Returns `Cache-Control: private, max-age=3600`. Any failure is a bare 404.

`DriveImage` extracts the identifier from a `?id=` or `/d/` Drive URL or from `/api/drive/...`, fetches it with the bearer token, and shows a blob URL. Loading failure shows "Failed - click to open in Drive".

Drive OAuth helper: Dev, "Refresh token" tab opens `/api/drive/auth` (redirect to Google), and `/api/drive/callback` returns an HTML page that posts the refresh token to the opener. Used to get a new value for `GOOGLE_OAUTH_REFRESH_TOKEN`. See [[Dev and Admin Tools]].

## Rules and gotchas
- Known issue: Supabase-stored files cannot be fetched with a slash in the path. The route is a single segment `[fileId]`, but identifiers look like `supabase:payment-proofs/<loan>/<file>`. Next will not match that URL, so it returns 404 (static route analysis; payment-proof and migrated customer-docs URLs are affected).
- Known issue: `/api/drive/auth` and `/api/drive/callback` need no login (`auth/route.ts:4`, `callback/route.ts:4`). The callback sends the refresh token to the opener with target origin `*` (`callback/route.ts:41`). Needs a valid Google code, but the token reaches whoever opened the window.
- Any signed-in user, including a Guarantor, can fetch any Drive id or bucket path they know. See [[Open Security Leads]].
- Supabase customer-docs paths (`getOrCreateFolderSupabase`) still use the customer name only, so same-name customers could overwrite each other there. Drive folders no longer have this problem. Nothing in the app currently writes customer photos to that bucket.
- `getOrCreateFolder` builds a Drive query by string concatenation of the customer name (`lib/drive.ts:16`). A quote in a name breaks the query.
- Dev migration routes copy old Drive files into Supabase; they currently fail to update the row. See [[Dev and Admin Tools]].

## Related
- [[Field and Org Brain]]
- [[ID Cards and QR]]
- [[Lead to Loan]]
- [[Repayments and Collections]]
- [[Tech Stack and Folder Map]]
