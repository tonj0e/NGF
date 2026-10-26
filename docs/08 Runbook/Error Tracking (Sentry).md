---
title: Error Tracking (Sentry)
section: Runbook
status: current
last_verified: 2026-10-27
tags: [ngf, sentry, logs, errors, monitoring]
---
# Error Tracking (Sentry)
**One line: errors from the server and the browser are sent to Sentry (free plan) with who and which request, never with passwords or ID numbers; you switch it on by pasting one key in Dev > Error tracking.**

## Key facts
- Code: `lib/monitor.ts` (`ensureSentry`, `reportError`, `newRequestId`), `lib/sentryScrub.ts` (privacy filter), `lib/api.ts` (`apiHandler` reports unexpected errors), `instrumentation.ts` (+ `sentry.server.config.ts`, `sentry.edge.config.ts`), `instrumentation-client.ts` (browser), `components/pages/MonitorPanel.tsx`, `app/api/monitor-config` (serves the public key to the browser), `app/api/monitor-test` (Admin only test error).
- The key (`SENTRY_DSN`) is saved encrypted in Dev > Error tracking like the SMS keys; `SENTRY_DSN` as a server env variable also works. No rebuild is needed: the server starts Sentry on the next request (checked every 30 s), the browser fetches the key at page load. Until a key exists, nothing is sent.
- Which errors are reported: bugs (TypeError, ReferenceError...) and database/network failures inside `apiHandler`; plus every `reportError(...)` call (quiet failures such as the branch alert, Google road lines, audit write, photo upload, loan close, gateway webhook). Plain business messages ("Customer not found") are not reported.
- Each reported server error has a short **request id** (also printed in the Hostinger log as `[req abc12345] POST /api/...` and returned as the `X-Request-Id` header). Search that id in Sentry.
- Privacy: no request bodies, cookies or auth headers; keys like password, token, otp, card, aadhaar, pan, account, ifsc, authorization are blanked; the user is sent as id only.
- Tracing is off (`tracesSampleRate: 0`) to stay in the free plan. Source maps are not uploaded (needs a Sentry auth token); browser errors show compiled code until that is added.

## Set up (owner)
1. Create a free account at sentry.io, new project, platform **Next.js**. Copy the **DSN** (Settings > Projects > the project > Client Keys).
2. Dev > Error tracking > Set: paste the DSN, enter the admin password.
3. Press **Send test error**: two issues (server and browser) appear in Sentry within a minute.
4. In Sentry > Alerts, create (a) "a new issue is created" and (b) "errors in 1 hour above 10", both to email; turn on phone notifications for that email.

## Not verified
- Tested with a local fake receiver only (event delivered, secrets removed), not against a real Sentry account.

## Related
[[Troubleshooting]], [[Config and Env Vars]], [[SMS Setup]]
