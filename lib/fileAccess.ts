import { readTable } from './supabase-db'
import { Session } from '../types'

// Who may read a stored file through /api/drive/[fileId].
// Admin and Staff: any file. Guarantor and Agent: only a file that is named in one of their own records
// (their leads, customers, loans, repayments and collections). Profile pictures are shown on ID cards and lists
// to every signed-in user, so the profiles bucket is open to all roles.

const FILE_COLS = /url|file|photo|proof|folder|path|image|doc/i

function collect(rows: Record<string, any>[], into: string[]) {
  for (const r of rows) for (const [k, v] of Object.entries(r)) {
    if (typeof v === 'string' && v && FILE_COLS.test(k)) into.push(v)
  }
}

export async function canReadFile(session: Session, fileId: string): Promise<boolean> {
  if (session.role === 'Admin' || session.role === 'Staff') return true
  if (!fileId || fileId.includes('..')) return false
  if (fileId.startsWith('supabase:profiles/')) return true

  const [leads, customers, loans, repayments, collections, guarantors, agents] = await Promise.all([
    readTable('Leads'), readTable('Customers'), readTable('Loans'), readTable('Repayments'),
    readTable('Collections'), readTable('Guarantors'), readTable('Agents'),
  ])

  let myLeads: Record<string, any>[] = [], myLoans: Record<string, any>[] = []
  const myCustomerIds = new Set<string>()
  if (session.role === 'Guarantor') {
    const g = guarantors.find(g => g['User ID'] === session.userId)
    if (!g) return false
    myLeads = leads.filter(l => l['Guarantor ID'] === g['Guarantor ID'])
    myLoans = loans.filter(l => l['Guarantor ID'] === g['Guarantor ID'])
    customers.filter(c => c['Guarantor ID'] === g['Guarantor ID']).forEach(c => myCustomerIds.add(c['Customer ID']))
  } else if (session.role === 'NGF AGENT') {
    const a = agents.find(a => a['User ID'] === session.userId)
    if (!a) return false
    myLeads = leads.filter(l => l['Assigned Agent ID'] === a['Agent ID'])
    myLoans = loans.filter(l => l['Assigned Agent ID'] === a['Agent ID'])
  } else return false

  myLoans.forEach(l => myCustomerIds.add(l['Customer ID']))
  const myLoanIds = new Set(myLoans.map(l => l['Loan ID']))
  const refs: string[] = []
  collect(myLeads, refs)
  collect(myLoans, refs)
  collect(customers.filter(c => myCustomerIds.has(c['Customer ID'])), refs)
  collect(repayments.filter(r => myLoanIds.has(r['Loan ID'])), refs)
  collect(collections.filter(c => myLoanIds.has(c['Loan ID'])), refs)
  return refs.some(v => v.includes(fileId))
}
