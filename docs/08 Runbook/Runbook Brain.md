---
title: Runbook Brain
section: Runbook
status: current
last_verified: 2026-10-17
tags: [ngf, runbook,brain]
---

# Runbook Brain
**How to run, restart, test and fix the app on the Mac mini.**

## Five things to remember
1. The dev server runs by itself under a macOS startup job (`com.ngf.crm-dev`). Do **not** also run `npm run dev` by hand: port 3000 is taken.
2. `node_modules` and `.next` live in `.nosync` folders so iCloud does not offload them. The path must keep `/node_modules/` in it, or the password library breaks. See [[iCloud and Dependencies]].
3. The first page load after a restart takes 1 to 2 minutes (compile). After that it is fast.
4. The LAN address changes if the router hands out a new IP. Update `allowedDevOrigins` in `next.config.ts` when it does.
5. After a power cut: the Mac mini restarts and logs in by itself and the server starts again. Claude sessions do not; resume them with the command in [[Run and Restart]].

## Notes
| Note | What it answers | Read when |
|---|---|---|
| [[Run and Restart]] | Start, stop, logs, URLs, resume Claude | Server is down or you changed config |
| [[iCloud and Dependencies]] | Why node_modules is a link; reinstall steps | Install fails, slow, or login errors |
| [[Test Accounts]] | Which test logins exist and where they are stored | Testing a role |
| [[Troubleshooting]] | Symptoms with causes and fixes | Something broke |
| [[Git and GitHub]] | Where the code is on GitHub, what is ignored, daily commands | Committing or pushing |
| [[Tools Connected to Claude]] | Playwright, Supabase, Obsidian, skills | Setting up a new machine |
| [[MCP Plan]] | The `ngf-crm` MCP server: what Claude can read and change, safeguards, setup | Connecting Claude to the CRM |
| [[SMS Setup]] | MSG91 / Twilio env variables, testing mailbox, costs | Choosing or changing the SMS provider |
| [[Integrations Admin Panel]] | Keys and API settings managed from the Dev page (encrypted), WhatsApp auto-send, migration 20261021300000 | Adding or changing any API key |
| [[Full Regression Report 2026-10-23]] | Full end-to-end test on dummy data: what passed, 14 bugs, leaks, cleanup list | Before the next release or when planning fixes |
| [[Bug Sweep 2026-10-21]] | Bugs found and fixed in the five-way review, plus open owner decisions | Before the next security or finance work |

## Related
- [[00 BRAIN]], [[Security Fix Plan]]
- Checks and CI: [[Checks and CI]]
