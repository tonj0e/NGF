---
title: Speed Project 2026-11-19
section: NGF Office
status: round 2 done, waiting for owner review
tags: [ngf, speed, performance]
---
# Speed Project 2026-11-19
Owner: "pages lag here and there; make it smooth". Run by [[NGF Office]].

## Root cause
Supabase is in **Sydney (ap-southeast-2)**, the Hostinger server in **India**: ~285 ms per database round trip (600–960 ms on a new connection). The database itself is tiny (18 MB) and fast (app queries 0.1–28 ms). Slowness = number of round trips one after another. Biggest single fix: move the database to **Mumbai (ap-south-1)** — owner decision; Farhan (DB-1) has the step-by-step plan (dump/restore, ~15–30 min downtime incl. a Hostinger rebuild because NEXT_PUBLIC_SUPABASE_URL is in the client bundle; keep Sydney 1–2 weeks for rollback).

## Baseline (local production build, staff account, 19 Nov 01:00)
Login 6.4 s · Leads 2.0 s · Verification Routes 1.4 s · Collection 1.4 s · Settlements 1.3 s · Reports 1.0 s · Guarantors 2.3 s · Agent Tracking 1.6 s · Payments 3.4 s (22 calls) · Notifications 0.4 s. Other portals: to measure.

## Fix branches (not merged yet; all type-check, no new lint errors)
| Branch | Member | What |
|---|---|---|
| perf/eng1 | Kiran | Payment Chat poll 14 sequential steps → 2 |
| perf/eng2 | Arjun | Agent location POST/GET lighter, Agent Tracking light route view, background polls pause |
| perf/eng3 | Aarav | Company totals cached 45 s, light agent list for Leads, Sentry/QR lazy load, Staff landing page |
| perf/eng4 | Nisha | Leads badge counts (one SQL function + fallback), agents skip counts |
| perf/eng5 | Vivek | Customers list 4→3 steps, parallel paging, Guarantors page no longer loads every customer (ac28471, 61/61 identical checks) |
| perf/eng6 | Divya | Oreo overview, Saturday card, collection status cash query, guarantor dashboard |
Migrations written, not applied: `20261119100000_payment_chat_perf_indexes.sql`, `20261119120000_lead_badge_counts.sql`.

## Other findings for the owner
- **No restorable database backup** (backup list empty, PITR off) — Shalini (SRE-1): Supabase Pro or nightly dump. P0.
- Local dev writes to the live database; no staging; auto-deploy has no gate (CI runs in parallel). P0.
- Uptime check URL in the runbook is wrong (use secret.ngffincorp.com/api/health).
- Lint: 412 errors exist (not blocking); unit tests exist but nothing runs them.
- Agent attendance uses the UTC date in 4 places (00:00–05:30 IST lands on the wrong day) — needs one coordinated fix, owner to approve.
- Security review done by Rahul (SEC-1); details private in `~/.config/ngf-dev/reports/`.

## Next
1. Measure every portal (Anjali, Manoj, Priya, Sanjay, Lakshmi) on the baseline build.
2. Finish Vivek's branch; review and merge all branches; apply the two migrations; rebuild; measure again.
3. Before/after report to the owner; owner says "push".

## Progress 19 Nov 06:30
- Round 1 and round 2 merged on branch `perf/round2` (main untouched, nothing pushed). Reports: [[2026-11-19 Speed Round 1]], [[2026-11-19 Speed Round 2]].
- Reviews: Rohan (code) approved both rounds; Rahul (security) approved round 2, 4 hardening fixes applied.
- Migrations applied (additive): payment_chat perf indexes, lead_badge_counts, customers_page.
- To release: owner reviews, then merge `perf/round2` into main and say "push".
