# Key Safety Check 2026-10-27

Run from the "Key Safety Checklist" PDF the owner shared. No key values were printed.

| Check | Result |
|---|---|
| `.env` files tracked by git | none (only `.env.example` files with names) |
| `.env*` ignored | yes (`.gitignore` line 34; `/mcp/.env` line 75) |
| Key-shaped strings in code and in all git history | none |
| Secrets in the live site's browser JS (10 files scanned) | none (one false hit: Tailwind `mask-...` class names) |
| `NEXT_PUBLIC_` names | only APP_URL, SUPABASE_URL, Google Maps browser keys, Sentry DSN: all public by design |
| Browser code calling provider APIs directly | none; all go through our routes |
| Sentry key | not saved yet (`/api/monitor-config` returns no DSN) |

**Open:**
- The GitHub repo `tonj0e/NGF` is **public**. Source and the security lead notes (`docs/07 Security`, `SECURITY-AUDIT.md`, 24 open leads) are readable by anyone. Recommended: make it private (check Hostinger auto-deploy still works afterwards).
- Spending limits/alerts: Google Cloud budget, MSG91 wallet, Resend: owner to set.
- Google Maps browser key must stay restricted by website and by API.
- Test passwords shared in chat: change them.
