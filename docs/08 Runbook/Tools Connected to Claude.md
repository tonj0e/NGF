---
title: Tools Connected to Claude
section: Runbook
status: current
last_verified: 2026-10-17
tags: [ngf, runbook,tools]
---

# Tools Connected to Claude
**What is installed for Claude on this project and how to restore it.**

| Tool | What it does | How it was added |
|---|---|---|
| Playwright MCP | Opens the app in a browser to test screens | `claude mcp add playwright -- /opt/homebrew/bin/playwright-mcp` (global install, version 0.0.83) |
| Supabase MCP (read-only) | Reads the live schema and data | `claude mcp add --transport http supabase "https://mcp.supabase.com/mcp?project_ref=<ref>&read_only=true"`, then sign in via `/mcp` |
| Security audit skill | Runs the source-only audit | Installed in `.agents/skills/security-audit` (linked from `.claude/skills`) |
| Supabase skills | Database guidance | Already in `.agents/skills` |
| Obsidian vault | This brain | Open `docs/` ([[Start Here - Obsidian Setup]]) |

## Rules
- New MCP servers only load in a **new or resumed** session.
- The Supabase MCP is read-only on purpose; database changes go through reviewed SQL or the app.

## Related
- [[Runbook Brain]]
