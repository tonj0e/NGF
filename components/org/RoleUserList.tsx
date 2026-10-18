'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Search, User, Shield, Building2, TrendingUp, DollarSign, Users, Plus, Edit, Trash2, Eye, MoreHorizontal, Lock, LockOpen } from 'lucide-react'
import { BranchRoleBadge } from './BranchRoleBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { formatINR } from '@/lib/format'

type UserRole = 'manager' | 'assistant_manager' | 'accountant' | 'cashier' | 'collection_agent' | 'guarantor'

interface StaffUser {
  userId: string
  username: string
  name: string
  roleInBranch: UserRole
  permissions: string[]
  isActive: boolean
  isBlocked?: boolean
  blockedUntil?: string
  blockReason?: string
}

interface GuarantorUser {
  guarantorId: string
  userId?: string
  name: string
  code: string
  phone: string
  commissionEarned: number
}

interface RoleUserListProps {
  open: boolean
  onClose: () => void
  title: string
  role: UserRole
  staff: StaffUser[]
  guarantors: GuarantorUser[]
  branchId: string
  onAddUser?: (branchId: string, role: string) => void
  onEditUser?: (user: StaffUser) => void
  onDeleteUser?: (userId: string) => void
  onViewUser?: (user: StaffUser) => void
  onBlockUser?: (user: StaffUser) => void
  onUnblockUser?: (user: StaffUser) => void
  onViewGuarantor?: (guarantor: GuarantorUser) => void
  onEditGuarantor?: (guarantor: GuarantorUser) => void
  onDeleteGuarantor?: (guarantor: GuarantorUser) => void
}

const roleIcons: Record<UserRole, React.ElementType> = {
  manager: Building2,
  assistant_manager: Building2,
  accountant: TrendingUp,
  cashier: DollarSign,
  collection_agent: Users,
  guarantor: Shield,
}

const emptyMessages: Record<UserRole, string> = {
  manager: 'No manager assigned yet',
  assistant_manager: 'No assistant branch manager added yet',
  accountant: 'No accountants added yet',
  cashier: 'No cashiers added yet',
  collection_agent: 'No collection agents assigned yet',
  guarantor: 'No guarantors associated with this branch',
}

export function RoleUserList({
  open,
  onClose,
  title,
  role,
  staff,
  guarantors,
  branchId,
  onAddUser,
  onEditUser,
  onDeleteUser,
  onViewUser,
  onBlockUser,
  onUnblockUser,
  onViewGuarantor,
  onEditGuarantor,
  onDeleteGuarantor,
}: RoleUserListProps) {
  const [search, setSearch] = useState('')

  const Icon = roleIcons[role]
  const isGuarantor = role === 'guarantor'
  const data = isGuarantor ? guarantors : staff
  const filteredData = data.filter((item): item is GuarantorUser | StaffUser => {
    // First filter by role for staff (guarantors are handled separately)
    if (!isGuarantor) {
      const s = item as StaffUser
      if (s.roleInBranch !== role) return false
    }
    
    const searchLower = search.toLowerCase()
    if (isGuarantor) {
      const g = item as GuarantorUser
      return g.name.toLowerCase().includes(searchLower) ||
             g.code.toLowerCase().includes(searchLower) ||
             g.phone.includes(searchLower)
    }
    const s = item as StaffUser
    return s.name.toLowerCase().includes(searchLower) ||
           s.username.toLowerCase().includes(searchLower) ||
           s.roleInBranch.toLowerCase().includes(searchLower)
  })

  if (!open) return null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="w-full max-w-4xl rounded-[1.75rem] bg-white shadow-xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <Icon className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
              <p className="text-sm text-gray-500">{filteredData.length} {filteredData.length === 1 ? 'member' : 'members'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onAddUser && (
              <Button
                onClick={() => onAddUser(branchId, role)}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                Add
              </Button>
            )}
            <button
              onClick={onClose}
              className="h-10 w-10 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-5 pb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by name, username, code, phone..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10 w-full"
            />
          </div>
        </div>

        {/* List */}
        <AnimatePresence mode="popLayout">
          <motion.div
            key={search}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="flex-1 overflow-y-auto px-5 pb-5"
          >
            {filteredData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <Icon className="h-16 w-16 text-gray-300 mb-4" />
                <p className="text-gray-500 text-lg">{emptyMessages[role]}</p>
                <p className="text-sm text-gray-400 mt-1">Click "Add" to create a new {title.toLowerCase()}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredData.map((item, index) => (
                  <motion.div
                    key={isGuarantor ? (item as GuarantorUser).guarantorId : (item as StaffUser).userId}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex items-center justify-between rounded-xl border border-gray-100 bg-white p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                      <div className="h-10 w-10 shrink-0 rounded-xl bg-gray-100 flex items-center justify-center">
                        <User className="h-5 w-5 text-gray-500" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-gray-900 truncate">
                            {isGuarantor ? (item as GuarantorUser).name : (item as StaffUser).name}
                          </p>
                          {!isGuarantor && (
                            <BranchRoleBadge role={(item as StaffUser).roleInBranch} size="sm" />
                          )}
                          {!isGuarantor && (item as StaffUser).isBlocked && (
                            <Badge variant="destructive" className="text-xs">
                              <Lock className="h-3 w-3 mr-1" />
                              Blocked
                            </Badge>
                          )}
                          {isGuarantor && (
                            <Badge variant="secondary" className="text-xs">
                              {(item as GuarantorUser).code}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                          {!isGuarantor && (
                            <span className="truncate">@{(item as StaffUser).username}</span>
                          )}
                          <span>
                            {isGuarantor
                              ? formatINR((item as GuarantorUser).commissionEarned)
                              : (item as StaffUser).permissions.length > 0
                              ? `${(item as StaffUser).permissions.length} permissions`
                              : 'No permissions'}
                          </span>
                        </div>
                      </div>
                    </div>

<div className="flex items-center gap-2 shrink-0">
                        {!isGuarantor && onViewUser && (
                          <button
                            onClick={() => onViewUser?.(item as StaffUser)}
                            className="h-8 w-8 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                            aria-label="View details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        )}
                        {!isGuarantor && onEditUser && (
                          <button
                            onClick={() => onEditUser?.(item as StaffUser)}
                            className="h-8 w-8 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                            aria-label="Edit"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                        )}
                        {isGuarantor && onViewGuarantor && (
                          <button
                            onClick={() => onViewGuarantor?.(item as GuarantorUser)}
                            className="h-8 w-8 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                            aria-label="View details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        )}
                        {isGuarantor && onEditGuarantor && (
                          <button
                            onClick={() => onEditGuarantor?.(item as GuarantorUser)}
                            className="h-8 w-8 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                            aria-label="Edit"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                        )}
                        {!isGuarantor && (item as StaffUser).isBlocked && onUnblockUser && (
                        <button
                          onClick={() => onUnblockUser?.(item as StaffUser)}
                          className="h-8 w-8 rounded-xl text-green-400 hover:text-green-600 hover:bg-green-50 transition-colors"
                          aria-label="Unblock"
                        >
                          <LockOpen className="h-4 w-4" />
                        </button>
                      )}
                      {!isGuarantor && !(item as StaffUser).isBlocked && onBlockUser && (
                        <button
                          onClick={() => onBlockUser?.(item as StaffUser)}
                          className="h-8 w-8 rounded-xl text-orange-400 hover:text-orange-600 hover:bg-orange-50 transition-colors"
                          aria-label="Block"
                        >
                          <Lock className="h-4 w-4" />
                        </button>
                      )}
                      {isGuarantor && onDeleteGuarantor && (
                        <button
                          onClick={() => onDeleteGuarantor?.(item as GuarantorUser)}
                          className="h-8 w-8 rounded-xl text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          aria-label="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                      {!isGuarantor && onDeleteUser && (
                        <button
                          onClick={() => onDeleteUser?.((item as StaffUser).userId)}
                          className="h-8 w-8 rounded-xl text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          aria-label="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </motion.div>
  )
}