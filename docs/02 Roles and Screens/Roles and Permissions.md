---
title: Roles and Permissions
section: Roles and Screens
status: current
last_verified: 2026-10-17
tags: [ngf, roles-screens, permissions, security]
---
# Roles and Permissions
**One line: four roles; Staff features are checked on the server by feature key (since 2026-10-25), and the Admin sets role defaults plus per-person extras.**

## Key facts
| Role | Who | By design |
|---|---|---|
| `Admin` | Head office | Everything: finance, capital, branches, staff, settings, Dev tools, assistant |
| `Guarantor` | Field partner who brings customers | Own leads, own customers/loans/collection, commissions, deposits, ID card |
| `NGF AGENT` | Field collection and verification agent | Assigned verifications, assigned customers, collect payments, trips, live location |
| `Staff` | Branch employee | Whatever the Admin grants in Dev, Branches (menu only) |

Types: `Role` in `types/index.ts:1`. Role list: `lib/config.ts:13`.

**Feature access (2026-10-25)** — design `docs/superpowers/specs/2026-10-25-feature-access-design.md`.
- One registry `lib/features.ts` (`FEATURES`, `effectivePermissions`, `canUse`); `APP_CONFIG.STAFF_FEATURES` is generated from it.
- Server: `lib/access.ts` `requireFeature(req, keys, roles)` and `needFeature(session, keys)`; `loadPermissions(session)` = branch-role defaults + the person's `staff_access.permissions` extras minus `-key` removals. Admin always passes. Empty `keys` = any feature.
- Role defaults live in `settings` key `role_defaults` (JSON role -> keys), edited in NGF Branches → "Role defaults" (`POST /api/branches` `saveRoleDefaults`). **Until saved, nobody gets defaults**: only per-person ticks count, so nothing changed when this shipped. `GET /api/branches?self=1` returns `effective`; menus read it.
- Person dialog (AddUserDialog) shows Default / Extra / Removed once defaults are saved.
- Routes now checked: customers (+PATCH), leads, leads/[leadId], disbursements, loans/close, settlements, settlements/due, deposits, deposits/request, agent/location|attendance|trips (agentTracking or verificationPlanning), collection-sheet (collection), repayments POST (collection, settlements or payMark), financial-analytics, import-customer, review-options (POST/PATCH/DELETE), commissions/payout (payoutRequests); shared reads (customers, loans, repayments, leads GET, profile, staff list) need any feature. New keys: deposits, financialAnalytics, importCustomer, payoutRequests, reviewOptions.
- **Leads split (2026-10-25):** keys `leadsView, leadsEdit, leadsAssign, leadsApprove, leadsDisburse, leadsRenew, leadsClose, leadsDelete`; the old `leads` key = all parts (`lead(part)` in `lib/features.ts` returns `[part,'leads']`). Server: `leads/[leadId]` actions, `disbursements`, `loans/close`, `leads` POST (renewal vs new). `LeadsPage` hides buttons by part. Branch-role rules (approver roles, OTP override) still apply on top.
- **Customers split (2026-10-26):** keys `customersView, customersHistory, customersEdit, customersReadmit, customersDelete`; old `customers` = view + history only (`customer(part)` in `lib/features.ts`). Re-admit and delete were Admin-only and need their own key; manager default has all five. Server: `customers` PATCH (edit) and DELETE, `customers/readmit`, `customers/history`. `CustomersPage` hides buttons by part. Ruling: old `customers` does not include edit (the UI never showed Edit to staff).
- **Collection split (2026-10-26):** keys `collectionView, collectionRecord, collectionSheet, collectionPast`; old `collection` = all parts (`coll(part)` in `lib/features.ts`). Server: `repayments` POST (record; also still allowed by settlements/payMark), `collection-sheet`. `CollectionPage` hides tabs/buttons by part (Staff only). Defaults: manager and assistant manager all four; accountant all four (owner: accountants record payments too); cashier view, record, sheet. Past/History tabs are hidden in the UI only: the `repayments` list read needs any feature.
- **Guarantor defaults:** registry has `gp:*` page keys; `loadPermissions` gives a guarantor their own list if customised (`pages:custom`), else the `guarantor` defaults (or every page before the table is saved). Payment chat/history for guarantors reads the same list.
- There is no "collection agent" role in the table (owner, 2026-10-25): columns are Manager, Assistant Manager, Accountant, Cashier, Agent, Guarantor. The old `collection_agent` branch role still exists in the DB for one user and gets no defaults.
- Not done yet: agent pages as features.

**Staff detail**: `staff_access.permissions` is a list of keys from `APP_CONFIG.STAFF_FEATURES`: customers, leads, collection, settlements, guarantors, reports, agentTracking, plus the payment-matching keys `upiPayments`, `upiPaymentsBank`, `upiPaymentsOverride` (`lib/config.ts`; entries with `view: ''` add no menu item). Agents can also be given the payment-matching keys (Dev → Branches → Staff Access lists Staff and Agents); see [[Payment Matching]]. Admin sets them via `POST /api/branches`. `GET /api/branches?self=1` returns the caller's own list; `AppShell` builds the menu from it (`AppShell.tsx:125-155`).
**Branch roles** `manager, accountant, cashier, collection_agent` live in `branch_staff_roles` (`role_in_branch`). `BRANCH_ROLES` only gives suggested permission sets (`lib/config.ts:26-31`). **Exception since 2026-10-21:** approving a lead or renewal, marking it disbursed and closing a loan early check the branch role (manager, assistant manager, accountant of the lead's branch, or Admin), and Staff see only their branch's leads; overriding a failed OTP on a renewal is manager, assistant manager or Admin (`lib/branchAccess.ts`, [[Customer OTP and Disbursement]]). **Branch scope extended 2026-10-23** (regression bugs 3-5; helpers `guarantorBranchMap`, `canSeeGuarantor`, `customerGuarantorId`, `branchesOfUser` in `lib/branchAccess.ts`): a Staff user now sees and acts only on data of guarantors/agents in their own branches in these routes: `customers` GET/PATCH, `customers/history`, `loans` GET, `repayments` GET/POST, `settlements` GET/POST/PATCH and `settlements/due`, `commissions/payout` list and approve (approver roles only), `payments` (Payment Matching: guarantor list, collect sheet, mark, edit UTR, override, discard, records, bank report), `profile` of another user, `agent/attendance` GET, `agent/location` stream. `DELETE /api/customers` is Admin only. Dashboard totals are scoped per role (Admin all, Guarantor own, agent assigned, Staff their branches; capital figures Admin only). Admin is unchanged. A Staff user with no branch role sees nothing there. See [[Branches and Staff]].

## How it works
`requireRole(req, [...])` (`lib/api.ts:39`) throws `No permission` (403) if the JWT role is not listed. Many list routes call only `getSession` and then filter rows in code: Guarantor sees own rows, Agent sees assigned rows, Admin and Staff see all (`customers/route.ts:26-45`, `loans/route.ts:27-33`, `leads/route.ts:25-43`).

### Per-route role table (server-enforced)
| Route | Method | Roles allowed |
|---|---|---|
| `/api/customers` | GET | all roles, rows filtered by role |
| `/api/customers` | PATCH, DELETE | Admin, Staff |
| `/api/loans` | GET | all roles, filtered |
| `/api/loans` | PATCH | Admin |
| `/api/leads` | GET, POST | any logged-in role (Guarantor posts as self; CSRF presence check) |
| `/api/leads/[leadId]` | PATCH `update`, `assignAgent`, `adminReview`, `scanFolder` | Admin, Staff |
| `/api/leads/[leadId]` | PATCH `submitVerification` | NGF AGENT |
| `/api/leads/[leadId]` | DELETE | Admin, Staff |
| `/api/repayments` | GET | all, filtered (agent/guarantor by assignment) |
| `/api/repayments` | POST (record payment) | any logged-in role (no role check) |
| `/api/settlements`, `/due` | GET, POST, PATCH | Admin, Staff |
| `/api/deposits` | GET | Guarantor (own), Admin/Staff (all) |
| `/api/deposits` POST; `/api/deposits/request` PATCH | record / process | Admin, Staff |
| `/api/deposits/request` | POST | Guarantor only |
| `/api/commissions/payout` | GET own / POST request | Guarantor |
| `/api/commissions/payout` | GET all / PATCH | Admin, Staff |
| `/api/capital`, `/api/projection`, `/api/collections` | all | Admin |
| `/api/financial-analytics` | GET | Admin |
| `/api/dashboard` | GET | all roles, scoped |
| `/api/staff` | GET | Admin, Staff |
| `/api/staff` | POST, PATCH, DELETE; `/api/staff/block` | Admin |
| `/api/branches` | GET `?self=1` | any logged-in; full list Admin; POST Admin |
| `/api/branches/org-hierarchy` | GET | Admin |
| `/api/settings`, `/api/import-customer`, `/api/agent` (assistant) | all | Admin |
| `/api/loan-products` | GET any / POST, DELETE Admin | mixed |
| `/api/review-options` | GET | no auth at all |
| `/api/review-options` | POST, PATCH, DELETE | Admin |
| `/api/agent/attendance`, `/trips` | POST NGF AGENT; GET AGENT, Admin, Staff | mixed |
| `/api/agent/location` | POST NGF AGENT; GET, PATCH Admin, Staff | mixed |
| `/api/profile` | own data; other users Admin, Staff | mixed |
| `/api/drive/[fileId]` | GET | any logged-in role (no ownership check) |
| `/api/dev/*` | most POST/GET | Admin; `user-password-reset` also blocked in production; `migrate-db` GET unauthenticated |
| `/api/setup` | POST | header secret, no session |

## Rules and gotchas
- **Enforced since 2026-10-25**: Staff feature keys (see Feature access above). Branch roles still matter for approve/disburse/OTP override.
- **Enforced**: the Admin-only routes above, and Guarantor/Agent row scoping on list routes.
- Known issue: `POST /api/repayments` has no role check (`app/api/repayments/route.ts:103-105`). A Guarantor token can mark any repayment paid by id.
- Known issue: `GET /api/review-options` is open to unauthenticated callers (`review-options/route.ts:5`). Low risk (labels only).
- Known issue: `GET /api/dev/migrate-db` has `requireRole` commented out (`dev/migrate-db/route.ts:195-197`). See [[Open Security Leads]].
- Known issue: `/api/drive/<id>` returns any file to any logged-in user.
- Role is read from the JWT, not the DB. Changing a user's role needs a new token ([[Auth and Sessions]]).

## Related
- [[Roles and Screens Brain]], [[Screens Map]], [[Auth and Sessions]], [[Branches and Staff]], [[Security Brain]], [[Open Security Leads]], [[Lead to Loan]], [[Repayments and Collections]]
