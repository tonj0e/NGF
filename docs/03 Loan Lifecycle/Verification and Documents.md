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

## Partial verification (2026-11-20)
**Customer not at home: the agent saves what can be done at the house, the office finishes the rest when the customer comes in.**

| Step | Who | Screen | API | Lead status |
|---|---|---|---|---|
| Submit partial verification | the assigned NGF AGENT, lead in Agent Assigned | `VerificationsPage.tsx`, amber box "Customer not at home?" under the normal Submit | `PATCH /api/leads/:id {action:'submitPartialVerification'}` | Agent Assigned → **Partially Verified** |
| Complete verification | Admin, or Staff with `leadsEdit` for a lead of their own branch (`staffMaySee`, same as Edit) | Leads > New leads > **Partially verified** > Complete verification (`CompleteVerificationForm.tsx`) | `PATCH /api/leads/:id {action:'completeVerification'}` | Partially Verified → **Verification Submitted** |

- **Agent, partial:** needs the house photo, the landmark photo and the home location (Locate button = `gpsCoordinates` "lat,lng", or a pasted Maps link). The button stays disabled with a checklist until all three are there; the server checks them again (`partialMissing` in `lib/partialVerification.ts`). No customer OTP. Risk level, recommendation, phone, Aadhaar and bank details are optional and **never block** the partial submit (owner, 2026-11-25): an invalid phone, Aadhaar (not 12 digits), Maps link or bank details (checked with `visitBankBlock`) is simply not saved, the lead keeps what it had, and the office corrects it when completing (where the full rules apply). Every other box and photo the agent filled is saved the same way as a full submit. Records `partial_verified_at`, `partial_verified_by` (agent's user id); audit `LEAD_PARTIALLY_VERIFIED`; notifies Admins and the branch planners (audit and alerts are best effort after the save). The save is one update that only applies while the lead is still Agent Assigned and assigned to this agent. Any OTP code / override on the lead is cleared, so the office always confirms the customer's OTP. If the agent changed the phone or the bank details without the customer there, the notes JSON records `agentChanged: ['phone'|'bank']` and the office form marks those boxes "Changed by the agent during the partial visit: check with the customer". A "Submit later" draft remembers that it was a partial verification (hidden box `submitKind`) and shows a hint to press the partial button. The Maps link must be an `http(s)://` link (schema, also for the full submit).
- **Route:** `Partially Verified` is in `DONE_LEAD_STATUSES` (`lib/routes.ts`): the stop is done (green tick, "PARTIAL" on the staff route board, a note on My Route), its km count for the travel allowance, it leaves the agent's Assigned Verifications list (that list reads only Agent Assigned), and the planner can no longer move, unplan or return it. The trip prompt after submit is the same as for a full submit.
- **Office, complete:** the form shows the agent's house and landmark photos and location read-only (they are never overwritten by this action), and is prefilled with everything else the agent saved. Same rules as the agent's full submit: risk level and recommendation required, bank details valid when the recommendation is Verified or bank boxes are filled, and the **customer OTP** verified in the last 12 h for the same phone, or overridden with a reason. The OTP is sent with the normal `OtpPanel` (`/api/otp` purpose `lead_verification` now also accepts Admin/Staff for a Partially Verified lead, `leadsEdit` + own branch) and goes **only to the phone stored on the lead** (a typed number is ignored, like renewals); the completion checks the OTP against that stored number. Overriding there needs the branch manager / assistant manager or Admin (`canOverrideIn`, as for renewals). **Changing the phone** while completing is refused unless the user is branch manager / assistant manager / Admin, and is then audited (`LEAD_PHONE_CHANGED_IN_OFFICE`, masked numbers). Status, `office_completed_at/_by` and every detail are written in **one** update that only applies while the lead is still Partially Verified (`updateByIdWhen` in `lib/supabase-db.ts`), so two staff cannot both complete it and nothing is half-saved; the audit line (`LEAD_VERIFICATION_COMPLETED_IN_OFFICE`) and the alerts run after it, best effort, and never undo a saved completion.
- Agents cannot complete a partial verification. The office can also Reject it.
- **Pending an owner decision (PM, 2026-11-20):** a Partially Verified lead can NOT be sent to an agent again: `assignAgent` (Change agent) and Request Reverification refuse it with "The agent already visited; complete the verification in the office" (`PARTIAL_LOCKED_MSG`), and the Leads page shows no such buttons for it. Reason: the first visit and its km are already counted. Request Reverification of a Verification Submitted / Approved lead clears the four partial/office columns (when set), as the next visit is a new one.
- Photo reading: `lib/imageCompress.ts` now fails with a clear message on a picture the browser cannot open (before it waited for ever), and both forms free the submit button when that happens.
- Shared code: `lib/partialVerification.ts` (pure rules, unit test `tests/unit/partialVerification.test.ts`); `lib/imageCompress.ts` (the photo shrinking, moved out of `VerificationsPage.tsx`). The full `submitVerification` now uses the same helpers (`visitOtpBlock`, `visitBankBlock`, `uploadVisitPhotos`, `visitFields`) with unchanged rules.
