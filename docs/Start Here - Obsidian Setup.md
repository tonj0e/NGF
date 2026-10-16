---
title: Start Here - Obsidian Setup
section: Home
status: current
last_verified: 2026-10-17
tags: [ngf, obsidian,setup]
---

# Start Here - Obsidian Setup
**How to open this folder in Obsidian and keep it useful.**

## Open it (Mac)
1. Open Obsidian, choose **Open folder as vault**.
2. Select the `docs` folder of the project: `iCloud Drive / projects / main / ngf-crm-main / docs`. Do **not** open the whole project folder (it holds about 44,000 dependency files that slow Obsidian down).
3. Open `00 BRAIN` first.

## Open it (iPhone / iPad)
1. Install Obsidian, then **Open folder as vault** and pick the same `docs` folder in the Files app under iCloud Drive. Wait for iCloud to finish downloading.
2. If iOS will not list the folder, copy `docs` into `iCloud Drive / Obsidian` once and work from there. That copy will then be separate from the project.

## Settings to switch on
- Core plugins: **Daily notes** (folder `10 Daily Log`, template `Templates/Daily Note`), **Templates** (folder `Templates`), **Backlinks**, **Graph view**.
- Community plugin: **Dataview** (it powers the live tables in [[Open Security Leads]]).
- Files and links: new notes go in the same folder as the current note.
- Mermaid diagrams already render with no plugin.

## Keep it healthy
- One topic per note, under ~120 lines. Link with `[[Note Title]]`.
- Never paste secrets. Names of environment variables are fine, values are not.
- Add `docs/.obsidian/` to `.gitignore` (already done) so personal settings are not shared.
- Claude reads this vault: `CLAUDE.md` tells it to read [[00 BRAIN]] first and to update the notes after changes.

## Templates
[[Bug Report]], [[Change Note]], [[Decision Record]], [[Daily Note]] (files in `Templates/`).
