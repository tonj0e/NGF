---
title: Run and Restart
section: Runbook
status: current
last_verified: 2026-10-17
tags: [ngf, runbook]
---

# Run and Restart
**Commands to check, stop, start and read logs for the dev server.**

## Key facts
- App: `http://localhost:3000` on the Mac mini; from other devices `http://<mac-mini-ip>:3000` (was `192.168.1.10`) or `http://Tonys-Mac-mini.local:3000`.
- The server is started by the startup job file `~/Library/LaunchAgents/com.ngf.crm-dev.plist` and restarts itself if it crashes.
- Log file: `~/Library/Logs/ngf-crm-dev.log`.

## Commands
| Do this | Command |
|---|---|
| See if it is running | `launchctl print gui/$(id -u)/com.ngf.crm-dev \| grep state` |
| Restart | `launchctl kickstart -k gui/$(id -u)/com.ngf.crm-dev` |
| Stop | `launchctl bootout gui/$(id -u)/com.ngf.crm-dev` |
| Start again | `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.ngf.crm-dev.plist` |
| Watch the log | `tail -f ~/Library/Logs/ngf-crm-dev.log` |
| Type check | `npx tsc --noEmit` (from the project folder) |
| Resume the Claude chat | `claude --resume <session-id>` in the project folder |

## Rules and gotchas
- After changing `next.config.ts` (for example `allowedDevOrigins`), **restart** the job.
- A changed LAN IP gives a stuck white page on phones until `allowedDevOrigins` includes the new IP.
- Mac settings that make this work: auto-start after power failure, no sleep, automatic login.

## Related
- [[Runbook Brain]], [[iCloud and Dependencies]], [[Troubleshooting]]
