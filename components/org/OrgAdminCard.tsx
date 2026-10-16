'use client'

import { User, Shield, Building2, Mail, BadgeCheck } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { formatCurrency } from '@/lib/utils'

interface OrgAdminCardProps {
  admin: {
    userId: string
    name: string
    email: string
    role: 'Admin'
    avatarUrl?: string
    cardNumber?: string
  }
}

export function OrgAdminCard({ admin }: OrgAdminCardProps) {
  const initials = admin.name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <div className="rounded-[1.75rem] border border-white/70 bg-white p-5 shadow-panel">
      <div className="flex items-start gap-4">
        <div className="relative flex-shrink-0">
          <Avatar className="h-20 w-20">
            <AvatarImage src={admin.avatarUrl} alt={admin.name} />
            <AvatarFallback className="text-2xl font-bold">{initials}</AvatarFallback>
          </Avatar>
          <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-blue-600 text-white flex items-center justify-center">
            <Shield className="h-3.5 w-3.5" />
          </div>
        </div>

        <div className="flex-1 min-w-0 pt-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-bold text-gray-900 truncate">{admin.name}</h2>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 text-blue-700 px-3 py-1 text-sm font-semibold">
              <BadgeCheck className="h-3.5 w-3.5" />
              Organization Admin
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">NGF FINCORP</p>

          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2 text-gray-600">
              <Mail className="h-4 w-4 text-gray-400 shrink-0" />
              <span className="truncate">{admin.email || 'No email'}</span>
            </div>
            {admin.cardNumber && (
              <div className="flex items-center gap-2 text-gray-600">
                <BadgeCheck className="h-4 w-4 text-gray-400 shrink-0" />
                <span>ID: {admin.cardNumber}</span>
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
            <Building2 className="h-3.5 w-3.5 shrink-0" />
            <span>Organization-wide access</span>
          </div>
        </div>
      </div>
    </div>
  )
}