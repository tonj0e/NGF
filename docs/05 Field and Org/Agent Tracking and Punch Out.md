# Agent tracking and punch-out (2026-10-24)

**Flow:** agent signs in → marks attendance → live location sharing starts by itself → runs on every page → agent taps **Punch out** (pill at bottom-left, or button on the Location page) → sharing stops.

- Phone side: `lib/agentTracker.ts` (one global tracker, not tied to a page) started by `components/agent/AgentTracker.tsx` from `AppShell` for role NGF AGENT. On load it asks `GET /api/agent/attendance?me=1`; if marked in and not punched out it resumes, so a reload or re-login also resumes. Sends every 10 s while the page is visible, keeps the screen awake (Wake Lock) where the phone allows. A web page cannot track with the screen locked or the browser closed; this is the limit of a browser app.
- Server: `POST /api/agent/location` only accepts fixes after attendance is marked and before punch-out (409 otherwise). Marking attendance sets `Is Tracking` true; `PATCH /api/agent/attendance` (punch out) stores `punched_out_at`, `out_latitude`, `out_longitude` and sets `Is Tracking` false. Migration `20261024100000_attendance_punch_out.sql` (applied).
- Viewers (Admin, branch Staff) read `GET /api/agent/location`.
- **Bug fixed:** `Is Tracking` is a boolean in the database but was compared with the text `'true'`, so everyone always showed Offline. Now compared as text.
- Gotcha: `AgentAttendance` rows read back with the key `Attendance Id` (not `Attendance ID`); the column is missing from `COLUMN_MAP`.
- The old Start/Stop Tracking buttons were removed; stopping is only by punch-out.
