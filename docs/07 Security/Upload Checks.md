# Upload checks (the 4 checks)

Every file stored by the CRM goes through `lib/uploadGuard.ts` (`checkUpload`). Based on the Codikko "Upload Kit" (2026-10-31), added 2026-11-01.

| Check | How it works here |
|---|---|
| 1 Size | Decided on the real bytes, on the server. Refused before decoding if the text is clearly too big. Images up to 12 MB for lead photos (they are shrunk under 1 MB afterwards), 8 MB for Supabase and Drive files, 5 MB profile photo, 3 MB Payment Chat screenshots, PDF 8 MB. |
| 2 Type | From the file's first bytes: JPEG, PNG, GIF, WebP, PDF, HEIC/HEIF. The name and the type the browser claims are ignored (a PNG sent as "jpeg" is stored as PNG). SVG, HTML, EXE and text are refused. |
| 3 Name | Payment proofs: `f_<16 random hex>.<verified ext>` (`randomFileId`). Lead and customer documents keep fixed names per document type (`aadhaar_front.jpg`), never the user's file name. Payment Chat uses a hash name. |
| 4 Who sees it | Unchanged: nothing is public. Files open only through `/api/drive/[fileId]` with a login and `canReadFile` (`lib/fileAccess.ts`). Drive files belong to the Drive account in `GOOGLE_OAUTH_REFRESH_TOKEN`. |

Where the check is called: `lib/drive.ts` (`saveFile`, `uploadLeadPhoto`), `lib/supabase.ts` (`uploadToSupabase`, `uploadLeadPhotoSupabase`), `lib/payments.ts` and `app/api/repayments/route.ts` (proof names), `app/api/profile/route.ts`, `lib/paymentChat.ts` (`submitSlip`, `testRead`).

Rate limit: `lib/uploadRate.ts`, 40 requests with files per minute per user (leads, lead edit, repayment proof, profile photo, Payment Chat). The customer import is not limited on purpose (staff import many).

Not changed: files already stored are not renamed or re-checked.
