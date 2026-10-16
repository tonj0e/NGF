---
title: Decisions Brain
section: Decisions
status: current
last_verified: 2026-10-17
tags: [ngf, decisions,brain]
---

# Decisions Brain
**Why the project is set up the way it is. New decisions go in [[Decision Log]] using the [[Decision Record]] template.**

## Five things to remember
1. Everything runs through server routes with one database key; roles are enforced in code only ([[Data Access Layer]]).
2. The project folder stays in iCloud, but dependencies and build output are moved out of sync ([[iCloud and Dependencies]]).
3. Security fixes are deferred until the build is complete ([[Security Fix Plan]]).
4. The vault is written fresh from code, not copied from the old notes.
5. Money amounts are fixed by the product in code, not typed by users ([[Loan Products and Math]]).

## Related
- [[00 BRAIN]], [[Decision Log]]
