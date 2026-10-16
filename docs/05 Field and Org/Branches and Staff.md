---
title: Branches and Staff
section: Field and Org
status: current
last_verified: 2026-10-17
tags: [ngf, field-and-org, branches, staff]
---
# Branches and Staff
**One line: the "NGF Branches" admin page, the branch / staff / guarantor model behind it, and the API routes that change it.**

## Key facts
- Admin-only screen: menu key `staff`, label "NGF Branches" (`components/AppShell.tsx:79`). Page: `components/pages/StaffPage.tsx`.
- Data comes from one call: `GET /api/branches/org-hierarchy` (Admin only, `app/api/branches/org-hierarchy/route.ts:5`).
- Tables: `branches`, `branch_staff_roles`, `staff_access`, `guarantor_branches`, `agents.branch_id`. See [[Tables]].
- Branch roles (only these four): `manager`, `accountant`, `cashier`, `collection_agent` (`app/api/branches/route.ts:92`).
- Feature permissions are a list in `staff_access.permissions`: customers, leads, collection, settlements, guarantors, reports, agentTracking (`lib/config.ts:16-24`). Role "suggested" lists in `lib/config.ts:26-31` are only pre-ticked boxes, not auto-granted.
- Only the `Staff` global role uses permissions. They build the Staff sidebar in the browser via `GET /api/branches?self=1` (`AppShell.tsx:127`). See [[Roles and Permissions]].
- No API filters data by branch. Staff see organisation-wide data on every route that allows Staff.

## How it works
**Add Branch.** Dialog sends `POST /api/branches {action:'addBranch', name}`. Creates `BR...` id, status `Active`.

**Add User.** `AddUserDialog` always sends role `Staff` plus `branchId`, `branchRole`, `permissions` to `POST /api/staff` (`StaffPage.tsx:166`). Server (`app/api/staff/route.ts:20`):
1. Checks username unique, hashes password, inserts `users`.
2. Role `NGF AGENT` also inserts `agents`; role `Guarantor` inserts `guarantors` (+ `guarantor_branches` row if `branchId` given, line 57).
3. If `branchId` + `branchRole` and role is not Guarantor: inserts `branch_staff_roles`, then `staff_access`.
4. Any failure runs compensating deletes in reverse order (line 118) and returns the error.
- One active manager per branch is enforced here and in `setStaffRole`.

**Edit User.** `PATCH /api/staff`. Guarantors use RPC `update_guarantor_atomic` (line 191). Everyone else gets a plain update of name, email, username, role, password.

**Block / Unblock.** `POST` / `DELETE /api/staff/block` set or clear `blocked_at/until/by`, `block_reason`; audit-logged. A blocked user is rejected in `getSession` (`lib/api.ts:31`). See [[Auth and Sessions]].

**Delete User.** `DELETE /api/staff`: refuses self, username `admin`, the last active Admin, and a Guarantor that still has Leads, Customers, Loans, PayoutRequests, Deposits or DepositRequests (line 322). Then deletes branch roles, access, profile, notifications, agent or guarantor row, then the user. FK failures on other tables surface as an error after partial cleanup.

**Delete Branch.** `POST /api/branches {action:'deleteBranch'}` only deletes the `branches` row, no dependency check. `staff_access` cascades in the repo schema (`supabase_schema.sql:327`); the other child tables have no DDL in the repo.

**Guarantor list in a branch.** `org-hierarchy` reads `guarantor_branches` rows with `is_active` true for that branch, then joins `guarantors`. A guarantor shows in a branch only if such a link row exists. Rows are created by `POST /api/staff` with role Guarantor + `branchId`, or by `POST /api/branches {action:'associateGuarantor'}`. No screen in the repo calls either path today, so branch guarantor lists fill only through direct API use.

**Collection agents in a branch.** Shown from `agents` where `branch_id` equals the branch and status Active (not from `branch_staff_roles`). Set by `setAgentBranch`, which no screen calls.

## Rules and gotchas
- Known issue: Edit User ignores branch, branch role and permissions. `StaffPage.tsx:166-175` sends them but `PATCH` (`app/api/staff/route.ts:151`) never writes them. Permissions are changed in Dev, Branches tab (`setAccess`).
- Known issue: permanent block does nothing. It stores `blocked_until = null` (`app/api/staff/block/route.ts:51`) but every check needs `blocked_until > now` (`lib/api.ts:31`, `app/api/auth/login/route.ts:55`). `isBlocked` in org-hierarchy has the same flaw (line 78).
- Known issue: durations `7d` and `30d` are parsed as 7 and 30 hours (`block/route.ts:55`, `parseInt` after stripping only `h`).
- Known issue: custom block asks for the end date twice. The first answer is discarded (`StaffPage.tsx:316` and `:325`).
- Known issue: error toast on failed save is wrong when the server error text is empty (`StaffPage.tsx:191`, operator precedence).
- `POST /api/staff` has no role whitelist and no password policy (`validatePasswordPolicy` only runs on guarantor edit). Any Admin can create an `Admin`. See [[Open Security Leads]].
- `GET /api/staff` is open to Staff and returns every user, agent and guarantor with email and phone.
- `setAccess` stores one branch per user (`updateById` by `user_id`).

## Related
- [[Field and Org Brain]]
- [[Roles and Permissions]]
- [[Auth and Sessions]]
- [[Dev and Admin Tools]]
- [[Agent Attendance Location and Trips]]
- [[Screens Map]]
