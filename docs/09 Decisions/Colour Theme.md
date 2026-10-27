# Colour Theme

Calm and serious: deep navy with a gold accent. Decided 2026-10-27 by the owner.

- All brand colours live in one place: `app/globals.css` (`:root` variables `--ink`, `--soft`, `--line`, `--mist`, `--gold`, `--gold-soft`, exposed to Tailwind as `text-ink`, `bg-mist`, `border-line`, `text-soft`, `text-gold`).
- Components must use these names, never hex codes. About 1,400 old `[#1a1a2e]`-style codes were swapped for the names.
- Tailwind `gray` now maps to the cooler `slate`, and `green` to `emerald` (set in `@theme` in `globals.css`), so status colours changed app-wide without editing pages.
- Sidebar active item has a thin gold bar (`AppShell.tsx`). Phone browser bar and app start-up colour: `app/layout.tsx` `themeColor`, `app/manifest.ts`.
- Dark mode (Dev toggle, class `ngf-dark` on `<html>`) is now a real palette in `globals.css`: the same names get dark values, grey and status scales are reversed, `bg-white` becomes deep navy, `bg-ink` buttons stay blue-navy with white text. No more invert filter, so photos and maps keep true colours. `app/layout.tsx` applies the saved mode before first paint (login page too).
- Remaining typed colours: a few `[#hex]` in gradients, inline-style hex in charts, PDF/receipt colours, app icon background (`scripts/make-icons.mjs`).
