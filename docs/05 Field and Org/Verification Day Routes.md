---
title: Verification Day Routes
section: Field and Org
status: current
last_verified: 2026-10-19
tags: [ngf, field, agents, leads, routes, maps]
---
# Verification Day Routes
**Branch staff phone each new lead, fix a visit location and day, and the system orders each agent's day by road distance. Staff can re-order by dragging. The agent follows a numbered list with Navigate and Call buttons.**

Problem it solves: agents were sent to ten verifications in the wrong order (Eramalloor, Chalakudy, Thiruvur ... all mixed up) and lost time on the road.

## Flow
1. A guarantor submits a lead. The **guarantor's branch team** is notified ("New lead to call"): branch manager, **assistant branch manager**, accountant (from `branch_staff_roles`) plus anyone given the `verificationPlanning` permission in that branch. Admin is notified as before.
2. In **Visit Routes** (menu for Admin and for staff with `verificationPlanning`) the lead appears under *To plan* with Call and WhatsApp buttons.
3. After the call staff fix: the **customer's location** (paste a Google Maps link, short `maps.app.goo.gl` links are followed, or `lat,lng`; the guarantor's pin can be reused), place name, visit date, optional **time window** (Morning / Afternoon / Evening), a note for the agent and the call result.
4. Choose an **agent** and press Assign. The lead joins that agent's day and the day is re-ordered. The agent is notified.
5. **Agent routes** tab: each agent's stops in order with km and minutes from the previous stop and day totals. Controls: drag handle or up/down arrows, *Best order*, *Must be first / last* pins, *Move to agent*, *Remove*, and a *Map* link that opens the whole route in Google Maps.
6. The agent opens **My Route**: Navigate (Google Maps to the stop), Call, *I have reached*, *Not at home* (tells the branch team to reschedule), *Re-plan from where I am now* (re-orders the remaining stops from live GPS). *Start verification* leads to the existing Assigned Verifications form.

## Route sketch on My Route (2026-10-18)
A dark "Today at a glance" card at the top of the agent's **My Route** page (`components/routes/RouteSketch.tsx`). It is a schematic, not a map, and it reads **from the bottom up**: **START** (home icon, where attendance was marked) at the bottom, then stop 1, 2, 3 ... climbing in visiting order, zig-zagging so every name stays readable. Each leg is a curved arrow with a chip showing the km and a small compass arrow (direction of travel, north up). Colours: white = to visit, amber with a pulsing ring and "NEXT STOP" = next, green with a tick and a glow = done, red with "!" = customer not at home. A progress bar and "N of M done" sit at the top. The next leg's dashes flow forward (switched off when the phone asks for reduced motion). Tapping a stop scrolls to its card. Stops without a saved location are left out of the picture but stay in the list. No new API: it uses the same `mine` data.

## Ordering rules (`lib/routeMath.ts`)
- Start point = where the agent **marked attendance** (usually home). Before attendance it is the last attendance, else last live location. When the agent marks attendance, today's route is re-ordered from that point unless staff ordered it by hand.
- Order = nearest-stop-first, then 2-opt and move-one improvements, minimising total travel minutes.
- Time windows use an estimated clock (day starts 9:00, 30 minutes per visit; Morning 9-12, Afternoon 12-16, Evening 16-19); being outside a stop's window costs 3x the minutes it is off. Switch windows off in Dev.
- A day staff ordered by hand keeps its order; a newly assigned stop goes to the end. *Best order* clears the hand-ordered flag.
- Finished or absent stops stay at the front; only the remaining stops are re-ordered.
- At most 24 stops per agent per day (Google matrix limit).

## Distances
Road distances come from the **Google Routes API** (`computeRouteMatrix`, server key `GOOGLE_MAPS_SERVER_KEY`, falling back to `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`). Results are cached per pair of places in `route_dist_cache`, so re-ordering does not call Google again. If Google is not available the app uses a straight-line estimate (x1.4 road factor, 28 km/h) and says "Estimate" on the route card. **The Routes API must be enabled in the Google Cloud project.** It was off on 2026-10-19; the owner then made a new project with a key restricted to Routes API only and a live test returned real road distances (Ernakulam to Chalakudy about 39 km). The key lives in `.env.local` and must also be added to Hostinger's environment as `GOOGLE_MAPS_SERVER_KEY`. To allow another Google API later, edit the key's API restrictions in Google Cloud (Credentials).

## Data (migration `migrations/2026-10-19-verification-routes.sql`, applied)
- `leads`: `visit_lat`, `visit_lng`, `visit_place`, `visit_date`, `visit_window`, `visit_note`, `call_outcome`, `visit_status`, `route_seq`, `route_pin`, `leg_km`, `leg_min`.
- `route_plans` (agent, date: start point, totals, source, `manual`), `route_dist_cache`. RLS on, no policies: server only.
- Route = leads with `assigned_agent_id` + `visit_date`, ordered by `route_seq`.

## Access and switches
- `verificationPlanning` in `STAFF_FEATURES` (view `routes`). A planner with a branch sees and edits only that branch's leads and agents; Admin sees all; agents see only their own route. Enforced in `lib/routes.ts`, never in the browser.
- Dev page card **Verification routes**: *Route planning on* (`route:enabled`) and *Visit time windows* (`route:windows`), stored in `settings`.
- New branch role **Assistant Branch Manager** (`assistant_manager`) in `APP_CONFIG.BRANCH_ROLES`, branch cards and role lists.
- Leads page (Admin/Staff) shows each lead's **branch** and has a branch filter.
- Audit actions: `VISIT_PLANNED`, `VISIT_ASSIGNED`, `ROUTE_OPTIMIZED`, `ROUTE_REORDERED`, `ROUTE_PINNED`, `VISIT_UNPLANNED`, `ROUTE_REPLANNED`.

## Code
`lib/routeMath.ts` (link parsing, Google matrix, ordering), `lib/routes.ts` (access, board, actions, agent side), `app/api/routes/route.ts`, `components/pages/VisitRoutesPage.tsx`, `components/pages/MyRoutePage.tsx`, hook in `app/api/agent/attendance/route.ts`, alert in `app/api/leads/route.ts`.

## Tested (2026-10-19)
35 end-to-end checks against the live DB with temporary data (deleted): permissions, other-branch isolation, link parsing, ordering, windows, attendance start point, hand order kept, pins, agent actions, absent alert, Dev switches, new-lead alert. Phone-width screens and drag checked in Playwright.

## Related
[[Field and Org Brain]], [[Agent Attendance Location and Trips]], [[Branches and Staff]], [[Lead to Loan]], [[Verification and Documents]], [[Dev and Admin Tools]], [[Notifications]]
