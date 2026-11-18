---
title: Speed Round 2 (2026-11-19)
section: NGF Office
tags: [ngf, speed, report]
---
# Speed Round 2 — original vs now
Same method as [[2026-11-19 Speed Round 1]]: QA team, `scripts/perf/measure.mjs`, local production build, live Sydney database. "Before" = original main (e7e8c2a); "Now" = branch `perf/round2` (round 1 + round 2 + review fixes). Best of two visits (phone: one visit).

## Read this first
- Network noise ±0.5 s on one-call pages (Notifications, Reports, Deposits). Ignore changes under ~0.4 s.
- **Login column is inflated in both columns** by a background timer (`/api/monitor-config`, fired 4 s after load) that the tool counted. Real sign-in-to-first-data now: Staff ≈ 1.5 s (login 0.84 s + customers 0.66 s), Admin ≈ 1.7 s, Agent ≈ 1.5 s. The tool now ignores that timer.
- Pictures still 404 locally (old Google token in `.env.local`), so the picture gains (Kiran) are not in these numbers.

## Round 2 work (all reviewed: Rohan code, Rahul security)
| Member | Change |
|---|---|
| Aarav | Login: audit row written after the answer; first page opens without waiting for a permissions call; account row reused for 5 s window (security unchanged: bcrypt 12, all checks) |
| Kiran | Pictures: small Drive thumbnails (`?w=`), 60 MB server cache after the permission check, one shared lazy loader (only visible pictures, 4 at a time) |
| Vivek | Customers page: one database call (`customers_page` function, applied) instead of four in a row; fallback kept |
| Divya | Commissions: every view in one database step (was 4–6) |
| Arjun | Agent My Route / Trip Details / lookups: one-row agent lookup, fewer and smaller reads |
| Rahul fixes | Guarantor commission list returns only their own data (it leaked every guarantor's earnings); pictures not kept in the browser after logout; no Google token on redirects; stricter image paths |

Checks on `perf/round2`: type check passes; lint 397 errors (412 at start, none new); unit tests pass. Migrations applied (additive): payment_chat indexes, lead_badge_counts, customers_page.

## Results (original → now)
| Page | Before | Now | Change |
|---|---|---|---|
| **admin** login | 6.2 s | 4.0 s | |
| admin · Dashboard | 1.8 s | 1.6 s | -12% |
| admin · NGF Branches | 1.4 s | 1.5 s | +10% |
| admin · Branch Town | 1.5 s | 1.3 s | -12% |
| admin · Customers | 3.1 s | 1.6 s | -49% |
| admin · Leads | 0.8 s | 1.4 s | +74% |
| admin · Visit Routes | 1.0 s | 0.9 s | -10% |
| admin · Collection | 0.9 s | 0.8 s | -14% |
| admin · Reports | 0.7 s | 0.4 s | -47% |
| admin · Financial Analytics | 1.9 s | 0.9 s | -54% |
| admin · Settlements | 1.1 s | 0.7 s | -36% |
| admin · Payments | 2.4 s | 2.4 s | +1% |
| admin · Import Customer | 0.9 s | 1.1 s | +27% |
| admin · Payout Requests | 1.2 s | 0.5 s | -56% |
| admin · Guarantors | 2.7 s | 1.4 s | -49% |
| admin · Review Options | 0.7 s | – |  |
| admin · Agent Tracking | 1.2 s | 1.0 s | -14% |
| admin · Notifications | 0.5 s | 0.7 s | +48% |
| admin · Dev | 0.9 s | 0.9 s | -9% |
| admin · Oreo (AI) | 1.5 s | 1.1 s | -30% |
| **manager** login | 5.5 s | 4.6 s | |
| manager · Customers | 4.1 s | 2.4 s | -40% |
| manager · Leads | 1.9 s | 1.6 s | -15% |
| manager · Verification Routes | 1.4 s | 1.2 s | -11% |
| manager · Collection | 1.1 s | 1.4 s | +23% |
| manager · Settlements | 0.6 s | 1.3 s | +116% |
| manager · Reports | 1.0 s | 0.7 s | -34% |
| manager · Guarantors | 2.4 s | 1.7 s | -31% |
| manager · Agent Tracking | 1.4 s | 1.2 s | -18% |
| manager · Payments | 2.6 s | 2.2 s | -17% |
| manager · Notifications | 0.3 s | 0.6 s | +88% |
| **staff** login | 5.0 s | 4.3 s | |
| staff · Customers | 4.0 s | 2.5 s | -38% |
| staff · Leads | 2.2 s | 1.6 s | -29% |
| staff · Verification Routes | 1.6 s | 1.2 s | -25% |
| staff · Collection | 1.1 s | 0.7 s | -33% |
| staff · Settlements | 1.2 s | 0.7 s | -40% |
| staff · Reports | 0.6 s | 0.8 s | +44% |
| staff · Guarantors | 2.5 s | 1.3 s | -49% |
| staff · Agent Tracking | 1.1 s | 0.8 s | -27% |
| staff · Payments | 3.8 s | 1.7 s | -54% |
| staff · Notifications | 0.8 s | 0.5 s | -40% |
| **agent** login | 5.4 s | 4.4 s | |
| agent · Assigned Verifications | 1.9 s | 1.0 s | -47% |
| agent · My Route | 1.2 s | 0.7 s | -40% |
| agent · Assigned Customers | 1.2 s | 0.6 s | -51% |
| agent · Collection | 0.7 s | 0.9 s | +37% |
| agent · Trip Details | 0.9 s | 0.9 s | 0% |
| agent · Notifications | 0.6 s | 1.3 s | +119% |
| agent · Live Location | 0.3 s | – |  |
| **guarantor** login | 2.4 s | 2.0 s | |
| guarantor · Dashboard | 1.4 s | 1.5 s | +8% |
| guarantor · Leads | 1.9 s | 1.6 s | -12% |
| guarantor · Collection | 0.9 s | 0.9 s | -1% |
| guarantor · Commissions | 2.4 s | 0.9 s | -64% |
| guarantor · Deposits | 0.7 s | 0.8 s | +3% |
| guarantor · My Customers | 5.9 s | 3.9 s | -34% |
| guarantor · My ID Card | 0.7 s | 0.3 s | -54% |
| guarantor · Notifications | 0.3 s | 0.7 s | +111% |
| **agent-mobile** login | 4.6 s | 4.3 s | |
| agent-mobile · My Route | 4.2 s | 2.4 s | -44% |
| agent-mobile · Assigned Customers | 2.0 s | 1.4 s | -31% |
| agent-mobile · Collection | 2.1 s | 1.4 s | -35% |
| agent-mobile · Trip Details | 1.7 s | 1.3 s | -26% |
| agent-mobile · Notifications | 2.3 s | 1.1 s | -50% |
| **guarantor-mobile** login | 4.2 s | 2.0 s | |
| guarantor-mobile · Leads | 4.4 s | 2.9 s | -34% |
| guarantor-mobile · Collection | 1.3 s | 0.9 s | -36% |
| guarantor-mobile · Commissions | 2.4 s | 1.4 s | -42% |
| guarantor-mobile · Deposits | 1.3 s | 0.8 s | -38% |
| guarantor-mobile · My Customers | 8.6 s | 2.7 s | -68% |
| guarantor-mobile · My ID Card | 1.2 s | 0.8 s | -30% |
| guarantor-mobile · Notifications | 0.8 s | 1.2 s | +48% |

## Still open
- Payments 1.7–2.4 s and My Customers: re-measure once the Google token in `.env.local` is renewed (pictures).
- Leads ~1.5 s (same-Aadhaar follow-up step). Notifications/one-call pages limited by the ~285 ms Sydney round trip.
- Biggest remaining win: database to Mumbai (owner decision; plan by Farhan).
- For the owner: QR login does not check "blocked" (pre-existing, Rahul N5); no restorable backups (Shalini P0).
