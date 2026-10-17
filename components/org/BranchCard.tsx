'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Building2, Users, TrendingUp, DollarSign, Shield, Plus, Search } from 'lucide-react'
import { BranchRoleBadge } from './BranchRoleBadge'

type BranchRole = 'manager' | 'assistant_manager' | 'accountant' | 'cashier' | 'collection_agent' | 'guarantor'

interface BranchCardProps {
  branch: {
    branchId: string
    name: string
    status: string
    counts: {
      manager: number
      assistantManagers: number
      accountants: number
      cashiers: number
      collectionAgents: number
      guarantors: number
    }
    staff: Array<{
      userId: string
      username: string
      name: string
      roleInBranch: BranchRole
      permissions: string[]
      isActive: boolean
    }>
    guarantors: Array<{
      guarantorId: string
      name: string
      code: string
      phone: string
      commissionEarned: number
    }>
  }
  onAddUser?: (branchId: string, prefilledRole?: string) => void
  onAddBranch?: () => void
  onManageStaff?: (branchId: string, role?: string) => void
  onOpenRoleList?: (branchId: string, role: BranchRole, branchName: string) => void
}

const roleCards: Array<{ key: string; role: BranchRole; label: string; description: string; icon: React.ElementType; color: string; countKey: 'manager' | 'assistantManagers' | 'accountants' | 'cashiers' | 'collectionAgents' | 'guarantors' }> = [
  { key: 'manager', role: 'manager', label: 'Manager', description: 'Branch oversight', icon: Building2, color: 'bg-blue-100 text-blue-700', countKey: 'manager' as const },
  { key: 'assistantManagers', role: 'assistant_manager', label: 'Assistant Managers', description: 'Supports the manager', icon: Building2, color: 'bg-sky-100 text-sky-700', countKey: 'assistantManagers' as const },
  { key: 'accountants', role: 'accountant', label: 'Accountants', description: 'Financial records', icon: TrendingUp, color: 'bg-green-100 text-green-700', countKey: 'accountants' as const },
  { key: 'cashiers', role: 'cashier', label: 'Cashiers', description: 'Cash and receipts', icon: DollarSign, color: 'bg-amber-100 text-amber-700', countKey: 'cashiers' as const },
  { key: 'collectionAgents', role: 'collection_agent', label: 'Collection Agents', description: 'Assigned collections', icon: Users, color: 'bg-purple-100 text-purple-700', countKey: 'collectionAgents' as const },
  { key: 'guarantors', role: 'guarantor', label: 'Guarantors', description: 'Associated guarantors', icon: Shield, color: 'bg-indigo-100 text-indigo-700', countKey: 'guarantors' as const },
]

export function BranchCard({ branch, onAddUser, onAddBranch, onManageStaff, onOpenRoleList }: BranchCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [search, setSearch] = useState('')

  const statusColor = branch.status === 'Active' ? 'bg-green-100 text-green-700' : 
                      branch.status === 'Inactive' ? 'bg-gray-100 text-gray-700' :
                      'bg-amber-100 text-amber-700'

  const totalStaff = branch.counts.manager + branch.counts.assistantManagers + branch.counts.accountants + branch.counts.cashiers + branch.counts.collectionAgents
  const totalAll = totalStaff + branch.counts.guarantors

  return (
    <div className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel overflow-hidden">
      {/* Branch Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between gap-4 p-5 hover:bg-gray-50 transition-colors"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="h-12 w-12 shrink-0 rounded-xl bg-blue-100 flex items-center justify-center">
            <Building2 className="h-6 w-6 text-blue-600" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-semibold text-gray-900 truncate">{branch.name}</h3>
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColor}`}>
                {branch.status}
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {totalStaff} staff • {branch.counts.guarantors} guarantors
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 px-3 py-1.5 rounded-full">
            <span>{totalAll} total</span>
          </div>
          <motion.div
            className="h-8 w-8 shrink-0 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors"
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="h-5 w-5" />
          </motion.div>
        </div>
      </button>

      {/* Expanded Content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="border-t border-gray-100 overflow-hidden"
          >
            <div className="p-5 space-y-5">
              {/* Action Bar */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search staff, guarantors..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => onAddUser?.(branch.branchId)}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    Add User
                  </button>
                  <button
                    onClick={() => onManageStaff?.(branch.branchId)}
                    className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Manage Staff
                  </button>
                </div>
              </div>

              {/* Role Cards Grid */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {roleCards.map(({ key, role, label, description, icon: Icon, color, countKey }) => {
                  const count = branch.counts[countKey]
                  const isEmpty = count === 0
                  const emptyMessages: Record<string, string> = {
                    manager: 'No manager assigned',
                    assistantManagers: 'No assistant branch manager added yet',
                    accountants: 'No accountants added yet',
                    cashiers: 'No cashiers added yet',
                    collectionAgents: 'No collection agents assigned',
                    guarantors: 'No guarantors associated with this branch',
                  }

                  return (
                    <div
                      key={key}
                      className={`rounded-[1.5rem] border border-white/70 bg-white p-5 shadow-sm transition-all hover:shadow-md cursor-pointer ${
                        isEmpty ? 'bg-gray-50 border-dashed' : ''
                      }`}
                      onClick={() => !isEmpty && onOpenRoleList?.(branch.branchId, role, branch.name)}
                    >
                      <div className="flex items-start gap-4">
                        <div className={`h-11 w-11 shrink-0 rounded-xl flex items-center justify-center ${color}`}>
                          <Icon className="h-5.5 w-5.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <BranchRoleBadge role={key === 'collectionAgents' ? 'collection_agent' : key as any} size="md" />
                            <h4 className="font-semibold text-gray-900">{label}</h4>
                          </div>
                          <p className="mt-1 text-sm text-gray-500">{description}</p>
                          <div className="mt-3 flex items-center gap-3">
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold ${
                              isEmpty ? 'bg-gray-100 text-gray-500' : 'bg-blue-100 text-blue-700'
                            }`}>
                              {count}
                            </span>
                            {isEmpty && (
                              <span className="text-sm text-gray-400 italic">{emptyMessages[key]}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {!isEmpty && (
                        <div className="mt-4 pt-4 border-t border-gray-100">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              onAddUser?.(branch.branchId, key === 'collectionAgents' ? 'collection_agent' : key)
                            }}
                            className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 px-3 py-2 text-sm font-medium hover:bg-blue-100 transition-colors"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add {label.slice(0, -1)}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}