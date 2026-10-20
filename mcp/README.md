# NGF CRM MCP server

Lets Claude operate the CRM as an Admin, through the CRM's own `/api` routes (so permissions, rules and audit logs still apply). Zero dependencies: one file, `server.mjs`, MCP over stdio.

## Set up (2 minutes)
1. In the CRM, create a **dedicated Admin user for Claude** (not your own login).
2. `cp mcp/.env.example mcp/.env` and fill `NGF_MCP_USERNAME` / `NGF_MCP_PASSWORD`. Leave `NGF_API_URL=http://localhost:3000` to work on the local dev server; set `https://ngffincorp.com` only when you mean to change **live** data.
3. Start a new Claude Code session in this project. It finds `.mcp.json` and asks to approve the `ngf-crm` server; approve it.
4. Ask Claude: "call ngf_status". It should say `Admin`.

## Tools
| Tool | What it does |
|---|---|
| `ngf_status` | connection, logged-in role, writes on/off |
| `ngf_read` | named reads: dashboard, org, staff, leads, customers, loans, collections, settlements, payments, payouts, ... |
| `ngf_get` | GET any `/api` route |
| `ngf_write` | POST/PATCH/PUT/DELETE any `/api` route; needs a `reason`; marked destructive so Claude Code asks before each call |
| `ngf_list_routes` / `ngf_route_source` | what routes exist and exactly what each accepts |
| `ngf_search_docs` / `ngf_read_doc` | the `docs/` vault |

## Safety
- Blocked: `/api/dev/*`, `/api/setup*`, `/api/auth/*`. No impersonation, no direct database access.
- `NGF_MCP_READONLY=1` turns writes off.
- `mcp/audit.log` (gitignored) records every call: method, path, status, field names only.
- Keep `mcp/.env` out of git and out of chat. Rotate the password if it leaks.

## Test
`node mcp/selftest.mjs` (protocol + safety checks). Add credentials to also test login.
