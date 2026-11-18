---
title: Speed Round 1 (2026-11-19)
section: NGF Office
tags: [ngf, speed, report]
---
# Speed Round 1 — before / after
Measured by the QA team (Anjali, Manoj, Priya, Sanjay, Lakshmi) with `scripts/perf/measure.mjs` on a local production build (Mac, same live Sydney database). Before = main e7e8c2a; after = branch `perf/integration` (six speed branches + review fixes, two additive migrations applied). Time = from clicking the menu item until the page's last data call finished (best of two visits; phone runs one visit).

## Read this first
- **Network noise is about ±0.5 s.** Each database trip goes to Sydney (~285 ms, sometimes 600–900 ms). Pages with a single call (Notifications, My ID Card, Reports) moved up or down by that much between runs even where no code changed. Treat changes under ~0.4 s as noise.
- **Login** (4–6 s) was not changed in round 1; its swings are noise. It is the top item for round 2.
- Thumbnails (Payments, Customers, My Customers) still fail locally (old Google token in `.env.local`) and each takes 0.5–6 s through the server: round 2.
- The biggest single fix remains moving the database to Mumbai (owner decision).

## Results
| Page | Before | After | Change |
|---|---|---|---|
| result-admin.json | missing | | |
| result-manager.json | missing | | |
| result-staff.json | missing | | |
| result-agent.json | missing | | |
| result-guarantor.json | missing | | |
| result-agent-mobile.json | missing | | |
| result-guarantor-mobile.json | missing | | |

## Clear wins (well above the noise)
Guarantors page −50 to −60 % on every portal · Financial Analytics −64 % · Oreo −54 % · Guarantor dashboard −58 % · Admin dashboard −25 % · Settlements −40 to −48 % · Agent phone My Route −45 % · Customers −15 to −24 % · Payments −13 to −28 %.

## Review
Rohan (BE-1) reviewed the merged code: no blockers, no cross-user cache leaks, every new light mode keeps the same permission and branch scope. Fixes applied: Capital always reads fresh totals; Agent Tracking light view checks access before reading. Type check passes, lint 409 errors (was 412, none new), unit tests pass.

## Round 2 (assigned)
1. Login 4–6 s → Aarav. 2. Thumbnails through the Drive proxy (full-size images, no cache) → Kiran. 3. My Customers 6–8 s and Customers 2.4–3.4 s → Vivek. 4. Commissions payout ~2 s → Divya. 5. Agent Assigned Verifications / My Route ~1.5–1.9 s → Arjun.
