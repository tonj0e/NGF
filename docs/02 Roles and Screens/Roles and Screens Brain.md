---
title: Roles and Screens Brain
section: Roles and Screens
status: current
last_verified: 2026-10-17
tags: [ngf, roles-screens, brain]
---
# Roles and Screens Brain
**One-page map of who can do what and which screens exist in the single-page app.**

Purpose: show the 4 roles, what the server really enforces versus what the menu merely hides, and how `AppShell` lays out screens on desktop and phone.
Sibling map: [[Architecture Brain]]. Vault root: [[00 BRAIN]].

## Five things to remember
1. Roles are `Admin`, `Guarantor`, `NGF AGENT`, `Staff` (`lib/config.ts:13`). The role is stored in the JWT. See [[Roles and Permissions]].
2. Server checks are by role only. Staff `permissions` (from `staff_access`) and branch roles (manager, accountant, cashier, collection_agent) are NOT checked by any API route. They only shape the Staff menu.
3. Staff can call every `Admin, Staff` route, so a Staff user with few menu items can still reach customers, settlements, deposits, agent GPS data by calling the API directly.
4. 11 views in the `AppShell` switch are in no menu (orphans), and the two bell dropdowns show fake sample notifications. See [[Screens Map]].
5. Breakpoint is Tailwind `lg` (1024 px): below it a Sheet drawer and a sticky top bar, above it a collapsible sidebar. See [[Mobile and Responsive Notes]].

## Notes in this section
| Note | What it answers | Read when |
|---|---|---|
| [[Roles and Permissions]] | Role powers, Staff permissions, per-route role table, enforced vs hidden | Changing access or reviewing security |
| [[Screens Map]] | Every view key, its component, who sees it, orphans, layout sketch | Adding or finding a screen |
| [[Mobile and Responsive Notes]] | Drawer vs sidebar, dashboard 2-column cards, recollection gauge bands | Fixing phone layout or the gauge |

## Known issues
- Staff permission list is not enforced server-side ([[Roles and Permissions]]). Tracked in [[Open Security Leads]].
- `POST /api/repayments` accepts any logged-in role ([[Roles and Permissions]]).
- `GET /api/review-options` has no auth check.
- Role in a token is not re-read from the DB ([[Auth and Sessions]]).
- Fake notification dropdown in `components/AppShell.tsx:348-389,455-496`.
- Details of staff and branch rules: [[Branches and Staff]].

## Update this section when ...
- `MENUS` or the `renderPage` switch in `components/AppShell.tsx` changes.
- `APP_CONFIG.STAFF_FEATURES` or `BRANCH_ROLES` changes (`lib/config.ts`).
- A route adds or drops a `requireRole` / role check.
- `components/charts/RecollectionGauge.tsx` thresholds or the Dashboard grid change.
- Related: [[Security Brain]], [[Screens Map]], [[Tables]].
