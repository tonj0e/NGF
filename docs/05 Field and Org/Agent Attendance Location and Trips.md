---
title: Agent Attendance Location and Trips
section: Field and Org
status: current
last_verified: 2026-10-17
tags: [ngf, field-and-org, agent, location, trips]
---
# Agent Attendance Location and Trips
**One line: how an NGF AGENT checks in, shares live location, and logs trips, and how Admin/Staff watch them. Several parts are broken today.**

## Key facts
| Piece | Where | Who |
|---|---|---|
| Check-in gate | `app/page.tsx:7` (`AttendanceModal`), `onLogin` line 163 | NGF AGENT, after a fresh login |
| Attendance API | `app/api/agent/attendance/route.ts` | POST agent; GET agent/Admin/Staff |
| Location push | `AgentLocationPage.tsx` -> `POST /api/agent/location` | NGF AGENT |
| Tracking toggle | `POST /api/agent/location/toggle` | NGF AGENT |
| Live map | `AgentTrackingPage.tsx` -> `GET /api/agent/location` | Admin; Staff with `agentTracking` |
| Trips | `POST/GET /api/agent/trips`, `TripDetailsPage.tsx`, save-trip in `VerificationsPage.tsx:152` | agent writes; Admin/Staff can read |
- Tables: `agent_attendance` (one row per agent per day), `agent_trips`, and location columns on `agents` (latitude, longitude, location_accuracy, location_updated_at, is_tracking).
- Only the last fix is stored. There is no location history table.
- `app/api/agent/route.ts` is NOT field-agent code. It is the Admin AI finance assistant (calls an external LLM using `NVIDIA_API_KEY`). No screen calls it.

## How it works
1. Agent logs in. `onLogin` shows `AttendanceModal` instead of the app. It reads GPS (high accuracy, 10 s timeout) and posts latitude, longitude, accuracy.
2. Server rejects a second check-in the same day (`attendance/route.ts:33`) and writes status `Present` plus an audit entry.
3. "Skip for Now" closes the modal with no check-in. The gate is soft, and it only runs on a fresh login, not when a saved session is restored (`page.tsx:147`).
4. In "Live Location" the agent presses Start Tracking. The browser `watchPosition` feeds state, and a 10 s timer should post the position to `/api/agent/location`, which overwrites the agent's location columns and sets `is_tracking`.
5. Stop Tracking clears the watch and posts `isTracking:false` to the toggle route.
6. Map page polls `GET /api/agent/location?activeOnly=true` every 5 s. An agent is "online" when `is_tracking` and the fix is at most `maxAge` minutes old (default 5). Map is Google Maps JS using `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
7. Trip: after a visit the agent saves start (last known point) and end (current GPS). Server computes straight-line haversine km unless `manualDistance > 0` (`trips/route.ts:43`), stores `Distance Km`, trip date and the Monday `Week Start`. Trip page prices at a hard-coded Rs 10 per km (`TripDetailsPage.tsx:65`).

## Rules and gotchas
- Known issue: live map is always empty. `is_tracking` is a boolean column, but `location/route.ts:108` compares it to the string `'true'`, so `isTracking` and `isOnline` are always false and `activeOnly=true` filters everyone out. (Based on `supabase_schema.sql:529` and `readTable` not stringifying values.)
- Known issue: location may never be sent. `startTracking` and `sendLocation` capture `position` from the render at click time, which is null on first start (`AgentLocationPage.tsx:113,153,157`). The first send and the timer both bail out; after a restart they re-send the stale old position.
- Known issue: Trip Details page breaks. `GET /api/agent/trips` returns raw Pascal-case rows (`Trip ID`, `Distance Km`) but the page reads `weekStart`, `distanceKm` (`TripDetailsPage.tsx:41,63,110`). Weeks list stays empty and `t.distanceKm.toFixed` throws when trips exist.
- Known issue: attendance and trip POSTs need a CSRF cookie that only login sets, with a 1 hour life (`lib/csrf.ts:7`). Saving a trip more than an hour after login returns 403 "CSRF token required". The token itself is never checked: `verifyCsrfToken` is async and not awaited (`csrf.ts:61`), so any non-empty value passes. See [[Open Security Leads]].
- Known issue: page copy says "every 30 seconds" (`AgentLocationPage.tsx:295`); code is 10 s.
- Stopping tracking only sets `is_tracking` false. A later location push turns it back on.
- SSE (`PATCH /api/agent/location`) is unused by the UI, keeps connections in process memory, and with no `agentId` subscribes to nothing (the map is empty at connect time). Do not rely on it.
- Attendance GET and trips GET let any Admin/Staff read any agent by `agentId`. No check-out exists.
- Agent deletion FKs: see `migrations/2026-10-14-fix-agent-deletion-*.sql`.

## Related
- [[Field and Org Brain]]
- [[Branches and Staff]]
- [[Lead to Loan]]
- [[Roles and Permissions]]
- [[Auth and Sessions]]


## Live map notes (2026-10-22)
- `AgentTrackingPage` polls every 5 seconds with one timer (cleared on leave). Staff see only agents of their own branch (`getBranchAccess`).
- The Google Maps key must allow the site address (referrer restriction), otherwise Google shows `RefererNotAllowedMapError`; the page then shows a clear message and the agent list still works.
- Agent Tracking is suggested for manager, assistant manager and accountant.
