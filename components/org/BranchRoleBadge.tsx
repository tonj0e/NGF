'use client'

import { Briefcase, Calculator, Landmark, Users, Shield } from 'lucide-react'

export type BranchRole = 'manager' | 'accountant' | 'cashier' | 'collection_agent' | 'guarantor'

interface BranchRoleBadgeProps {
  role: BranchRole
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
}

const roleConfig: Record<BranchRole, { label: string; description: string; icon: React.ElementType; color: string }> = {
  manager: {
    label: 'Manager',
    description: 'Branch oversight',
    icon: Briefcase,
    color: 'bg-blue-100 text-blue-700',
  },
  accountant: {
    label: 'Accountant',
    description: 'Financial records',
    icon: Calculator,
    color: 'bg-green-100 text-green-700',
  },
  cashier: {
    label: 'Cashier',
    description: 'Cash and receipts',
    icon: Landmark,
    color: 'bg-amber-100 text-amber-700',
  },
  collection_agent: {
    label: 'Collection Agent',
    description: 'Assigned collections',
    icon: Users,
    color: 'bg-purple-100 text-purple-700',
  },
  guarantor: {
    label: 'Guarantor',
    description: 'Associated guarantor',
    icon: Shield,
    color: 'bg-indigo-100 text-indigo-700',
  },
}

export function BranchRoleBadge({ role, size = 'md', showLabel = true }: BranchRoleBadgeProps) {
  const config = roleConfig[role]
  if (!config) return null

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
    lg: 'px-4 py-1.5 text-base',
  }

  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  }

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium ${config.color} ${sizeClasses[size]}`}>
      <config.icon className={iconSizes[size]} aria-hidden="true" />
      {showLabel && <span>{config.label}</span>}
    </span>
  )
}

export function BranchRoleConfig({ role }: { role: BranchRole }) {
  return roleConfig[role] || null
}