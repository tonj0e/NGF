---
title: Verification and Documents
section: 03 Loan Lifecycle
status: current
last_verified: 2026-10-17
tags: [ngf, loan-lifecycle, verification, storage, reviews]
---
# Verification and Documents
**What the field agent submits, where photos are stored (Drive vs Supabase), and how customer reviews work.**

## Key facts
- Agent page: `components/pages/VerificationsPage.tsx`. It lists `GET /api/leads?status=Agent+Assigned` (agents only see their own assigned leads).
- Submit: `PATCH /api/leads/:id` action `submitVerification`, NGF AGENT only (`app/api/leads/[leadId]/route.ts:84`).
- Required in the form: Risk Level (Low/Medium/High) and Recommendation (Verified / Suspicious / Rejected Recommendation). Photos are optional.
- Six photo slots: customer, Aadhaar front, Aadhaar back, house, landmark, cheque. Images are compressed in the browser first.
- The agent can also correct customer fields (name, phone, Aadhaar, address, nominee, PAN, account, IFSC, cheque number).
- Notes are saved as JSON in `Verification Notes`: `{riskNotes, gpsCoordinates, mapsLink}`. The "Locate" button fills a `maps.google.com/?q=lat,lng` link.
- After submit, the lead is `Verification Submitted` and Admins get a notification.

## How it works
| Data | Store | Path / URL form | Code |
|---|---|---|---|
| Lead photos (6 slots) | Google Drive | folder `PHOTO_ROOT_FOLDER_ID / NGF-<guarantorCode> / <customerName>`; stored as `https://drive.google.com/open?id=<fileId>` | `lib/drive.ts:69`, `:75` |
| Repayment payment proof | Supabase bucket `payment-proofs` | `<loanId>/<timestamp>_<file>`; URL `/api/drive/supabase:<bucket>/<path>` | `app/api/repayments/route.ts:127` |
| Profile photos | Supabase bucket `profiles` | same proxy URL form | `app/api/profile/route.ts:77` |
| `customer-docs` bucket | Supabase | path helper `NGF-<code>/<customer>/<prefix>.<ext>` exists but nothing calls it | `lib/supabase.ts:85` |

- Browsers load images through the `/api/drive/<id>` proxy (`DriveImage`, `DriveImg`), never directly.
- `scanFolder` (Admin/Staff, "Scan Drive Folder" button): lists the Drive folder, links files by name prefix (`customer_`, `aadhaar_front_` ...), then fills still-empty slots with unmatched images in order.
- Photos can arrive at three points: lead creation (only customer photo + Aadhaar front from `SubmitLeadPage`), agent verification, customer edit (`PATCH /api/customers`).

### Reviews and ratings
- A review is written at collection time, not during verification. `CollectionPage` `ActionPanel` requires a 1-5 star rating, with an optional text from Review Options.
- `POST /api/repayments` stores it in the repayment `Notes` as `<notes> | Review: 4★ · Punctual` (`app/api/repayments/route.ts:136`).
- `lib/reviews.ts`: `parseReview` pulls `{rating, label}` back out (rating 0 for old text-only reviews). `evaluateRenewal` turns a customer's repayments into an eligibility verdict ([[Renewals]]).
- `CustomersPage` Reviews tab shows only star-rated reviews, with average, positive (>= 4) and negative (<= 2) counts.
- Review Options: Admin menu page `ReviewOptionsPage.tsx`, API `app/api/review-options/route.ts`. GET is open to any signed-in user; POST/PATCH/DELETE are Admin only. The collection screen uses only options with category `Review`.

## Rules and gotchas
- Known issue: at lead creation a Drive failure is swallowed (`catch {}` in `app/api/leads/route.ts:134`) and the lead is saved without photos. At verification the same failure returns an error and nothing is saved.
- Known issue: `lib/drive.ts:16` puts the folder name straight into a Drive query (`name='...'`). A customer name with an apostrophe breaks folder lookup. Two customers with the same name under one guarantor share a folder, so `scanFolder` can attach the wrong picture.
- Known issue: repo schema enum `review_category` is `Document/Field/Financial/Other` (`supabase_schema.sql:19`), but code writes `Review` and `General`. The live DB must differ; check [[Tables]] before relying on repo SQL.
- `Verification Status` column is never written (see [[Lead to Loan]]).
- Setup of Drive credentials: [[Runbook Brain]]. Security of the proxy: [[Open Security Leads]].

## Related
[[Loan Lifecycle Brain]] [[Lead to Loan]] [[Renewals]] [[Repayments and Collections]] [[Tech Stack and Folder Map]] [[Data Access Layer]]

## Customer photos on Google Drive (changed 2026-10-18)
- Photos go to Google Drive through the app's own Google sign-in (OAuth client id, secret and refresh token in the server settings). Folder: `PHOTO_ROOT_FOLDER_ID` / `NGF-<guarantor code>` / `<customer name>`.
- Each document type is **one file named by section**: `customer.jpg`, `aadhaar_front.jpg`, `aadhaar_back.jpg`, `house.jpg`, `landmark.jpg`, `cheque.jpg`. A new upload of the same type **replaces the old file in place** (same link, no duplicates). Older files keep their old long names.
- Phones shrink pictures under 1 MB before upload. The server (`lib/drive.ts`, `fitUnderOneMb`, uses `sharp`) is a second net: a picture over 1 MB is stepped down from the largest size and best quality only until it fits. A 6 MB noise-heavy test picture came out at 923 KB.
- Only images and PDF are accepted.
