---
title: Screens Map
section: Roles and Screens
status: current
last_verified: 2026-10-17
tags: [ngf, roles-screens, screens, appshell]
---
# Screens Map
**One line: every view key in `components/AppShell.tsx`, the component behind it, who can open it from the menu, and which views have no menu entry.**

## Key facts
- Navigation is state: `view` string plus `renderPage()` switch (`AppShell.tsx:159-196`). No URLs per screen; refresh returns to the first view.
- Menus are the `MENUS` object (`AppShell.tsx:68-108`). Staff menu is built from granted features plus Notifications (`:151-155`).
- Start view: first menu item; Staff start on `notifications`, then their first granted feature.

## Reachable screens (in a menu)
| View key | Component (`components/pages/`) | Menu label | Roles | Purpose |
|---|---|---|---|---|
| `dashboard` | `Dashboard` | Dashboard | Admin, Guarantor | KPIs, charts, recollection gauge |
| `financialAnalytics` | `Dashboard` (same component) | Financial Analytics | Admin | Duplicate of dashboard, no extra prop |
| `customers` | `CustomersPage` | Customers / Assigned Customers | Admin, Agent, Staff* | Customer list and loan info |
| `leads` | `LeadsPage` | Leads | Admin, Guarantor, Staff* | Submit, review, approve leads; Disbursements tab has **To Disburse** (`DisburseQueue`), renewal approval with customer OTP (`RenewalApproveModal`); agent verification has the OTP step ([[Customer OTP and Disbursement]]) |
| `collection` | `CollectionPage` | Collection | all four | Weekly collection, payments, sheet download |
| `payments` | `PaymentMatchingPage` | Payment Matching / UPI Payments | Admin, Guarantor (view only), Staff and Agent with `upiPayments` | Mark UTR payments, flagged duplicates, diagram records, bank check. See [[Payment Matching]] |
| `reports` | `ReportsPage` | Reports | Admin, Staff* | Reports |
| `settlements` | `SettlementsPage` | Settlements | Admin, Staff* | Cash/UPI settlement records |
| `importCustomer` | `ImportCustomerPage` | Import Customer | Admin | Bulk/legacy import |
| `payoutRequests` | `PayoutRequestsPage` | Payout Requests | Admin | Guarantor payout approvals |
| `staff` | `StaffPage` | NGF Branches | Admin | Branches, staff, org chart |
| `town` | `BranchTownPage` | Branch Town | Admin | 3D town of branch offices ([[Branch Town]]) |
| `guarantors` | `GuarantorPage` | Guarantors | Admin, Staff* | Guarantor list, ID QR scan |
| `reviewOptions` | `ReviewOptionsPage` | Review Options | Admin | Review label lists |
| `notifications` | `NotificationsPage` | Notifications | all four | Inbox |
| `agentTracking` | `AgentTrackingPage` | Agent Tracking | Admin, Staff* | Live agent map |
| `dev` | `DevPage` | Dev | Admin | Settings, QR login switches, dark mode, tools |
| `commissions` | `CommissionsPage` | Commissions | Guarantor | Earnings and payout request |
| `deposits` | `DepositsPage` | Deposits | Guarantor | Deposit ledger and requests |
| `myCustomers` | `MyCustomersPage` | My Customers | Guarantor | Own customers |
| `myIdCard` | `MyIdCardPage` | My ID Card | Guarantor | Own ID card with QR |
| `verifications` | `VerificationsPage` | Assigned Verifications | Agent | Field verification, attendance, trips |
| `tripDetails` | `TripDetailsPage` | Trip Details | Agent | Trip history |
| `location` | `AgentLocationPage` | Live Location | Agent | Share GPS on/off |
\* Staff sees it only if the matching key is granted in `staff_access.permissions` ([[Roles and Permissions]]).

The profile dropdown (both headers) always offers `myIdCard` ("My Profile") and `myCustomers` for every role (`AppShell.tsx:419-426,527-534`). Admin, Staff and Agent can open them there even though no menu lists them.

## Orphan views (in the switch, in no menu)
No page receives `setView`, so nothing can switch to these. Only code in `AppShell` calls `setView`.
| View key | Component / mode |
|---|---|
| `submitLead` | `SubmitLeadPage` (its `onDone` goes to `leads`) |
| `activeLoans`, `overdueLoans`, `renewals`, `completedLoans` | `LoansPage` with `defaultFilter` |
| `cheques` | `ChequesPledgedPage` |
| `repayments`, `today`, `saturday` | `RepayPage` modes `all`, `today`, `saturday` |
| `pastMonth` | `PastMonthCollectionPage` (also a tab inside `CollectionPage`) |
| `collections` | `CollectionsPage` (route `GET /api/collections` is Admin-only) |
Also: `MenuIcon` has an `agent` icon with no view (`AppShell.tsx:52`); `RenewalModal.tsx` is a modal, not a view. Unknown `view` shows "Coming soon." Orphan titles fall back to the raw key.

## Layout sketch (verified against `AppShell.tsx`)
Desktop (`lg` and up, sidebar `hidden lg:flex`, `w-14` collapsed, `w-64` expanded):
```
+------+--------------------------------------------------+
| NGF  |  [icon] Page title            [bell] [avatar name]|  sticky desktop header
|------+--------------------------------------------------+
| [ic] |                                                  |
| [ic] |   page content (scrolls)                         |
| [ic] |   px-4 sm:px-6 lg:px-8                           |
| ...  |                                                  |
|(hover|                                                  |
| opens|                                                  |
| w-64:|                                                  |
| name,|                                                  |
| pin, |                                                  |
| logout)                                                 |
+------+--------------------------------------------------+
```
Mobile (below `lg`, drawer is a left Sheet `w-[80vw] max-w-[320px]`):
```
+------------------------------------+     +----------------+
| [=] NGF FINCORP     [bell] [avatar]|     | NGF FINCORP  X |
|     <Role> portal                  |     | menu items ... |
|------------------------------------|     | avatar, Logout |
|  page content (scrolls)            |     +----------------+
|  px-4, 2-col metric cards          |      opens on [=]
+------------------------------------+
```
Mobile header shows no page title; the title shows only in the desktop header (`:443`).

## Rules and gotchas
- Collapsed desktop sidebar hides the user block, so Logout is reachable only from the header avatar menu until the sidebar is hovered open.
- Pin state and collapse state are not saved; reload resets them (`AppShell.tsx:113-114`).
- Bell dropdowns show 3 hard-coded sample items and a fixed "3" badge; the real inbox is `notifications`.
- `NGF AGENT` sees `customers` labelled "Assigned Customers" because the label comes from the menu, not the page.

## Related
- [[Roles and Screens Brain]], [[Roles and Permissions]], [[Mobile and Responsive Notes]], [[Request Flow]], [[Lead to Loan]], [[Repayments and Collections]]
