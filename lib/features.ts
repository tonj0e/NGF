// One list of every feature the Admin can hand out, plus the rule that turns "branch role + personal extras"
// into the permissions a person really has. Pure code (no database) so it can be tested alone.
// Server checks live in lib/access.ts; the menus read the same result from GET /api/branches?self=1.

export type Holder = 'staff' | 'agent' | 'guarantor'
export interface Feature { key: string; label: string; group: string; holders: Holder[]; view: string }

export const FEATURES: Feature[] = [
  { key: 'customers',   label: 'Customers: view and repayment history (old switch)', group: 'Customers', holders: ['staff'], view: 'customers' },
  { key: 'customersView',    label: 'Customers: view customers, loans and payments', group: 'Customers', holders: ['staff'], view: '' },
  { key: 'customersHistory', label: 'Customers: repayment history and score',        group: 'Customers', holders: ['staff'], view: '' },
  { key: 'customersEdit',    label: 'Customers: edit details (phone, address, bank, PAN)', group: 'Customers', holders: ['staff'], view: '' },
  { key: 'customersReadmit', label: 'Customers: re-admit a permanently closed customer',   group: 'Customers', holders: ['staff'], view: '' },
  { key: 'customersDelete',  label: 'Customers: delete customers',                   group: 'Customers', holders: ['staff'], view: '' },
  { key: 'leads',       label: 'Leads: all parts (everything below)', group: 'Leads', holders: ['staff'], view: 'leads' },
  { key: 'leadsView',     label: 'Leads: view leads and history',   group: 'Leads', holders: ['staff'], view: '' },
  { key: 'leadsEdit',     label: 'Leads: edit details, scan Drive folder, add a lead', group: 'Leads', holders: ['staff'], view: '' },
  { key: 'leadsAssign',   label: 'Leads: assign the verifying agent', group: 'Leads', holders: ['staff'], view: '' },
  { key: 'leadsApprove',  label: 'Leads: approve, reject, ask re-verification', group: 'Leads', holders: ['staff'], view: '' },
  { key: 'leadsDisburse', label: 'Leads: disburse approved loans',  group: 'Leads', holders: ['staff'], view: '' },
  { key: 'leadsRenew',    label: 'Leads: start renewals',           group: 'Leads', holders: ['staff'], view: '' },
  { key: 'leadsClose',    label: 'Leads: close a loan early',       group: 'Leads', holders: ['staff'], view: '' },
  { key: 'leadsDelete',   label: 'Leads: delete leads',             group: 'Leads', holders: ['staff'], view: '' },
  { key: 'verificationPlanning', label: 'Verification Routes (call customers, plan agent visits)', group: 'Leads', holders: ['staff'], view: 'routes' },
  { key: 'collection',  label: 'Collection: all parts (everything below)', group: 'Money', holders: ['staff'], view: 'collection' },
  { key: 'collectionView',   label: 'Collection: view pending, today, list, coming Saturday', group: 'Money', holders: ['staff'], view: '' },
  { key: 'collectionRecord', label: 'Collection: record payments',             group: 'Money', holders: ['staff'], view: '' },
  { key: 'collectionSheet',  label: 'Collection: download the Saturday sheet', group: 'Money', holders: ['staff'], view: '' },
  { key: 'collectionPast',   label: 'Collection: past month and history',      group: 'Money', holders: ['staff'], view: '' },
  { key: 'settlements', label: 'Settlements',           group: 'Money',      holders: ['staff'], view: 'settlements' },
  { key: 'deposits',    label: 'Deposits',              group: 'Money',      holders: ['staff'], view: '' },
  { key: 'reports',     label: 'Reports',               group: 'Reports',    holders: ['staff'], view: 'reports' },
  { key: 'guarantors',  label: 'Guarantors',            group: 'People',     holders: ['staff'], view: 'guarantors' },
  { key: 'agentTracking', label: 'Agent Tracking',      group: 'People',     holders: ['staff'], view: 'agentTracking' },
  { key: 'payChat',     label: 'Payments: chat (see guarantor screenshots, reply, confirm)', group: 'Payments', holders: ['staff', 'agent', 'guarantor'], view: '' },
  { key: 'payHistory',  label: 'Payments: payment history',          group: 'Payments', holders: ['staff', 'agent', 'guarantor'], view: '' },
  { key: 'payMark',     label: 'Payments: mark by UTR manually',     group: 'Payments', holders: ['staff', 'agent'], view: '' },
  { key: 'payBank',     label: 'Payments: bank statement check',     group: 'Payments', holders: ['staff', 'agent'], view: '' },
  { key: 'payOverride', label: 'Payments: override duplicate UTR',   group: 'Payments', holders: ['staff', 'agent'], view: '' },
  { key: 'paymentLinks', label: 'Payment Links (send links and QR, close loans by payment)', group: 'Payments', holders: ['staff'], view: 'payLinks' },
  { key: 'gp:dashboard',   label: 'Dashboard',          group: 'Guarantor pages', holders: ['guarantor'], view: '' },
  { key: 'gp:leads',       label: 'Leads',              group: 'Guarantor pages', holders: ['guarantor'], view: '' },
  { key: 'gp:collection',  label: 'Collection',         group: 'Guarantor pages', holders: ['guarantor'], view: '' },
  { key: 'gp:payLinks',    label: 'Send Payment Link',  group: 'Guarantor pages', holders: ['guarantor'], view: '' },
  { key: 'gp:commissions', label: 'Commissions',        group: 'Guarantor pages', holders: ['guarantor'], view: '' },
  { key: 'gp:deposits',    label: 'Deposits',           group: 'Guarantor pages', holders: ['guarantor'], view: '' },
  { key: 'gp:myCustomers', label: 'My Customers',       group: 'Guarantor pages', holders: ['guarantor'], view: '' },
  { key: 'gp:myIdCard',    label: 'My ID Card',         group: 'Guarantor pages', holders: ['guarantor'], view: '' },
  { key: 'financialAnalytics', label: 'Financial Analytics', group: 'Admin tools', holders: ['staff'], view: 'financialAnalytics' },
  { key: 'importCustomer',     label: 'Import Customer',     group: 'Admin tools', holders: ['staff'], view: 'importCustomer' },
  { key: 'payoutRequests',     label: 'Payout Requests',     group: 'Admin tools', holders: ['staff'], view: 'payoutRequests' },
  { key: 'reviewOptions',      label: 'Review Options',      group: 'Admin tools', holders: ['staff'], view: 'reviewOptions' },
]

/** The Leads parts. The old `leads` key means all of them, so anyone who had it keeps everything. */
export const LEAD_PARTS = ['leadsView', 'leadsEdit', 'leadsAssign', 'leadsApprove', 'leadsDisburse', 'leadsRenew', 'leadsClose', 'leadsDelete']
/** Keys that allow one part: the part itself or the all-parts key */
export const lead = (part: string) => [part, 'leads']
/** Collection parts. The old `collection` key means all of them. */
export const COLLECTION_PARTS = ['collectionView', 'collectionRecord', 'collectionSheet', 'collectionPast']
export const coll = (part: string) => [part, 'collection']
export const hasAnyCollection = (perms: string[]) => perms.includes('collection') || COLLECTION_PARTS.some(k => perms.includes(k))

/** Customers parts. The old `customers` key = view + history only (editing needs customersEdit; re-admit and delete were Admin-only and stay so until given). */
export const CUSTOMER_PARTS = ['customersView', 'customersHistory', 'customersEdit', 'customersReadmit', 'customersDelete']
export const customer = (part: string) => (part === 'customersView' || part === 'customersHistory') ? [part, 'customers'] : [part]
export const hasAnyCustomer = (perms: string[]) => perms.includes('customers') || CUSTOMER_PARTS.some(k => perms.includes(k))

/** Does this person get the Leads menu item? Any lead key. */
export const hasAnyLead = (perms: string[]) => perms.includes('leads') || LEAD_PARTS.some(k => perms.includes(k))

export const FEATURE_KEYS = new Set(FEATURES.map(f => f.key))

// Starting defaults per branch role (editable by the Admin: settings key `role_defaults`). Same sets that were
// only "suggestions" before, so nothing changes until the Admin edits them.
export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  manager:           [...CUSTOMER_PARTS, ...LEAD_PARTS, ...COLLECTION_PARTS, 'settlements', 'reports', 'guarantors', 'agentTracking', 'verificationPlanning'],
  assistant_manager: ['customersView', 'customersHistory', 'customersEdit', 'leadsView', 'leadsEdit', 'leadsAssign', 'leadsApprove', 'leadsDisburse', 'leadsRenew', 'leadsClose', ...COLLECTION_PARTS, 'reports', 'guarantors', 'agentTracking', 'verificationPlanning'],
  accountant:        ['customersView', 'customersHistory', 'leadsView', 'leadsApprove', 'leadsDisburse', ...COLLECTION_PARTS, 'reports', 'settlements', 'agentTracking', 'verificationPlanning'],
  cashier:           ['collectionView', 'collectionRecord', 'collectionSheet', 'settlements', 'leadsView', 'leadsDisburse'],
  agent:             [],
  // pages a guarantor sees until the Admin customises that one guarantor (everything they always had; chat is off by default)
  guarantor:         ['gp:dashboard', 'gp:leads', 'gp:collection', 'gp:payLinks', 'gp:commissions', 'gp:deposits', 'gp:myCustomers', 'gp:myIdCard', 'payHistory'],
}

/** Permissions stored as an array, a comma text, or nothing */
export function permsOf(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).map(s => s.trim()).filter(Boolean)
  if (typeof raw === 'string') return raw.replace(/^\{|\}$/g, '').split(',').map(s => s.trim()).filter(Boolean)
  return []
}

/** Defaults of every role the person holds, plus their extras, minus their removals (`-key`; removal wins). */
export function effectivePermissions(roles: string[], extras: string[], defaults: Record<string, string[]> = DEFAULT_ROLE_PERMISSIONS): string[] {
  const out = new Set<string>()
  for (const r of roles) for (const k of defaults[r] || []) if (FEATURE_KEYS.has(k)) out.add(k)
  const removed = new Set<string>()
  for (const e of extras) {
    if (e.startsWith('-')) removed.add(e.slice(1))
    else if (FEATURE_KEYS.has(e)) out.add(e)
  }
  for (const k of removed) out.delete(k)
  return Array.from(out)
}

/** Admin always; others need one of `keys` (empty list = any feature at all). */
export function canUse(perms: string[], keys: string[], isAdmin: boolean): boolean {
  if (isAdmin) return true
  if (keys.length === 0) return perms.length > 0
  return keys.some(k => perms.includes(k))
}
