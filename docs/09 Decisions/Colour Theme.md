# Colour Theme

Calm and serious: deep navy with a gold accent. Decided 2026-10-27 by the owner.

- All brand colours live in one place: `app/globals.css` (`:root` variables `--ink`, `--soft`, `--line`, `--mist`, `--gold`, `--gold-soft`, exposed to Tailwind as `text-ink`, `bg-mist`, `border-line`, `text-soft`, `text-gold`).
- Components must use these names, never hex codes. About 1,400 old `[#1a1a2e]`-style codes were swapped for the names.
- Tailwind `gray` now maps to the cooler `slate`, and `green` to `emerald` (set in `@theme` in `globals.css`), so status colours changed app-wide without editing pages.
- Sidebar active item has a thin gold bar (`AppShell.tsx`). Phone browser bar and app start-up colour: `app/layout.tsx` `themeColor`, `app/manifest.ts`.
- Not yet done: a proper dark palette (dark mode is still the invert trick in `globals.css`), PDF/receipt colours and inline-style hex codes in a few charts, app icon background (`scripts/make-icons.mjs`).
