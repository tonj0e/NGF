---
title: Install as an App (PWA)
section: Runbook
status: current
last_verified: 2026-10-26
tags: [ngf, pwa, mobile, install]
---
# Install as an App (PWA)
**One line: the site can be installed like an app on Android, iPhone/iPad, Windows, Mac and Linux; it always loads live data (nothing signed-in is stored on the device).**

## What people do
- **Android / Chrome / Edge (phone or laptop):** an "Install NGF FINCORP" card appears (also a download icon in the top bar). Tap **Install app**. It then opens full screen from the home screen or desktop.
- **iPhone / iPad:** the card shows the steps: Safari, **Share**, **Add to Home Screen**, **Add** (iOS has no install button for websites). The top-bar download icon opens the same steps.
- The card can be closed; it comes back after 7 days. It never shows inside the installed app.

## Files
- `app/manifest.ts`: name, colours, icons, `display: standalone`, `start_url: /`. Served at `/manifest.webmanifest`.
- `public/icons/*`: made by `node scripts/make-icons.mjs` from `public/ngflogo.png` (192, 512, maskable 512, Apple 180, favicon 32). Re-run it if the logo changes.
- `public/sw.js`: service worker. Caches only the app's own unchanging files (`/_next/static/`, `/icons/`, the logo, `/offline.html`). **Never caches `/api` or anything with an Authorization header.** Pages are network-first; when offline it shows `public/offline.html`.
- `lib/pwa.ts` (registers the worker, keeps the install prompt), `components/PwaClient.tsx` (the card), `components/InstallAppButton.tsx` (top-bar button), `app/layout.tsx` (icons, theme colour, Apple tags, `viewportFit: cover`; headers keep the header clear of the notch via `env(safe-area-inset-top)`).
- `next.config.ts` serves `/sw.js` with `Cache-Control: no-cache` so updates reach people. To force every device to drop old cached files, change `VERSION` in `public/sw.js`.

## Checked 2026-10-26 (Chrome, local)
Manifest with no errors, the only installability note was "in incognito" (test browser); worker active and controlling the page; offline shows the offline page; `/api` is never served from cache; iPhone card and desktop card render; no console errors.

## Limits
Push notifications are not set up. Offline use is limited to the offline page (data must be live). Agent location tracking still pauses if the phone locks or the app goes to the background (see Agent Tracking and Punch Out).
