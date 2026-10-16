---
title: Tech Stack and Folder Map
section: Architecture
status: current
last_verified: 2026-10-17
tags: [ngf, architecture, stack, folders]
---
# Tech Stack and Folder Map
**One line: what the app is built with (versions from `package.json`) and what each top-level folder holds.**

## Key facts
| Area | Choice | Version (`package.json`) |
|---|---|---|
| Framework | Next.js (App Router) | 16.2.6 |
| UI | React | 19.2.4 |
| Styling | Tailwind CSS 4 (`@tailwindcss/postcss`), Radix UI primitives, lucide-react | ^4 |
| Animation | framer-motion | ^14.1.0 |
| Charts | recharts | ^3.10.1 |
| Maps | leaflet (CSS), Google Maps JS loaded by script tag | leaflet ^1.9.4 |
| Database | Supabase via `@supabase/supabase-js` | ^2.117.3 |
| Auth | `jose` JWT (HS256), `bcrypt` (12 rounds) | jose ^6.2.3, bcrypt ^6.0.0 |
| Validation | zod | ^4.6.5 |
| Google | `googleapis` | ^171.4.0 |
| QR | `jsqr` (scan), `qrcode` (generate) | ^1.4.0 / ^1.5.4 |
| Tests | Playwright | ^1.64.0 |
| Language | TypeScript | ^5 |

Scripts: `dev` (`next dev -H 0.0.0.0`), `build`, `start` (port 3000), `lint`.
Unused-looking deps: `next-auth`, `jsonwebtoken`, `bcryptjs` are installed but auth code imports `jose` and `bcrypt` (`lib/auth.ts:1-3`).

Next.js 16 differs from older versions. `AGENTS.md` says to read `node_modules/next/dist/docs/` before writing Next code.

## Folder map
| Folder | Holds |
|---|---|
| `app/page.tsx` | The only page: login gate, attendance gate, `AppShell` |
| `app/layout.tsx`, `app/globals.css` | Root layout and styles (includes `ngf-dark` rules) |
| `app/auth/forgot-password/` | Password recovery page (email code flow) |
| `app/api/**/route.ts` | All backend endpoints (about 26 groups: auth, leads, loans, repayments, settlements, staff, branches, deposits, dev ...) |
| `components/AppShell.tsx` | Sidebar, header, view switch. See [[Screens Map]] |
| `components/Login.tsx` | Sign-in, QR scan step |
| `components/pages/` | One component per screen (30 files; `Dashboard.tsx.bak` is a stray backup) |
| `components/charts/` | Dashboard charts incl. `RecollectionGauge` |
| `components/org/` | Branch/staff org dialogs and cards |
| `components/ui/` | Shared Radix-based primitives (button, sheet, avatar, `DriveImage`) |
| `lib/` | Server and shared logic. See table below |
| `types/index.ts` | `Role`, `Session`, `Lead`, `BranchRole` types |
| `migrations/`, `supabase/`, `*.sql` at root | SQL for the database. See [[Tables]] |
| `scripts/`, `tests/` | Helper scripts, Playwright tests |
| `docs/` | This vault |

## Key `lib/` files
| File | Job |
|---|---|
| `api.ts` | `getSession`, `requireRole`, `ok`, `err`, `apiHandler` |
| `auth.ts` | JWT create/verify, bcrypt, special tokens |
| `supabase-db.ts` | Table access layer ([[Data Access Layer]]) |
| `supabase.ts` | Storage buckets |
| `drive.ts`, `google.ts` | Google Drive access ([[Integrations]]) |
| `sheets.ts` | Legacy Sheets reader, now used only by `dev/migrate-db` |
| `email.ts`, `otp.ts` | Resend mail and reset codes |
| `csrf.ts`, `rate-limiter.ts`, `audit.ts`, `validation.ts`, `passwordPolicy.ts`, `devOnly.ts` | Security helpers |
| `financial.ts`, `loanProducts.ts`, `projection.ts`, `deposits.ts`, `dateUtils.ts` | Money and date logic ([[Loan Products and Math]]) |
| `config.ts` | Constants ([[Config and Env Vars]]) |

## Rules and gotchas
- Path alias `@/` points to the project root (used as `@/lib/api`).
- Date logic is IST based (`getTodayIST` in `lib/dateUtils.ts`).
- Ignore folders with `node_modules 2`, `node_modules 3`, `node_modules.nosync` and the many root screenshots.

## Related
- [[Architecture Brain]], [[Request Flow]], [[Config and Env Vars]], [[Screens Map]]
