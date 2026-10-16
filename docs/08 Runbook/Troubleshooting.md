---
title: Troubleshooting
section: Runbook
status: current
last_verified: 2026-10-17
tags: [ngf, runbook,troubleshooting]
---

# Troubleshooting
**Symptoms we have actually hit, with the cause and the fix.**

| Symptom | Cause | Fix |
|---|---|---|
| Login says "Network error" and the log shows "No native build was found" | `bcrypt` got bundled because `node_modules` path lost `/node_modules/` | Restore the layout in [[iCloud and Dependencies]] |
| Page on phone is white and stuck | LAN IP not in `allowedDevOrigins` | Add the IP in `next.config.ts`, restart the job |
| First page takes 1 to 2 minutes | One-time compile | Wait; later loads take milliseconds |
| `npm run dev` says port busy | The startup job already runs the server | Do not start it by hand ([[Run and Restart]]) |
| Dev server very slow, files hang | iCloud offloaded `node_modules` | Use the `.nosync` layout |
| Collection "Save" did nothing | Payment mode names did not match the database (fixed 2026-10-17; "Not Paid" is stored as Pending) | See [[Repayments and Collections]] |
| Guarantor missing from a branch | Branch link row inactive or missing | Check `guarantor_branches.is_active` ([[Branches and Staff]]) |
| Failed login not in the audit log | Audit insert uses role `unknown`, rejected by the enum | Known issue: see [[Live vs Repo Drift]] |
| Renewal for the same customer fails | `loans.customer_id` is unique | Known issue: [[Renewals]] |
| MCP tools missing in Claude | Servers are loaded at session start | `/exit` then `claude --resume <id>` |

## Related
- [[Runbook Brain]]
