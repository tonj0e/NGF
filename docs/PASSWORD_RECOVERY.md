# Password recovery (email OTP)

Flow: **Login → Forgot Password? → user ID → 6-digit code (sent to the email saved on that account) → new password → success.**

> Changed 2026-10-18: the screen asks for the **user ID**, not an email. The code goes to `users.email` of that user ID (user IDs are unique, so only that account can be reset). Several accounts may share one email during testing; later each user gets their own email and the shared test email must be removed. A user ID with no usable email (empty or `.invalid`) gets the same generic reply and no code; an admin resets it from Dev tools.

| Step | Route | Notes |
|---|---|---|
| 1 | `POST /api/auth/forgot` | Always returns the same generic response. Sends the code after responding. |
| 2 | `POST /api/auth/verify-otp` | Exchanges email + code for a 10-minute, single-purpose reset token. |
| 3 | `POST /api/auth/reset` | Validates the password, consumes the code (single use), updates the hash. |

## Security properties
- Codes: `crypto.randomInt` six digits; only an HMAC (keyed with `JWT_SECRET`, bound to the row id) is stored.
- 10-minute expiry · single use · 5 verification attempts (optimistic-lock increment) · 60 s resend cooldown · 5 codes/hour/account · per-IP limit on every step (in-memory, per instance).
- A new code invalidates older ones. Successful reset invalidates any remaining codes.
- Responses never reveal whether an email is registered; all code failures share one message.
- Only **Active** accounts whose user ID matches and that have a usable email can recover. Shared emails are allowed for now (testing).
- Password policy (server-side, `lib/passwordPolicy.ts`): 10–128 chars, ≥3 of lower/upper/number/symbol, not common, not containing username/email name, not equal to the current password.
- The new hash replaces `users.password_hash`; session tokens carry a fingerprint of that hash (`lib/api.ts getSession`), so **all of that user's earlier sessions stop working immediately**. Other users are unaffected.
- OTPs and passwords are never logged. Audit events: `PASSWORD_RESET_OTP_ISSUED`, `PASSWORD_RESET_EMAIL_SENT/FAILED`, `PASSWORD_RESET_OTP_VERIFIED/FAILED`, `PASSWORD_RESET`, `DEV_USER_PASSWORD_RESET`.
- "Email sent" is recorded **only** after Resend accepts the message and returns an id (`password_reset_otps.email_status`, `email_provider_id`). The UI never claims delivery.

## Database
Apply `supabase/migrations/20261016120000_add_password_reset_otps.sql` (also mirrored in `migrations/`). It is additive: one new table `password_reset_otps` (RLS on, no policies → service role only). Nothing existing is altered.

## Environment variables (server only — never `NEXT_PUBLIC_`)
| Variable | Purpose |
|---|---|
| `RESEND_API_KEY` | Resend API key (Sending access is enough). |
| `EMAIL_FROM` | Sender, e.g. `NGF FINCORP <no-reply@mail.yourdomain.com>`. Must be on a verified domain. |
| `JWT_SECRET` | Already required (≥ 32 chars); also keys the OTP hash and reset tokens. |
| `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` | Already required. |

All live in `.env.local` (git-ignored via `.env*`). Set the same variables in your hosting provider for deployments.

## Email DNS (Resend domain verification)
1. Resend dashboard → **Domains → Add Domain** (a sending subdomain such as `mail.yourdomain.com` is recommended).
2. Add the DNS records Resend shows: **SPF** (TXT, includes Resend), **DKIM** (TXT/CNAME `resend._domainkey`), and the **MX** record for the bounce subdomain.
3. Add **DMARC** at `_dmarc.yourdomain.com`, e.g. `v=DMARC1; p=none; rua=mailto:you@yourdomain.com` (tighten to `quarantine` once reports look clean).
4. Wait until the domain shows **Verified**, then set `EMAIL_FROM` to an address on it.
Until a domain is verified Resend only allows its test sender to the account owner's own address.

## Delivery test
```
node scripts/test-email-delivery.mjs you@yourdomain.com
```
`SENT` = accepted by Resend (prints the message id). Then confirm the inbox, and Resend's dashboard shows *Delivered*.

## Dev-only Admin utility
Dev tools → **User Password Reset**. `POST /api/dev/user-password-reset` returns 404 whenever `NODE_ENV`, `VERCEL_ENV` or `APP_ENV` is `production` (enforced in the route, not just the UI). Requires an Admin session and typing `RESET <username>`; the password is never returned or logged; the action is audited and revokes the target's sessions.
> Existing `/api/dev/*` routes (`clear`, `fix-passwords`, `seed-admin`, `migrate-*`) have **no** production guard — only an Admin check. Consider adding `devOnlyGuard()` to them.

## Known limits
- `users.email` is free text and unverified; whoever can edit a user's email can direct codes to it (Admins can already set passwords directly).
- Per-IP limiting is in-memory (per server instance); per-account limits are database-backed and shared.

## Screen look (2026-10-18)
The recovery pages sit on a white background with soft moving bands and a frosted-glass card (black text, black buttons). The code step has six digit boxes (paste and backspace work). While the code is checked the boxes gather and orbit; on success they merge into a green tick box, the title becomes "Verified Successfully" and the button turns green "Verified & Secured" before the new-password step. A wrong code shakes the boxes. Reduced-motion settings switch the orbit off. Code: `app/auth/forgot-password/page.tsx` (CSS in the `CSS` constant).
