---
title: Lead 02 Secrets in BRAIN.md and log.md
section: Security
status: open
last_verified: 2026-10-17
priority: 2
area: Secrets
fix_step: fix-2
fingerprint: secrets-committed-in-brain-and-log-docs
tags: [ngf, security, lead, secrets]
---
# Lead 02 Secrets in BRAIN.md and log.md
**Anyone who can read project files to full database and Drive access. Status: open, not yet fixed. Needs validation (nothing was run).**

## What the source shows
BRAIN.md and log.md in the repo root are not covered by .gitignore. They embed what appear to be real credentials: a Supabase service-role JWT, the Google OAuth client secret, a Google refresh token, the SETUP_SECRET value and the admin username and password. The app uses the service-role key for all data access, which bypasses RLS. Anyone who can read these files (repo collaborators, a leaked or forked repo, backups, iCloud sharing) could gain full access to customer data and money tables. They could also use the OAuth secret and refresh token for Drive access and the setup secret or admin password to take over the app. Secret values are deliberately not reproduced.

## Source trace
1. `BRAIN.md:115`: SUPABASE_SERVICE_ROLE_KEY is documented with a full JWT-shaped value (Supabase service_role key). Further copies are at BRAIN.md:16-17 and log.md:409.
2. `BRAIN.md:122`: GOOGLE_OAUTH_CLIENT_SECRET holds a GOCSPX-prefixed value at line 122 and GOOGLE_OAUTH_REFRESH_TOKEN a refresh token at line 123. Admin username and password appear at lines 102-103.
3. `log.md:39`: States the literal SETUP_SECRET value used by /api/setup.
4. `.gitignore:34`: Only *.pem (line 25) and .env* (line 34) are ignored. BRAIN.md and log.md are not ignored and travel with any VCS push, archive or sync.

## Why it is not confirmed
- No OS-enforced sandbox with memory limits on this host; target code was not executed.
- Cannot establish from source who can read this directory or whether it was ever pushed, shared or synced. The directory is not a git repository, so VCS history cannot be checked.
- Cannot tell whether the keys, OAuth secret and refresh token, SETUP_SECRET and admin password are still valid or have been rotated. Checking would require contacting live services, which is out of scope.

## How to check it (safe, dummy data)
Run a read-only secret scan (for example grep for the eyJ JWT prefix and GOCSPX- over the tree and any VCS history or published copies). Confirm BRAIN.md and log.md are absent from deploy bundles, published repos and shared iCloud folders.

## Owner check
Owner should check whether the repo or these files were ever pushed or shared. Rotate the Supabase service-role key, the Google OAuth client secret and refresh token, SETUP_SECRET and the admin password. Then remove the values from the docs, purge history if any, and add the docs to .gitignore.

## Related
- [[Open Security Leads]], [[Security Fix Plan]] (step 2), [[Security Brain]]
