---
title: Mobile and Responsive Notes
section: Roles and Screens
status: current
last_verified: 2026-10-17
tags: [ngf, roles-screens, mobile, responsive, charts]
---
# Mobile and Responsive Notes
**One line: how the shell switches between phone drawer and desktop sidebar, how dashboard cards stack, and how the recollection gauge picks its colours.**

## Key facts
- One breakpoint decides the shell: Tailwind `lg` = 1024 px.
- Phones and tablets below 1024 px get the mobile header and drawer. Tablets do not get the sidebar.
- Page area is `flex-1 overflow-y-auto px-4 py-4 sm:px-6 lg:px-8 pb-8 md:pb-4 lg:pb-0` (`AppShell.tsx:545`).

## How it works
**Mobile (below `lg`)**
- Sticky top bar `lg:hidden` with a menu button, "NGF FINCORP", role label, bell and avatar menu (`:331-436`).
- The menu button opens a left `Sheet` (`w-[80vw] max-w-[320px]`, `lg:hidden`). Picking an item calls `setView` and closes it (`:205-257`).
- Drawer footer: avatar, username, red Logout button.

**Desktop (`lg` and up)**
- `aside` is `hidden lg:flex`, `w-14` collapsed (icons only, `title` tooltips) and `w-64` expanded (`:261-326`).
- Hover expands after 50 ms and collapses after 150 ms (debounce, `:140-149`). The pin button stops auto-collapse.
- Header shows icon + page title, bell and a user menu with the name (`:439-544`).

**Dashboard cards on phones** (`components/pages/Dashboard.tsx`)
- Top metric cards: `grid-cols-2 lg:grid-cols-4 xl:grid-cols-5` (`:434`). So a phone shows 2 cards per row, a laptop 4, a wide screen 5. The loading skeleton uses the same classes (`:230`).
- Chart grid: single column until `lg`, then 12-column grid with the trend chart `lg:col-span-7` (`:438-446`). Lower sections use `sm:grid-cols-2` or `lg:grid-cols-2`.
- Cards use `min-w-0` so charts do not push the page wider than the screen.

## Recollection gauge
File `components/charts/RecollectionGauge.tsx`, used once in `Dashboard.tsx:492`. Props: `value` (percent 0-100), `collected`, `pending`. The Dashboard feeds `recollectionRate`, `collectedCount`, `pendingCount` from `/api/dashboard`. Those last two are counts of repayments, shown with Indian digit grouping and no currency sign.

| Value band | Arc colour | Text colour and message |
|---|---|---|
| 0 to under 30 | red `#ef4444` | red, "Recovery needs attention" |
| 30 to under 70 | orange `#f59e0b` | amber, "Fair, some dues pending" |
| 70 to 100 | green `#22c55e` | green, "Good recovery"; 90 and above "Excellent recovery" |

- Three arcs are drawn on a half circle (SVG `viewBox 0 0 200 164`, radius 78, stroke 14, 1.2 degree gaps) covering 0-30, 30-70 and 70-100 (`:30-44`).
- Boundaries: exactly 30 is orange, exactly 70 is green (`:22-23`).
- The needle is a dark polygon on a white hub. Target angle is `(value - 50) * 1.8` degrees from straight up. It starts at -90 (the 0 end) and swings with a framer-motion spring after 0.3 s (`:45-55`).
- Value is clamped to 0-100. The number under the hub uses the status colour.
- SVG scales with `w-full max-w-[270px]`, so it fits narrow phones. Below it a 2-column box shows Collected (green) and Pending (red).

## Rules and gotchas
- Changing a threshold means editing both the `BANDS` array and the `isGreen`/`isOrange` tests; they are separate (`:22-23,40-44`).
- Colours are hard-coded hex; dark mode (`ngf-dark`) does not recolour the SVG.
- Mobile header has no page title, so deep screens rely on the page's own heading.
- Reduced-motion is provided by `ReducedMotionProvider`, but the gauge spring runs regardless.

## Related
- [[Roles and Screens Brain]], [[Screens Map]], [[Request Flow]], [[Repayments and Collections]]
