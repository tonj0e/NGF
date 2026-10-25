// One list of every feature the Admin can hand out, plus the rule that turns "branch role + personal extras"
// into the permissions a person really has. Pure code (no database) so it can be tested alone.
// Server checks live in lib/access.ts; the menus read the same result from GET /api/branches?self=1.

export type Holder = 'staff' | 'agent' | 'guarantor'
export interface Feature { key: string; label: string; group: string; holders: Holder[]; view: string }

export const FEATURES: Feature[] = [
  { key: 'customers',   label: 'Customers',             group: 'Customers',  holders: ['staff'], view: 'customers' },
  { key: 'leads',       label: 'Leads & Disbursements', group: 'Leads',      holders: ['staff'], view: 'leads' },
  { key: 'verificationPlanning', label: 'Verification Routes (call customers, plan agent visits)', group: 'Leads', holders: ['staff'], view: 'routes' },
  { key: 'collection',  label: 'Collection',            group: 'Money',      holders: ['staff'], view: 'collection' },
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
  { key: 'financialAnalytics', label: 'Financial Analytics', group: 'Admin tools', holders: ['staff'], view: 'financialAnalytics' },
  { key: 'importCustomer',     label: 'Import Customer',     group: 'Admin tools', holders: ['staff'], view: 'importCustomer' },
  { key: 'payoutRequests',     label: 'Payout Requests',     group: 'Admin tools', holders: ['staff'], view: 'payoutRequests' },
  { key: 'reviewOptions',      label: 'Review Options',      group: 'Admin tools', holders: ['staff'], view: 'reviewOptions' },
]

export const FEATURE_KEYS = new Set(FEATURES.map(f => f.key))

// Starting defaults per branch role (editable by the Admin: settings key `role_defaults`). Same sets that were
// only "suggestions" before, so nothing changes until the Admin edits them.
export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  manager:           ['customers', 'leads', 'collection', 'settlements', 'reports', 'guarantors', 'agentTracking', 'verificationPlanning'],
  assistant_manager: ['customers', 'leads', 'collection', 'reports', 'guarantors', 'agentTracking', 'verificationPlanning'],
  accountant:        ['customers', 'reports', 'settlements', 'agentTracking', 'verificationPlanning'],
  cashier:           ['collection', 'settlements'],
  collection_agent:  ['collection'],
  agent:             [],
  guarantor:         [],
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
