---
title: iCloud and Dependencies
section: Runbook
status: current
last_verified: 2026-10-17
tags: [ngf, runbook,icloud]
---

# iCloud and Dependencies
**The project sits in iCloud Drive, which can offload files. This is how `node_modules` and `.next` are protected.**

## Key facts
- `node_modules` is a link to `node_modules.nosync/node_modules`; `.next` is a link to `.next.nosync`. Folders ending in `.nosync` are ignored by iCloud. Both are in `.gitignore` (`*.nosync`).
- The extra `node_modules` level inside `node_modules.nosync` is required: Next.js decides which packages are "external" by looking for `/node_modules/` in the real path. Without it, the native password library (`bcrypt`) is bundled and every login fails with "Network error".
- `package.json` allows `bcrypt` to run its install script (`allowScripts`). Without it `npm ci` skips building it.

## Reinstall steps
1. Stop the dev server job ([[Run and Restart]]).
2. Remove the link and old folder, then `npm ci`.
3. Move the new `node_modules` to `node_modules.nosync/node_modules` and relink: `ln -s node_modules.nosync/node_modules node_modules`.
4. Start the job again and test a login.

## Related
- [[Runbook Brain]], [[Troubleshooting]]
