# NGF FINCORP CRM — Wireframe Documentation

## Application Overview

This is a **Finance Operations Platform** built with Next.js (App Router) featuring role-based access control, JWT authentication with QR code 2FA, and a responsive sidebar-shell layout.

---

## 1. Authentication Flow

### 1.1 Login Page (`/`)
```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │                    NGF FINCORP                      │   │
│   │              Finance operations platform            │   │
│   │                                                     │   │
│   │   ┌─────────────────────────────────────────────┐   │   │
│   │   │ Username                                    │   │   │
│   │   │ ┌─────────────────────────────────────────┐ │   │   │
│   │   │ │                                          │ │   │   │
│   │   │ └─────────────────────────────────────────┘ │   │   │
│   │   │ Password                                    │   │   │
│   │   │ ┌─────────────────────────────────────────┐ │   │   │
│   │   │ │                                          │ │   │   │
│   │   │ └─────────────────────────────────────────┘ │   │   │
│   │   │                                              │   │   │
│   │   │ [ Sign in ]                    ← Primary CTA │   │   │
│   │   └─────────────────────────────────────────────┘   │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 QR Verification Step (2FA)
```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │              Scan your ID card                      │   │
│   │  Hi [Name], point the QR on your ID card at the     │   │
│   │  camera to finish signing in.                       │   │
│   │                                                     │   │
│   │   ┌─────────────────────────────────────────────┐   │   │
│   │   │                                             │   │   │
│   │   │           [ CAMERA FEED ]                   │   │   │
│   │   │        ┌────────────────────┐               │   │   │
│   │   │        │   QR SCAN AREA     │ ◄─ Corner     │   │   │
│   │   │        │                    │    brackets   │   │   │
│   │   │        └────────────────────┘               │   │   │
│   │   │                                             │   │   │
│   │   └─────────────────────────────────────────────┘   │   │
│   │                                                     │   │
│   │   [☐] Remember this device                         │   │
│   │   [ Back ]                                         │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Main Application Shell (AppShell)

### 2.1 Desktop Layout (≥1024px)
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  ┌──────────────┐  ┌────────────────────────────────────────────────────┐  │
│  │   SIDEBAR    │  │                    MAIN CONTENT                    │  │
│  │   (240px)    │  │                                                    │  │
│  │              │  │  ┌──────────────────────────────────────────────┐  │  │
│  │  NGF FINCORP │  │  │  HEADER (sticky)                             │  │  │
│  │  [Role]portal│  │  │  ┌─────────────────────┐  [Menu] [Logout]  │  │  │
│  │  ──────────  │  │  │  │  Page Title        │                   │  │  │
│  │              │  │  │  └─────────────────────┘                   │  │  │
│  │  ▸ Dashboard │  │  └────────────────────────────────────────────┘  │  │
│  │  ▸ Customers │  │                                                    │  │
│  │  ▸ Leads     │  │  ┌────────────────────────────────────────────┐  │  │
│  │  ▸ Collection│  │  │                                          │  │  │
│  │  ▸ Reports   │  │  │         PAGE CONTENT AREA                 │  │  │
│  │  ▸ ...       │  │  │         (scrollable, flexible)            │  │  │
│  │              │  │  │                                          │  │  │
│  │  ──────────  │  │  │                                          │  │  │
│  │  [User Name] │  │  └────────────────────────────────────────────┘  │  │
│  │  [username]  │  │                                                    │  │
│  └──────────────┘  └────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Mobile Layout (<1024px)
```
┌─────────────────────────────────────────────────────────────┐
│  ┌───────────────────────────────────────────────────────┐  │
│  │ HEADER                                                │  │
│  │ ┌────────────────┐                    [☰ Menu] [Logout]│  │
│  │ │ Page Title     │                                     │  │
│  │ └────────────────┘                                     │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                                                       │  │
│  │        PAGE CONTENT AREA                              │  │
│  │                                                       │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  MOBILE DRAWER (when ☰ tapped)                        │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │ ▸ Dashboard        ▸ Customers                  │  │  │
│  │  │ ▸ Leads            ▸ Collection                 │  │  │
│  │  │ ▸ Reports          ▸ Settlements                │  │  │
│  │  │ ▸ ...              ▸ [User Section]             │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Role-Based Navigation Menus

### 3.1 Admin Menu (Full Access)
```
┌─────────────────────────────────────┐
│ NAVIGATION                          │
├─────────────────────────────────────┤
│ ▸ Dashboard                         │
│ ▸ Customers                         │
│ ▸ Leads                             │
│ ▸ Collection                        │
│ ▸ Reports                           │
│ ▸ Settlements                       │
│ ▸ Import Customer                   │
│ ▸ System Users (Staff)              │
│ ▸ Guarantors                        │
│ ▸ Review Options                    │
│ ▸ Notifications                     │
│ ▸ Dev (Developer Tools)             │
└─────────────────────────────────────┘
```

### 3.2 Guarantor Menu
```
┌─────────────────────────────────────┐
│ NAVIGATION                          │
├─────────────────────────────────────┤
│ ▸ Dashboard                         │
│ ▸ Leads                             │
│ ▸ Collection                        │
│ ▸ Commissions                       │
│ ▸ Deposits                          │
│ ▸ My Customers                      │
│ ▸ My ID Card                        │
│ ▸ Notifications                     │
└─────────────────────────────────────┘
```

### 3.3 Collection Agent Menu
```
┌─────────────────────────────────────┐
│ NAVIGATION                          │
├─────────────────────────────────────┤
│ ▸ Assigned Verifications            │
│ ▸ Assigned Customers                │
│ ▸ Collection                        │
│ ▸ Notifications                     │
└─────────────────────────────────────┘
```

### 3.4 Staff Menu (Dynamic - Permission Based)
```
┌─────────────────────────────────────┐
│ NAVIGATION                          │
├─────────────────────────────────────┤
│ ▸ [Permission-based features]       │
│    (from Dev → Branches config)     │
│ ▸ Notifications                     │
└─────────────────────────────────────┘
```

---

## 4. Page-Level Wireframes

### 4.1 Dashboard
```
┌─────────────────────────────────────────────────────────────┐
│ Dashboard                                                [H]│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │ Total Leads  │ │ Active Loans │ │ Collections  │        │
│  │    1,234     │ │     567      │ │   ₹ 45.2L   │        │
│  └──────────────┘ └──────────────┘ └──────────────┘        │
│                                                             │
│  ┌────────────────────────────┐ ┌────────────────────────┐ │
│  │ Recent Activity            │ │ Quick Actions          │ │
│  │ ────────────────────────   │ │ ─────────────────────  │ │
│  │ • Lead converted           │ │ [New Lead] [New Loan]  │ │
│  │ • Payment received         │ │ [Import] [Reports]     │ │
│  │ • Verification done        │ │                        │ │
│  └────────────────────────────┘ └────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Customers Page
```
┌─────────────────────────────────────────────────────────────┐
│ Customers                                             [H]   │
├─────────────────────────────────────────────────────────────┤
│ [Search...]  [Filter ▼]  [+ Add Customer]                   │
├─────────────────────────────────────────────────────────────┤
│ ┌────┬──────────┬─────────┬────────┬─────────┬──────┬─────┐ │
│ │ #  │ Name     │ Phone   │ Branch │ Status  │ Loans│ Act │ │
│ ├────┼──────────┼─────────┼────────┼─────────┼──────┼─────┤ │
│ │ 1  │ John Doe │ 98765...│ Delhi  │ Active  │   3  │ ⋮   │ │
│ │ 2  │ Jane...  │ 87654...│ Mumbai │ Active  │   1  │ ⋮   │ │
│ │ 3  │ Bob...   │ 76543...│ Pune   │ Pending │   0  │ ⋮   │ │
│ └────┴──────────┴─────────┴────────┴─────────┴──────┴─────┘ │
│                                                             │
│ [◀ Prev]  1  2  3 ... 10  [Next ▶]    Showing 1-50 of 1234 │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 Leads Page
```
┌─────────────────────────────────────────────────────────────┐
│ Leads                                                     [H]│
├─────────────────────────────────────────────────────────────┤
│ [Search...]  [Status ▼]  [Source ▼]  [Date ▼]  [+ New Lead] │
├─────────────────────────────────────────────────────────────┤
│ ┌────┬──────────┬──────────┬────────┬─────────┬──────┬────┐ │
│ │ #  │ Name     │ Phone    │ Source │ Status  │ Owner│ Act│ │
│ ├────┼──────────┼──────────┼────────┼─────────┼──────┼────┤ │
│ │ 1  │ Rahul... │ 99999... │ Walk-in│ New     │ Amit │ ⋮  │ │
│ │ 2  │ Priya... │ 88888... │ Ref    │ Contacted│ Sunil│ ⋮ │ │
│ └────┴──────────┴──────────┴────────┴─────────┴──────┴────┘ │
│                                                             │
│ [◀ Prev]  1  2  3 ...  [Next ▶]                              │
└─────────────────────────────────────────────────────────────┘
```

### 4.4 Collection Page
```
┌─────────────────────────────────────────────────────────────┐
│ Collection                                                [H]│
├─────────────────────────────────────────────────────────────┤
│ [Search Customer...]  [Branch ▼]  [Date Range ▼]            │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ TODAY'S COLLECTION SUMMARY                              │ │
│ │ ─────────────────────────────────────────────────────   │ │
│ │ Target: ₹ 2,50,000    │  Collected: ₹ 1,87,500  (75%)  │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌────┬──────────┬─────────┬────────┬───────┬───────┬──────┐│
│ │ #  │ Customer │ Due Amt │ Paid   │ Mode  │ Time  │ Act  ││
│ ├────┼──────────┼─────────┼────────┼───────┼───────┼──────┤│
│ │ 1  │ Rajesh K │ ₹ 5,000 │ ₹ 5,000 │ Cash  │ 10:30 │ ✓    ││
│ │ 2  │ Anita S  │ ₹ 3,000 │ ₹ 0     │ -     │ -     │ [Pay]││
│ └────┴──────────┴─────────┴────────┴───────┴───────┴──────┘│
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.5 Loans Page (with Filter Tabs)
```
┌─────────────────────────────────────────────────────────────┐
│ Loans                                          [H] [All│Act│Ov│Re│Co]│
├─────────────────────────────────────────────────────────────┤
│ [Search...]  [Branch ▼]  [Product ▼]  [+ New Loan]           │
├─────────────────────────────────────────────────────────────┤
│ ┌────┬──────────┬──────────┬────────┬────────┬──────┬──────┐│
│ │ #  │ Customer │ Product  │ Amount │ EMI    │ Status│ Acts ││
│ ├────┼──────────┼──────────┼────────┼────────┼──────┼──────┤│
│ │ 1  │ John D   │ Personal │ 5,00,000│ 15,000│ Active│ ⋮   ││
│ │ 2  │ Mary J   │ Business │ 10,00,000│ 45,000│ Overdue│ ⋮  ││
│ └────┴──────────┴──────────┴────────┴────────┴──────┴──────┘│
│                                                             │
└─────────────────────────────────────────────────────────────┘
Tabs: All | Active | Overdue | Renewal | Completed
```

### 4.6 Reports Page
```
┌─────────────────────────────────────────────────────────────┐
│ Reports                                                   [H]│
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ REPORT BUILDER                                          │ │
│ │ ─────────────────────────────────────────────────────   │ │
│ │ type: [Collection ▼]  branch: [All ▼]  date: [Last 30d ▼]│ │
│ │ [Generate]  [Export CSV]  [Export PDF]                  │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ PREVIEW / RESULTS TABLE                                 │ │
│ │ ┌────┬──────────┬────────┬────────┬────────┬────────┐  │ │
│ │ │ Br │ Customer │ Product│ Amount │ Status │ Date   │  │ │
│ │ │    │          │        │        │        │        │  │ │
│ │ └────┴──────────┴────────┴────────┴────────┴────────┘  │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.7 Settlements Page
```
┌─────────────────────────────────────────────────────────────┐
│ Settlements                                               [H]│
├─────────────────────────────────────────────────────────────┤
│ [Search...]  [Status ▼]  [Date Range ▼]  [+ New Settlement] │
├─────────────────────────────────────────────────────────────┤
│ ┌────┬──────────┬──────────┬────────┬────────┬───────┬─────┐│
│ │ #  │ Customer │ Loan     │ Settle │ Paid   │ Date  │ Act ││
│ │    │          │ Amount   │ Amount │ Amount │       │     ││
│ ├────┼──────────┼──────────┼────────┼────────┼───────┼─────┤│
│ │ 1  │ Kumar R  │ 2,00,000 │ 1,50,000│ 1,50,000│01/08 │ ⋮  ││
│ │ 2  │ Deepa M  │ 5,00,000 │ 3,00,000│ 0      │ -     │ ⋮  ││
│ └────┴──────────┴──────────┴────────┴────────┴───────┴─────┘│
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.8 Commissions Page
```
┌─────────────────────────────────────────────────────────────┐
│ Commissions                                               [H]│
├─────────────────────────────────────────────────────────────┤
│ [Month ▼]  [Staff ▼]  [Branch ▼]   [Export]                 │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ SUMMARY CARDS                                           │ │
│ │ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │ │
│ │ │ Total    │ │ Paid     │ │ Pending  │ │ This Month│    │ │
│ │ │ ₹ 12.5L │ │ ₹ 8.2L  │ │ ₹ 4.3L   │ │ ₹ 2.1L   │    │ │
│ │ └──────────┘ └──────────┘ └──────────┘ └──────────┘    │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌────┬──────────┬────────┬────────┬────────┬────────┬─────┐│
│ │ #  │ Staff    │ Loans  │ Amount │ Paid   │ Pending│ Act ││
│ ├────┼──────────┼────────┼────────┼────────┼────────┼─────┤│
│ │ 1  │ Amit K   │   45   │ 3,20,000│2,50,000│ 70,000│ ⋮  ││
│ └────┴──────────┴────────┴────────┴────────┴────────┴─────┘│
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.9 Staff / System Users Page (Admin Only)
```
┌─────────────────────────────────────────────────────────────┐
│ System Users                                              [H]│
├─────────────────────────────────────────────────────────────┤
│ [Search...]  [Role ▼]  [Branch ▼]  [+ Add User]              │
├─────────────────────────────────────────────────────────────┤
│ ┌────┬──────────┬─────────┬────────┬─────────┬───────┬─────┐│
│ │ #  │ Name     │ Username│ Role   │ Branch  │ Status│ Act ││
│ ├────┼──────────┼─────────┼────────┼─────────┼───────┼─────┤│
│ │ 1  │ Super... │ admin   │ Admin  │ HO      │ Active│ ⋮  ││
│ │ 2  │ Amit K   │ amit_k  │ Guarantor│ Delhi │ Active│ ⋮  ││
│ │ 3  │ Sunil R  │ sunil_r │ Agent  │ Mumbai  │ Active│ ⋮  ││
│ └────┴──────────┴─────────┴────────┴─────────┴───────┴─────┘│
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.10 Dev Page (Admin Only)
```
┌─────────────────────────────────────────────────────────────┐
│ Dev Tools                                                 [H]│
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ DARK MODE                                                │ │
│ │ ─────────────────────────────────────────────────────   │ │
│ │ [☐] Enable Dark Mode  (persists in localStorage)        │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ BRANCHES & PERMISSIONS                                   │ │
│ │ ─────────────────────────────────────────────────────   │ │
│ │ Manage branch configurations and staff feature flags    │ │
│ │ [Manage Branches]                                       │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ DATABASE TOOLS                                           │ │
│ │ ─────────────────────────────────────────────────────   │ │
│ │ [Run Migrations] [Seed Data] [Backup] [Reset]           │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Component Hierarchy

```
App (RootLayout)
├── page.tsx (Home)
│   ├── Login (unauthenticated)
│   └── AppShell (authenticated)
│       ├── Sidebar (Desktop)
│       │   ├── Logo + Role Badge
│       │   ├── Navigation Menu (role-based)
│       │   └── User Info Footer
│       │
│       ├── Header (Sticky)
│       │   ├── Page Title
│       │   ├── Mobile Menu Toggle
│       │   └── Logout Button
│       │
│       ├── Mobile Drawer (Conditional)
│       │   └── Navigation Grid
│       │
│       └── Main Content Area
│           └── Dynamic Page Component (based on view state)
│               ├── Dashboard
│               ├── CustomersPage
│               ├── LeadsPage / SubmitLeadPage
│               ├── CollectionPage
│               ├── LoansPage (with filter props)
│               ├── ChequesPledgedPage
│               ├── RepayPage (mode: all|today|saturday)
│               ├── SettlementsPage
│               ├── ReviewOptionsPage
│               ├── PastMonthCollectionPage
│               ├── CollectionsPage
│               ├── ReportsPage
│               ├── StaffPage
│               ├── VerificationsPage
│               ├── CommissionsPage
│               ├── ImportCustomerPage
│               ├── MyCustomersPage
│               ├── NotificationsPage
│               ├── GuarantorPage
│               ├── MyIdCardPage
│               ├── DepositsPage
│               └── DevPage
```

---

## 6. Responsive Breakpoints

| Breakpoint | Width | Sidebar | Header | Mobile Drawer |
|------------|-------|---------|--------|---------------|
| Mobile | < 640px | Hidden | Compact | Active |
| Tablet | 640-1023px | Hidden | Compact | Active |
| Desktop | ≥ 1024px | Visible (240px) | Full | Hidden |

---

## 7. Color & Design Tokens (from globals.css)

```css
/* Primary Colors */
--bg-primary: #f4f5f7        /* Page background */
--bg-card: #ffffff           /* Card/surface background */
--text-primary: #1a1a2e      /* Primary text */
--text-secondary: #697586    /* Secondary/muted text */
--accent: #1a1a2e            /* Primary actions, active states */
--border-light: #e5e7eb      /* Borders */
--border-white: rgba(255,255,255,0.7)  /* Glass panel borders */

/* Glass Panel */
.glass-panel {
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.7);
}

/* Dark Mode (persisted in localStorage) */
.ngf-dark {
  --bg-primary: #0f0f1a;
  --bg-card: #1a1a2e;
  --text-primary: #f4f5f7;
  --text-secondary: #9ca3af;
  --accent: #f4f5f7;
  --border-light: #374151;
}
```

---

## 8. Key UI Patterns

### 8.1 Form Fields
```
Label Text
┌─────────────────────────────────────┐
│ Input value                         │
└─────────────────────────────────────┘
Border: #e5e7eb | Focus: #1a1a2e | BG: #f4f5f7 → white
```

### 8.2 Buttons
```
Primary:     [ Sign in ]           bg:#1a1a2e text:white
Secondary:   [ Back ]              border:#e5e7eb text:#697586
Ghost:       [ Cancel ]            transparent text:#697586
Danger:      [ Delete ]            bg:red-600 text:white
```

### 8.3 Tables
- Striped rows on hover
- Action column with dropdown (⋮)
- Pagination at bottom
- Responsive: horizontal scroll on mobile

### 8.4 Empty States
```
┌─────────────────────────────────────┐
│                                     │
│    [Icon]                           │
│    No data found                    │
│    Get started by clicking [Action] │
│                                     │
└─────────────────────────────────────┘
```

---

## 9. API Route Structure (Reference)

```
/api
├── auth/
│   ├── login          ← POST username/password
│   └── verify-qr      ← POST preAuth + QR uid
├── branches/
├── capital/
├── collection-sheet/
├── collections/
├── commissions/
├── customers/
├── dashboard/
├── deposits/
├── dev/
├── drive/
├── import-customer/
├── leads/
├── loan-products/
├── loans/
├── notifications/
├── profile/
├── projection/
├── repayments/
├── review-options/
├── settlements/
├── setup/
└── staff/
```

---

## 10. State Management Notes

- **Auth**: JWT in localStorage (`ngf_token`), decoded client-side
- **QR Trust**: Separate localStorage key (`ngf_qrtrust`) for 2FA bypass
- **Dark Mode**: Persisted in localStorage (`ngf_dark_mode`)
- **View State**: React useState in AppShell (page navigation)
- **Staff Permissions**: Fetched on mount from `/api/branches?self=1`
- **No global state library** - uses React built-in hooks

---

*Wireframe generated from codebase analysis — NGF FINCORP CRM v1.0*