---
title: Architecture Brain
section: Architecture
status: current
last_verified: 2026-10-17
tags: [ngf, architecture, brain]
---
# Architecture Brain
**One-page map of how the NGF CRM is built: one Next.js page, many `/api/*` routes, one Supabase service-role client.**

Purpose: explain the moving parts (stack, request flow, auth, data layer, integrations, config) so a new session can find code fast.
Start here, then jump to the note you need. Parent map: [[00 BRAIN]].

## Five things to remember
1. The UI is a single client page at `/` (`app/page.tsx`). There is no router per screen: `AppShell` swaps a `view` string. See [[Request Flow]].
2. There is no `middleware.ts` or `proxy.ts`. Every API route must check auth itself with `getSession` or `requireRole` (`lib/api.ts`).
3. The browser keeps a JWT in `localStorage` (`ngf_token`) and sends it as `Authorization: Bearer`. Tokens last 24 h. See [[Auth and Sessions]].
4. All data access uses the Supabase service-role key and reads whole tables (30 s cache). RLS is bypassed. See [[Data Access Layer]].
5. Many names are leftovers from the Google Sheets era: PascalCase column names, `SHEETS`, `lib/sheets.ts`. Code still maps them to snake_case. See [[Tech Stack and Folder Map]].

## Notes in this section
| Note | What it answers | Read when |
|---|---|---|
| [[Tech Stack and Folder Map]] | Versions, folders, where things live | You are new or lost |
| [[Request Flow]] | How `/` renders and calls `/api/*` | Debugging a screen or an API call |
| [[Auth and Sessions]] | Login, QR step, JWT, reset by email, CSRF, rate limits | Touching login or security |
| [[Data Access Layer]] | `readTable`, cache, column maps, storage buckets | Writing a query or worrying about scale |
| [[Integrations]] | Drive, Sheets, Resend, NVIDIA, Maps, QR | Something external breaks |
| [[Config and Env Vars]] | `lib/config.ts`, env variable names | Deploying or adding a setting |

## Known issues
- CSRF check never rejects a bad token (only a missing one). See [[Auth and Sessions]].
- Rate limiter is in-memory per server instance. See [[Auth and Sessions]].
- `GET /api/dev/migrate-db` has its auth check commented out. See [[Open Security Leads]].
- Whole-table reads on every request will not scale. See [[Data Access Layer]].
- Full security list: [[Security Brain]].

## Update this section when ...
- A dependency major version changes (`package.json`).
- A `middleware.ts`/`proxy.ts` is added (changes [[Request Flow]] and [[Auth and Sessions]]).
- `lib/auth.ts`, `lib/api.ts`, `lib/csrf.ts` or `lib/rate-limiter.ts` change.
- `lib/supabase-db.ts` changes cache, maps or client creation.
- A new env variable or external service appears.
- Related sections: [[Roles and Screens Brain]], [[Tables]], [[Runbook Brain]].
