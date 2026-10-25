# Feature Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every feature is one named key, checked on the server, with role defaults the Admin edits and per-person extras/removals.

**Architecture:** A pure module `lib/features.ts` holds the registry and `effectivePermissions()`. `lib/access.ts` loads a user's effective permissions from the DB and exposes `requireFeature()`. Routes swap `requireRole([...'Staff'])` for `requireFeature`. Role defaults live in `settings` key `role_defaults`; personal extras stay in `staff_access.permissions` (`-key` = removed default).

**Tech Stack:** Next.js 16 route handlers, Supabase (`readTable`), no test runner for units (use `node --experimental-strip-types` scripts in `tests/unit/`), Playwright e2e exists.

**Spec:** `docs/superpowers/specs/2026-10-25-feature-access-design.md`

## Global Constraints
- Admin always passes every check. Existing permission keys keep their names.
- Never write secrets in code/notes. Live DB shared with local: no destructive data changes; DDL only with owner approval (none planned).
- Update `docs/02 Roles and Screens/Roles and Permissions.md`, `Screens Map.md` and `docs/10 Daily Log/2026-10-25.md` after behaviour changes.
- Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_016bcxF4Pr8vSXox69q1kjYf`.
- Do not run `npm run build` while the dev server runs; use `npm run typecheck`.

## Review Focus
- Staff with no `staff_access` row: refused (403), not a crash.
- Permission stored as comma string or array: both read correctly (`permsOf`).
- Person holds two branch roles: defaults are the union.
- `-key` removes a default but a plain `key` extra always wins over nothing; both `key` and `-key` present: removal wins.
- Unknown keys in defaults/extras are ignored, never grant access.

---

### Task 1: Registry and effective permissions (pure)

**Files:**
- Create: `lib/features.ts`, `tests/unit/features.test.ts`

**Interfaces:**
- Produces: `FEATURES: {key,label,group,holders:('staff'|'agent'|'guarantor')[],view:string}[]` (all current STAFF/GUARANTOR keys plus new `financialAnalytics, importCustomer, payoutRequests, reviewOptions, deposits`); `DEFAULT_ROLE_PERMISSIONS: Record<string,string[]>` (from `BRANCH_ROLES.suggestedPermissions`, plus `agent`, `guarantor`); `effectivePermissions(roles: string[], extras: string[], defaults = DEFAULT_ROLE_PERMISSIONS): string[]`; `permsOf(raw: unknown): string[]`.

- [ ] **Step 1: Write failing test** in `tests/unit/features.test.ts` using `node:assert`: (a) roles `['accountant']`, extras `[]` -> equals accountant defaults; (b) extras `['payChat']` adds it; (c) extras `['-reports']` removes `reports`; (d) `['reports','-reports']` -> removed; (e) roles `['manager','accountant']` -> union; (f) extras `['nonsense']` ignored; (g) `permsOf('a, b')` -> `['a','b']`, `permsOf(['a'])` -> `['a']`, `permsOf(null)` -> `[]`.
- [ ] **Step 2:** Run `node --experimental-strip-types tests/unit/features.test.ts`; expected FAIL (module missing).
- [ ] **Step 3:** Implement `lib/features.ts` (no imports from app code except `APP_CONFIG.BRANCH_ROLES` values copied as defaults).
- [ ] **Step 4:** Run the test; expected prints `ok`.
- [ ] **Step 5:** Commit `feat: feature registry and effective permissions`.

### Task 2: Server access loader and `requireFeature`

**Files:**
- Create: `lib/access.ts`
- Modify: `lib/api.ts` (re-export nothing; keep `requireRole`)

**Interfaces:**
- Consumes: Task 1; `readTable('StaffAccess'|'BranchStaffRoles'|'Settings')`, `getSession`.
- Produces: `loadPermissions(session: Session): Promise<string[]>` (Admin -> all feature keys; others -> `effectivePermissions(branchRoles, extras, defaultsFromSettings)`; guarantor/agent role names `guarantor`/`agent` used as their role); `requireFeature(req: NextRequest, keys: string[], roles = ['Admin','Staff']): Promise<Session>` — throws `No permission` (403) when the role is not in `roles` or none of `keys` is held (Admin exempt).

- [ ] **Step 1:** Write `tests/unit/access.test.ts` exercising a pure helper `canUse(perms: string[], keys: string[], isAdmin: boolean): boolean` (Admin true; staff with key true; without false; empty keys list means "any feature": true if perms non-empty).
- [ ] **Step 2:** Run -> FAIL. **Step 3:** Implement `canUse` in `lib/features.ts`, then `lib/access.ts` using it. **Step 4:** Run -> ok; `npm run typecheck` clean.
- [ ] **Step 5:** Commit `feat: requireFeature server check`.

### Task 3: Pre-check and enforce on staff routes

**Files:**
- Modify: `app/api/customers/route.ts`, `leads/[leadId]/route.ts`, `disbursements/route.ts`, `loans/close/route.ts`, `settlements/route.ts`, `settlements/due/route.ts`, `deposits/route.ts`, `deposits/request/route.ts`, `agent/location/route.ts` (GET, PATCH), `agent/attendance/route.ts` (staff GET), `agent/trips/route.ts` (staff GET), `profile/route.ts` (other-user read), `staff/route.ts` (GET list).
- Create: `scripts/staff-access-precheck.mjs` (read-only: prints for each live Staff row the keys the map would require; writes nothing).

**Interfaces:** Consumes `requireFeature`. Map: customers -> `['customers']`; leads/[leadId], disbursements, loans/close -> `['leads']`; settlements* -> `['settlements']`; deposits* -> `['deposits']`; agent/location, attendance, trips staff access -> `['agentTracking','verificationPlanning']`; profile and staff list -> `[]` (any feature).

- [ ] **Step 1:** Run the pre-check script against the 3 live Staff rows; list keys they lack. Show the list to the owner, then tick missing keys in `staff_access` through the existing `POST /api/branches` (Admin) only for the keys the owner confirms.
- [ ] **Step 2:** Replace each `requireRole(req, ['Admin','Staff'...])` per the map (Agent/Guarantor branches of shared routes untouched).
- [ ] **Step 3:** `npm run typecheck`; then run a script that logs in as the demo staff user and calls each route with and without the key, expecting 403 vs 200.
- [ ] **Step 4:** Commit `feat: staff features enforced on the server`.

### Task 4: Role defaults screen and personal extras

**Files:**
- Modify: `app/api/branches/route.ts` (GET returns `roleDefaults`, `POST action:'saveRoleDefaults'` Admin only, validates keys against `FEATURES`), `components/pages/StaffPage.tsx` (new "Role defaults" table; edit-person dialog shows Default / Extra / Removed per feature), `components/AppShell.tsx` (menus for Staff/Agent/Guarantor built from `loadPermissions` result returned by `GET /api/branches?self=1` as `effective`), `lib/config.ts` (STAFF/GUARANTOR_FEATURES generated from `FEATURES`).

**Interfaces:** `GET /api/branches?self=1` adds `effective: string[]`; existing `permissions` kept.

- [ ] **Step 1:** Add API test script: save defaults as Admin, read as staff, expect `effective` to follow; non-Admin save -> 403.
- [ ] **Step 2:** Implement API, then UI. **Step 3:** Typecheck; Playwright check of the table and dialog (desktop + phone width). **Step 4:** Commit.

### Task 5: Agent and guarantor features, Admin-only items assignable

**Files:** Modify `AppShell.tsx` (agent menu filtered by `effective`; Admin-only pages `financialAnalytics, importCustomer, payoutRequests, reviewOptions` appear for staff holding the key), the matching API routes (`financial-analytics`, `import-customer`, `commissions/payout`, `review-options`) to use `requireFeature(..., roles incl. 'Staff')`.

- [ ] Steps: route test with/without key; typecheck; commit.

### Task 6: Docs and release

- [ ] Update the three docs listed in Global Constraints; remove the "menu only" warning; `npm run typecheck`; push `main`; verify live deploy serves the new bundle.

(Stage 3, splitting Leads/Collection, is a separate plan after the owner chooses the parts.)
