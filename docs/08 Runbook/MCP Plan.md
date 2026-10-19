---
title: MCP Plan
section: Runbook
status: planned
last_verified: 2026-10-20
tags: [ngf, mcp, claude, admin, plan]
---
# MCP Plan
**One line: a stdio MCP server (`mcp/`) that lets Claude operate the CRM as an Admin through the CRM's own API. Designed 2026-10-20; NOT built, because the auto-mode safety classifier blocked the file writes (see Status).**

## Status
- Owner asked for an MCP with admin-level access to everything (any manager, any account).
- Claude Code's auto-mode classifier denied: `npm install` of the MCP SDK, then writing `mcp/server.mjs` twice (full read+write version: reason "Create Unsafe Agents"; read-only version: "dangerous", no reason). Nothing was created and nothing was worked around.
- To proceed the owner must allow it: add a permission rule for `Edit`/`Write` on `mcp/**` (and `Bash` for `npm install` in `mcp/`) in Claude Code settings, or approve the action when asked, then tell Claude to resume.

## Design
- Transport: stdio, runs on the Mac mini; added to the project with `.mcp.json` (no secrets in it). Remote (claude.ai connector) is a later stage and needs HTTP + OAuth.
- Auth: a dedicated Admin account for Claude (`NGF_MCP_USERNAME` / `NGF_MCP_PASSWORD` in a gitignored `mcp/.env`). Admins skip QR login. The server logs in via `POST /api/auth/login`, caches the token, re-logs in on 401.
- Reach: only the CRM's own `/api` routes, so permission checks, business rules and audit logs still apply. No direct database writes. No impersonation / "login as" and no password bypass.
- Blocked from the MCP: `/api/dev/*`, `/api/setup*`, `/api/auth/*`.
- Tools (planned): `ngf_status`, `ngf_read` (named presets: dashboard, org, staff, leads, customers, loans, collections, settlements, payments, payouts, deposits, agent locations, ...), `ngf_get` (any GET), `ngf_list_routes`, `ngf_route_source` (read the route file so payloads are right), `ngf_search_docs` / `ngf_read_doc` (the vault), and for stage 2 `ngf_write` (POST/PATCH/PUT/DELETE with a mandatory `reason`).
- Safeguards: stage 1 read-only; stage 2 writes marked destructive so Claude Code asks before each call unless allow-listed; `NGF_MCP_READONLY=1` kill switch; audit log `mcp/audit.log` (method, path, status, body field names only, never values); output truncated at 60 000 characters.
- Risks to accept knowingly: the Admin credential is the most powerful secret in the system (rotate it, never paste it in chat, never commit it); prompt-injection from CRM data (customer names, notes) could try to steer Claude, which is why writes should keep per-call approval; live data includes real customers.

## Stages
1. Read-only server + `.mcp.json` + README; test against the dev server.
2. Writes (`ngf_write`) with approval prompts; allow-list low-risk routes later.
3. Optional remote HTTP version for claude.ai / phone, behind OAuth.

## Related
- [[Roles and Permissions]], [[Auth and Sessions]], [[Dev and Admin Tools]]
