---
title: Branch Town
section: Field and Org
status: current
last_verified: 2026-10-19
tags: [ngf, field-and-org, branches, 3d]
---
# Branch Town
**One line: an Admin-only 3D town (menu "Branch Town", key `town`) that shows every branch office, its cabins and the field team.**

## Key facts
- Page `components/pages/BranchTownPage.tsx`, scene `components/town/TownScene.tsx` (Three.js, loaded lazily with `ssr:false`). Menu entry only in the Admin menu; `AppShell` renders it only for `Admin`, and the page itself refuses other roles.
- No new API. Data = `GET /api/branches/org-hierarchy` (people per branch) plus `GET /api/agent/location?activeOnly=true` (which agents are live), refreshed every 30 s.
- One office per branch on a grid. Click an office (or the list): the roof lifts off and the camera eases in. Cabins: assistant manager, manager, accountant (back row), cashier counter (front). Empty roles show "vacant".
- Out in the town: collection agents ride scooters between the office and customer houses; guarantors walk near houses (field work, collecting new customers). A green LIVE ring means that agent is tracking now.
- Colours follow the NGF palette (black, white, green, blue) with glass cards. Day/night toggle, orbit/zoom, hover labels.

## Rules and gotchas
- Movement is illustrative, not GPS. Only the LIVE ring and the staff/guarantor lists are real data.
- A branch has no stored map position; offices are laid out by list order.
- Up to 3 people per cabin and 12 guarantors per branch are drawn.
- The scene rebuilds when staff, guarantors or live agents change (camera resets).
- Admin only by owner's decision.

## Not done yet
- Real agent positions on the town map, customer houses from real customers, KPIs per branch, cinematic fly-through, pulses on loan approvals/payments.

## Related
- [[Branches and Staff]], [[Agent Attendance Location and Trips]], [[Field and Org Brain]]
