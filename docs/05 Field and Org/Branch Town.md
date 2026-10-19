---
title: Branch Town
section: Field and Org
status: current
last_verified: 2026-10-20
tags: [ngf, field-and-org, branches, 3d, cctv]
---
# Branch Town
**One line: an Admin-only 3D town (menu "Branch Town", key `town`): each NGF branch is the left section of the top floor of a 4-storey building on a Kerala-style road with an elevated deck, and you can walk the camera through its office.**

## Key facts
- Page `components/pages/BranchTownPage.tsx` (glass UI, panel, camera-view buttons). Scene in `components/town/`: `TownScene.tsx` (town, road, deck, traffic, sky, camera), `building.ts` (branch building + filler shops), `office.ts` (office interior + CCTV spots), `props.ts` (people, furniture, vehicles, palms), `kit.ts` (procedural textures and cached geometry/materials), `types.ts`. Three.js, loaded lazily with `ssr:false`. No downloaded assets.
- Admin only: `AppShell` renders it only for `Admin`; the page also refuses other roles. No new API: data = `GET /api/branches/org-hierarchy` plus `GET /api/agent/location?activeOnly=true` (who is live), refreshed every 30 s.
- World: buildings face a road. Layout from the building: footpath, service road, a 6-lane elevated deck on single central piers over a 4-lane ground road with a planted median (modelled on the Aroor–Thuravoor NH 66 stretch), far service road, far buildings. Traffic drives on the left, on the deck and below. Palms, street lights, sky shader with day/night.
- Branch building: ground floor = two lighting shops, 1st floor empty (TO LET), 2nd floor = NGF office (left) + empty (right), terrace on top. Office fascia sign shows the branch name (e.g. NGF HQ) plus an "NGF HQ" blade sign.
- Office interior (from the door): waiting sofas left and right with plants, cash counter (queue posts, vault door behind), glass section (accountants + assistant manager), manager's cabin on the right. People are placed from the CRM roles (manager, assistant_manager, accountant, cashier); empty roles show "vacant". Up to 4 accountants and 2 cashiers drawn.
- Branches are laid out by list order, HQ (name contains "HQ") first in the centre; near and far side of the road alternate; spare slots are filler shops.
- Agents and guarantors are NOT drawn (they are field staff). They are listed in the side panel; LIVE badge for agents who are tracking.

## Camera views = future CCTV
- Views: Outside, Overview, Waiting area, Cash counter, Glass section, Manager cabin, Top view (`OFFICE_VIEWS` in `types.ts`). Each has a dome-camera model in the office (red blinking LED); clicking a dome or a button flies the camera to that viewpoint.
- Feeds are NOT connected yet. Plan: each camera belongs to a branch + view key; browsers cannot play RTSP, so a small relay (for example go2rtc or MediaMTX) will convert to WebRTC/HLS; feeds stay behind admin login, never on public links.

## Rules and gotchas
- Town, traffic and the neighbouring shops are illustrative; only people at desks and the LIVE badge reflect CRM data.
- The scene rebuilds when staff, guarantors or branch names change (camera resets).
- Camera field of view widens inside the office; `controls.minDistance` drops to 0.3 there.
- Night adds moonlight, lit signs, street lamps and office lamps.
- `next.config.ts` caps build workers (`experimental.cpus: 4`) because Hostinger's build box runs out of threads.

## Not done yet
- Real CCTV feeds, real map positions per branch, customer houses from real customers, per-branch KPIs, cinematic fly-through, a more photoreal look (needs modelled assets).

## Related
- [[Branches and Staff]], [[Agent Attendance Location and Trips]], [[Field and Org Brain]]
