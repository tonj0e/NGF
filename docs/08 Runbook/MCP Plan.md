---
title: MCP Plan
section: Runbook
status: current
last_verified: 2026-10-20
tags: [ngf, mcp, claude, admin, plan]
---
# MCP Plan
**One line: a stdio MCP server (`mcp/server.mjs`, no dependencies) that lets Claude operate the CRM as an Admin through the CRM's own API. Built 2026-10-20 (reads + approval-gated writes).**

## Status
- Built after the owner added `Write(mcp/**)` and `Edit(mcp/**)` to `.claude/settings.local.json` (the auto-mode classifier had blocked the first attempts). Files: `mcp/server.mjs`, `mcp/selftest.mjs`, `mcp/README.md`, `mcp/.env.example`, `.mcp.json`. `/mcp/.env` and `/mcp/audit.log` are gitignored; `mcp/**` is eslint-ignored.
- Tested: protocol and safety checks (`node mcp/selftest.mjs`, all pass); live login + reads + refused writes against the dev server with the demo agent account (CRM returned 403 for admin-only routes, audit log written). NOT yet tested with a real Admin account: do that first (`ngf_status` must say Admin).
- Owner TODO: create a dedicated Admin user for Claude, put it in `mcp/.env`, restart Claude Code and approve the `ngf-crm` server.

## Design
- Transport: stdio, runs on the Mac mini; added to the project with `.mcp.json` (no secrets in it). Remote (claude.ai connector) is a later stage and needs HTTP + OAuth.
- Auth: a dedicated Admin account for Claude (`NGF_MCP_USERNAME` / `NGF_MCP_PASSWORD` in a gitignored `mcp/.env`). Admins skip QR login. The server logs in via `POST /api/auth/login`, caches the token, re-logs in on 401.
- Reach: only the CRM's own `/api` routes, so permission checks, business rules and audit logs still apply. No direct database writes. No impersonation / "login as" and no password bypass.
- Blocked from the MCP: `/api/dev/*`, `/api/setup*`, `/api/auth/*`.
- Tools (planned): `ngf_status`, `ngf_read` (named presets: dashboard, org, staff, leads, customers, loans, collections, settlements, payments, payouts, deposits, agent locations, ...), `ngf_get` (any GET), `ngf_list_routes`, `ngf_route_source` (read the route file so payloads are right), `ngf_search_docs` / `ngf_read_doc` (the vault), and for stage 2 `ngf_write` (POST/PATCH/PUT/DELETE with a mandatory `reason`).
- Safeguards: stage 1 read-only; stage 2 writes marked destructive so Claude Code asks before each call unless allow-listed; `NGF_MCP_READONLY=1` kill switch; audit log `mcp/audit.log` (method, path, status, body field names only, never values); output truncated at 60 000 characters.
- Risks to accept knowingly: the Admin credential is the most powerful secret in the system (rotate it, never paste it in chat, never commit it); prompt-injection from CRM data (customer names, notes) could try to steer Claude, which is why writes should keep per-call approval; live data includes real customers.

## Stages
1. DONE: server, `.mcp.json`, README, self-test, tested on the dev server.
2. DONE in the same server: `ngf_write` (reason required, destructive hint so Claude Code asks each time). Next: allow-list low-risk routes once trusted.
3. Optional remote HTTP version for claude.ai / phone, behind OAuth.

## Related
- [[Roles and Permissions]], [[Auth and Sessions]], [[Dev and Admin Tools]]
