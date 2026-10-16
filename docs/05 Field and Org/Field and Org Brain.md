---
title: Field and Org Brain
section: Field and Org
status: current
last_verified: 2026-10-17
tags: [ngf, field-and-org, brain]
---
# Field and Org Brain
**One line: map of the organisation (branches, staff, guarantors), field-agent tracking, notifications, ID cards, file storage and the Dev tools.**

Purpose: explain who belongs where, how field agents are tracked, and how files and admin tools behave, including what is broken.

## Five things to remember
1. Branches are labels, not walls. No API filters data by branch; `staff_access.permissions` only decides which sidebar items a Staff user sees.
2. Live agent map and Trip Details are broken by type mismatches (boolean `is_tracking`, Pascal-case rows). See [[Agent Attendance Location and Trips]].
3. The header bell is fake. Real notifications exist only on the Notifications page and only for lead events.
4. Lead photos live in Google Drive; payment proofs in Supabase `payment-proofs`; ID-card photos are data URLs inside `profiles`. The file proxy needs only a login.
5. Most `app/api/dev/*` routes have no production guard. `migrate-db` GET has no auth at all. See [[Dev and Admin Tools]].

## Notes
| Note | What it answers | Read when |
|---|---|---|
| [[Branches and Staff]] | Branch model, roles, permissions, add/edit/block/delete, guarantor list in a branch | Changing the NGF Branches page or user admin |
| [[Agent Attendance Location and Trips]] | Check-in gate, location push, live map, trips | Touching agent screens or the map |
| [[Notifications]] | Who creates and sees notifications, read state, the bell | Adding an event or fixing unread state |
| [[ID Cards and QR]] | Card build, QR payload, print, photo | Changing the card or QR login |
| [[Files and Storage]] | Drive and Supabase buckets, naming, proxy route | Any upload or image display work |
| [[Dev and Admin Tools]] | Every dev route, guard, danger level | Before running or removing a dev tool |

## Known issues
- Permanent block, `7d`/`30d` durations and Edit User branch changes do not work as the UI implies ([[Branches and Staff]]).
- Live map empty; location push stale closure; Trip Details crash; CSRF token never really verified ([[Agent Attendance Location and Trips]]).
- Read notifications never look read; PATCH has no owner check ([[Notifications]]).
- Supabase file URLs with slashes 404 on the proxy; Drive OAuth routes need no login ([[Files and Storage]]).
- Unauthenticated `migrate-db` GET, shared default password tool, broken migrate-* routes ([[Dev and Admin Tools]]).
- Security detail: [[Open Security Leads]], [[Security Brain]].

## Update this section when
- `app/api/branches/**`, `app/api/staff/**`, `components/org/*` or `StaffPage.tsx` change.
- Any `app/api/agent/**` route, `AgentTrackingPage`, `AgentLocationPage`, `TripDetailsPage` or the gate in `app/page.tsx` changes.
- `lib/notifications.ts` gets a new caller, or the bell is wired to real data.
- `lib/idCard.ts`, `app/api/profile/route.ts` or the QR payload changes.
- `lib/drive.ts`, `lib/supabase.ts`, `app/api/drive/**` or a bucket changes.
- A dev route is added, removed or gets a new guard (`lib/devOnly.ts`).

Also see [[00 BRAIN]], [[Roles and Permissions]], [[Screens Map]].
