---
title: ID Cards and QR
section: Field and Org
status: current
last_verified: 2026-10-17
tags: [ngf, field-and-org, id-card, qr, profile]
---
# ID Cards and QR
**One line: how a user's printable ID card is built (photo, card number, QR) and how the profile is saved.**

## Key facts
- Reachable as sidebar "My ID Card" for Guarantors (`AppShell.tsx:93`) and as "My Profile" in every role's user dropdown (`AppShell.tsx:419`). Page: `components/pages/MyIdCardPage.tsx`.
- Builder: `lib/idCard.ts` (`buildIdCardHtml`, `idCardPayload`, `buildIdNumber`). Profile API: `app/api/profile/route.ts`. Table `profiles` (user_id, photo, blood group, emergency contact, place, card number).
- QR payload is JSON: `{ t: 'NGF_ID', uid, un, role, card }` (`lib/idCard.ts:28`). It holds user id, username, role and card number. No secret, no signature.
- The QR is used in login: `POST /api/auth/verify-qr` only checks that the scanned `uid` equals the pre-authenticated user id (`app/api/auth/verify-qr/route.ts:31`). See [[Auth and Sessions]].
- Card number format: guarantor code (or `NGF`) + `-` + random 4 digits, unique among profiles (`profile/route.ts:7`). If no card number is stored, `buildIdNumber` makes a 12-digit fallback for display.

## How it works
1. `GET /api/profile` returns the caller's profile. If no card number exists it creates one and inserts or updates the `profiles` row, so the first view writes data.
2. Admin and Staff can pass `?userId=` to read any user's profile (`profile/route.ts:20`).
3. User picks a photo. The browser resizes it to at most 260 px on the long side, JPEG quality 0.7, and keeps it as a data URL (`MyIdCardPage.tsx:8`).
4. Save sends `{photo, bloodGroup, emergencyContact, place}` to `POST /api/profile`. The data URL is stored directly in `profiles.photo`.
5. Print: the page builds a QR with the `qrcode` package (240 px), opens a new window, writes the card HTML, and the HTML calls `window.print()` on load (`idCard.ts:157`). Pop-up blockers stop it (toast "Allow pop-ups").
6. Card is two 300x474 px faces. Front: name, role title, ID, optional blood group / emergency contact / place, a decorative barcode (not scannable data). Back: QR, join date, expiry (join + 2 years, computed, not stored), logo watermark from `/ngflogo.png`.

## Rules and gotchas
- Photo handling: the Supabase `profiles` bucket path exists (`profile/route.ts:76`, needs `photoFile`), but the page never sends `photoFile`, so photos live inside the table as data URLs, not in storage. See [[Files and Storage]].
- Known issue: if `photoFile` were sent, the object path would be `<userId>/profile.<photoFileType>` where the type is a MIME string such as `image/jpeg` (`profile/route.ts:79`), creating a nested path. Unused today.
- `POST /api/profile` has no size or type check on `photo`. A huge data URL goes straight into the row.
- Any Staff user (not only Admin) can read and overwrite any user's profile and photo by passing `userId`; no branch limit (`profile/route.ts:61`). See [[Open Security Leads]].
- The builder has role titles for Admin, Guarantor, NGF AGENT and Staff (`idCard.ts:47`).
- Join date uses `users.created_at`; the card shows the viewer's local date format `dd-mm-yyyy`.
- `esc()` escapes name and text fields, but the photo `src` and QR `src` are inserted unescaped (they are data URLs the page generated).

## Related
- [[Field and Org Brain]]
- [[Files and Storage]]
- [[Auth and Sessions]]
- [[Roles and Permissions]]
