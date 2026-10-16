---
title: Integrations
section: Architecture
status: current
last_verified: 2026-10-17
tags: [ngf, architecture, integrations, google, email]
---
# Integrations
**One line: what outside services the app talks to, which env variable names enable them, and which routes use them.**

## Key facts
| Service | Used for | Env variable names | Code |
|---|---|---|---|
| Supabase DB + Storage | All data and payment/profile files | `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | `lib/supabase-db.ts`, `lib/supabase.ts` |
| Google Drive (OAuth user) | Lead/customer photos; reading old Drive files | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN`, `NEXT_PUBLIC_APP_URL` | `lib/google.ts:40-58`, `lib/drive.ts` |
| Google service account | Sheets and Drive for one-time setup | `GOOGLE_SERVICE_ACCOUNT_KEY` (JSON or base64 JSON) | `lib/google.ts:6-38` |
| Google Sheets | Legacy data store, now setup and migration only | (service account above) | `lib/sheets.ts`, `app/api/setup/route.ts` |
| Resend | Password-reset code email | `RESEND_API_KEY`, `EMAIL_FROM` | `lib/email.ts` |
| NVIDIA chat API | Admin finance assistant | `NVIDIA_API_KEY`, `NVIDIA_BASE_URL`, `NVIDIA_MODEL` | `app/api/agent/route.ts:62-66` |
| Google Maps JS | Live agent map | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | `components/pages/AgentTrackingPage.tsx:29,356` |
| jsQR / qrcode | Scan and draw ID-card QR codes | none | `Login.tsx:131`, `GuarantorPage.tsx:555`; `qrcode` in Deposits, Commissions, PayoutRequests, MyIdCard pages |

## How it works
- **Drive vs Supabase storage**: new lead and customer photos go to Drive under folder `NGF-<guarantorCode>/<customer>` (root folder id in `APP_CONFIG.PHOTO_ROOT_FOLDER_ID`). Payment proofs and profile photos go to Supabase buckets. Reads for both go through `GET /api/drive/<id>` (any logged-in user). See [[Data Access Layer]].
- **Drive OAuth setup**: `GET /api/drive/auth` redirects to Google consent; `GET /api/drive/callback` shows the refresh token in a page and posts it to the opener. Both are unauthenticated (see gotchas).
- **Sheets**: `POST /api/setup` (header `x-setup-secret` must equal `SETUP_SECRET`) creates folders, spreadsheets and the first admin. `dev/migrate-db` copies Sheets rows into Supabase. Runtime reads do not touch Sheets.
- **Resend**: `POST /api/auth/forgot` sends after the response (`after()`); the result is stored on the OTP row (`email_status`: sent, failed, not_configured). No keys means no mail and a console warning. 10 s timeout.
- **NVIDIA assistant**: `POST /api/agent` (Admin only). Builds a finance snapshot from Loans, Repayments, Capital, Guarantors, Leads, Customers, then calls `<base>/chat/completions`, `max_tokens` 700, languages English/Hindi/Malayalam. Feature switches are Settings keys `agent:enabled`, `agent:voice`, `agent:finance`, `agent:collections`, `agent:payouts`, `agent:capital`, `agent:reports`, `agent:approvals`. The snapshot (business totals) leaves your infrastructure. No component in `components/` calls `POST /api/agent` today, so the assistant has no screen. Only a menu icon key `agent` exists (`AppShell.tsx:52`).
- **Maps**: `AgentTrackingPage` injects the Maps script with the public key and shows a fallback if the key is missing or the placeholder text. `leaflet` is in `package.json` and `globals.css` but no component imports it.
- **QR**: Login scans the ID card QR from the camera into canvas pixels with jsQR. ID cards (`lib/idCard.ts`, `MyIdCardPage`) render QR with `qrcode`.

## Rules and gotchas
- Known issue: `GET /api/drive/auth` and `/api/drive/callback` need no login. Anyone can start the consent flow, and the callback posts the token with target origin `*` (`app/api/drive/callback/route.ts`). See [[Open Security Leads]].
- Known issue: `GET /api/drive/<fileId>` only needs a valid session, not ownership. Any user can fetch any file id or bucket path.
- Hard-coded Google IDs sit in `lib/config.ts:4-6` (spreadsheets, photo folder). They are identifiers, not secrets, but must be changed for a new Google account.
- `NEXT_PUBLIC_*` values are shipped to the browser. Never put secrets there.
- Drive service-account scopes include Docs and full Drive (`lib/google.ts:19-23`).

## Related
- [[Architecture Brain]], [[Config and Env Vars]], [[Auth and Sessions]], [[Runbook Brain]], [[Security Brain]]
