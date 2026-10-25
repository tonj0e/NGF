# Feature access: one list, role defaults, enforced on the server

Date: 2026-10-25. Owner: Tony (Admin). Status: waiting for owner review.

## Goal
The Admin holds every feature and hands them to the people of each branch (manager, assistant manager, accountant, agent, guarantor). A feature that is not given must be closed on the server, not only hidden in the menu. The Admin can give extra access to one person on top of the role.

## Today (found in the code, 2026-10-25)
1. `staff_access.permissions` only builds the Staff menu. API routes for Staff check only the role name (`requireRole(['Admin','Staff'])`) in: customers, deposits, deposits/request, disbursements, leads/[leadId], loans/close, profile, settlements, settlements/due, staff, agent/attendance, agent/location, agent/trips. Payments already checks its keys.
2. Permissions are saved per person. Branch roles (`BRANCH_ROLES.suggestedPermissions`) are only suggestions.
3. Agents have a fixed menu (`MENUS['NGF AGENT']`); guarantors use `gp:` keys; staff use another list (`STAFF_FEATURES`).
4. Admin-only pages (Financial Analytics, Import Customer, Payout Requests, Review Options, Deposits) cannot be given to anyone.
5. Big pages (Leads, Collection) are one feature each.

Live data now: 3 Staff rows, 2 Guarantor rows (all small), so a change is low risk.

## Design
### A. One registry: `lib/features.ts`
Each feature: `key`, `label`, `group`, `holders` (which roles may hold it: staff / agent / guarantor), `menu view`, and `adminOnlyDefault`. `STAFF_FEATURES` and `GUARANTOR_FEATURES` in `lib/config.ts` are generated from it, so there is a single list. Existing keys stay unchanged (customers, leads, collection, settlements, guarantors, reports, agentTracking, verificationPlanning, paymentLinks, payChat, payHistory, payMark, payBank, payOverride). New keys for Admin-only items so they can be handed out: financialAnalytics, importCustomer, payoutRequests, reviewOptions, deposits, disbursements (initially part of `leads`).

### B. Server check: `requireFeature(req, keys, opts)` in `lib/api.ts`
- Admin: always passes.
- Staff: passes when the effective permissions hold one of the keys; else 403 "You do not have access to this feature".
- Agent / Guarantor: keep today's row scoping; an agent/guarantor page that is switched off for them is also refused by the server (same call, with their own keys).
- Route to feature map (stage 1): customers -> customers; leads/[leadId], disbursements, loans/close -> leads; settlements, settlements/due -> settlements; deposits, deposits/request -> deposits; agent/location, agent/attendance GET, agent/trips GET -> agentTracking; profile (other user) and staff list -> any feature (read only, needed by many screens).
- Effective permissions are read from the DB on every request (like payments does today), so a change by the Admin applies at once.

### C. Role defaults + personal extras (stage 2)
- `settings` key `role_defaults` = { manager: [...], assistant_manager: [...], accountant: [...], cashier: [...], collection_agent: [...], agent: [...], guarantor: [...] }, edited by the Admin in one table (roles down the side, features across), in NGF Branches. Starting values = today's `suggestedPermissions`, so nothing changes until the Admin edits them.
- Effective permissions of a person = defaults of their branch role + their extra keys - their removed keys. `staff_access.permissions` keeps holding the extras; a key written as `-key` removes a default. The edit-person dialog shows each feature as Default / Extra / Removed.
- Several branch roles: union of the defaults.
- Agents and guarantors get the same dialog (agent menu becomes a list in the registry).

### D. Split big pages (stage 3, one feature at a time with the owner)
Leads -> view, add, verify, approve, disburse. Collection -> view, record payment, settle. Each split adds keys; old key keeps meaning "all parts" until the owner has chosen.

## Safety
- Stage 1 first, with a pre-check: for each live Staff row, list which of the protected routes they use and tick the matching keys so nobody is locked out by surprise; nothing else changes visually.
- Backup before any DDL; no schema change needed for stages 1-2 (reuse `settings` and `staff_access.permissions`).
- Tests: unit tests for the effective-permission function and `requireFeature` (Admin, Staff with key, Staff without key, agent, guarantor); a script that calls every protected route as the demo staff user with and without the key.

## Out of scope now
Security-audit leads deferred earlier; SMS provider; moving uploads to Drive.

## Docs to update after build
`docs/02 Roles and Screens/Roles and Permissions.md` (remove the "menu only" warning), `Screens Map.md`, daily log.
