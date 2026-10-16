---
title: Git and GitHub
section: Runbook
status: current
last_verified: 2026-10-17
tags: [ngf, runbook, git]
---
# Git and GitHub
**Where the code lives on GitHub and how the local repo is set up.**

## Key facts
- Remote: `https://github.com/tonj0e/NGF.git`, branch `main`. First commit pushed 2026-10-17. Keep the repository **Private**: it holds the audit report, which lists unfixed weaknesses.
- The git data lives **outside iCloud** at `~/.git-repos/ngf-crm-main`; the file `.git` in the project folder just points to it. This stops iCloud from corrupting the repository.
- Not committed (see `.gitignore`): `.env*` files, `node_modules`, `.next`, `*.nosync`, the retired notes `BRAIN.md`, `log.md`, `DEPLOY.md` (they hold secrets), screenshots, `.opencode/`, `.playwright-mcp/`, `docs/.obsidian/`.

## Everyday use
| Do this | Command |
|---|---|
| See changes | `git status` |
| Save a checkpoint before a risky change | `git add -A && git commit -m "message"` |
| Send to GitHub | `git push` |
| Undo uncommitted edits in one file | `git restore path/to/file` |
| Start a feature branch | `git switch -c feature-name` |

## Rules and gotchas
- **Before every commit** run `git diff --cached | grep -E "eyJ|GOCSPX|1//0"`; it must print nothing. History is permanent once pushed.
- A commit is now the backup step required by the [[Security Fix Plan]].
- If the commit author email differs from your GitHub email, GitHub may not link commits to your profile.

## Related
- [[Runbook Brain]], [[Security Brain]]
