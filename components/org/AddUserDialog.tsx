'use client'

import { useState, useEffect, FormEvent } from 'react'
import { motion } from 'framer-motion'
import { X, User, Shield, Mail, Lock, Building2, UserPlus, Eye, EyeOff, BadgeCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { APP_CONFIG } from '@/lib/config'
import { formatCurrency } from '@/lib/utils'

interface AddUserDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (data: AddUserData) => Promise<void>
  branches: Array<{ branchId: string; name: string }>
  prefilledBranchId?: string
  prefilledRole?: string
  loading?: boolean
  /** Saved role defaults (null until the Admin saves the Role defaults table) */
  roleDefaults?: Record<string, string[]> | null
  editingUser?: {
    userId: string
    username: string
    name: string
    email: string
    phone: string
    branchId: string
    branchRole: string
    permissions: string[]
    bloodGroup: string
    emergencyContact: string
    place: string
  } | null
  isLoading?: boolean
}

interface AddUserData {
  username: string
  password: string
  name: string
  email: string
  phone: string
  branchId: string
  branchRole: string
  permissions: string[]
  bloodGroup: string
  emergencyContact: string
  place: string
}

export function AddUserDialog({
  open,
  onClose,
  onSubmit,
  branches,
  prefilledBranchId,
  prefilledRole,
  loading,
  roleDefaults = null,
  editingUser,
  isLoading,
}: AddUserDialogProps) {
  const isEditing = editingUser !== null
  const [formData, setFormData] = useState<AddUserData>({
    username: '',
    password: '',
    name: '',
    email: '',
    phone: '',
    branchId: '',
    branchRole: 'collection_agent',
    permissions: [],
    bloodGroup: '',
    emergencyContact: '',
    place: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(true)

  // Update branchId and branchRole when prefilled props change
  useEffect(() => {
    if (prefilledBranchId) {
      setFormData(prev => ({ ...prev, branchId: prefilledBranchId }))
    }
    if (prefilledRole) {
      setFormData(prev => ({ ...prev, branchRole: prefilledRole }))
    }
  }, [prefilledBranchId, prefilledRole])

  // Populate form when editingUser changes
  useEffect(() => {
    if (editingUser) {
      setShowSuggestions(false) // Disable auto-fill when editing to preserve actual permissions
      setFormData({
        username: editingUser.username,
        password: '', // Password optional when editing
        name: editingUser.name,
        email: editingUser.email,
        phone: editingUser.phone,
        branchId: editingUser.branchId,
        branchRole: editingUser.branchRole,
        permissions: editingUser.permissions,
        bloodGroup: editingUser.bloodGroup,
        emergencyContact: editingUser.emergencyContact,
        place: editingUser.place,
      })
    }
  }, [editingUser])

  // Update suggested permissions when branchRole changes (only for new users)
  useEffect(() => {
    if (!showSuggestions || isEditing || roleDefaults) return
    const branchRoleConfig = APP_CONFIG.BRANCH_ROLES?.find(r => r.key === formData.branchRole)
    if (branchRoleConfig) {
      setFormData(prev => ({ ...prev, permissions: [...branchRoleConfig.suggestedPermissions] }))
    }
  }, [formData.branchRole, showSuggestions, isEditing])

  const handleChange = (field: keyof AddUserData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  // With saved role defaults a feature is: Default (from the role), Extra (ticked for this person only) or Removed (a default taken away: stored as `-key`)
  const roleHas = (key: string) => !!roleDefaults && (roleDefaults[formData.branchRole] || []).includes(key)
  const featureState = (key: string): 'default' | 'extra' | 'removed' | 'off' => {
    const p = formData.permissions
    if (roleHas(key)) return p.includes(`-${key}`) ? 'removed' : 'default'
    return p.includes(key) ? 'extra' : 'off'
  }
  const toggleFeature = (key: string) => {
    const st = featureState(key)
    setFormData(prev => {
      const rest = prev.permissions.filter(x => x !== key && x !== `-${key}`)
      if (st === 'default') return { ...prev, permissions: [...rest, `-${key}`] }
      if (st === 'removed') return { ...prev, permissions: rest }
      if (st === 'extra') return { ...prev, permissions: rest }
      return { ...prev, permissions: [...rest, key] }
    })
  }

  const handlePermissionChange = (permission: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      permissions: checked
        ? [...prev.permissions, permission]
        : prev.permissions.filter(p => p !== permission),
    }))
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (loading) return

    // Validate required fields
    if (!formData.username || !formData.name) {
      alert('Username and name are required')
      return
    }

    // Password required only for new users
    if (!isEditing && !formData.password) {
      alert('Password is required')
      return
    }

    if (!formData.branchId) {
      alert('Branch is required')
      return
    }

    if (!formData.branchRole) {
      alert('Branch Role is required')
      return
    }

    await onSubmit(formData)
    onClose()
    resetForm()
  }

  const resetForm = () => {
    setFormData({
      username: '',
      password: '',
      name: '',
      email: '',
      phone: '',
      branchId: '',
      branchRole: 'collection_agent',
      permissions: [],
      bloodGroup: '',
      emergencyContact: '',
      place: '',
    })
    setShowPassword(false)
    setShowSuggestions(true)
  }

if (!open) return null

  const branchRoleConfig = APP_CONFIG.BRANCH_ROLES?.find(r => r.key === formData.branchRole)
  const isLoadingDialog = isLoading || loading

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="w-full max-w-2xl rounded-[1.75rem] bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <UserPlus className="h-5 w-5 text-blue-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">{isEditing ? 'Edit User' : 'Add New User'}</h2>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {isLoadingDialog && (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-3">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              <span className="text-sm text-gray-600">{isEditing ? 'Loading user data...' : 'Loading...'}</span>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Account Info */}
          <div className="rounded-xl bg-gray-50 p-4 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Account Information
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="username" className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                  Username *
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="username"
                    value={formData.username}
                    onChange={e => handleChange('username', e.target.value)}
                    placeholder="Unique username"
                    className="pl-10"
                    required
                    disabled={loading || isEditing}
                    data-no-upper
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                  {isEditing ? 'Password (optional)' : 'Password *'}
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={e => handleChange('password', e.target.value)}
                    placeholder={isEditing ? 'Leave blank to keep current' : 'Strong password'}
                    className="pl-10 pr-10"
                    required={!isEditing}
                    disabled={loading}
                    data-no-upper
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <Label htmlFor="name" className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                  Full Name *
                </Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={e => handleChange('name', e.target.value)}
                  placeholder="Full name"
                  required
                  disabled={loading}
                />
              </div>
              <div>
                <Label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                  Email
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={e => handleChange('email', e.target.value)}
                    placeholder="user@ngf.com"
                    className="pl-10"
                    disabled={loading}
                    data-no-upper
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="phone" className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                  Phone
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={e => handleChange('phone', e.target.value)}
                  placeholder="+91 98765 43210"
                  disabled={loading}
                  data-no-upper
                />
              </div>
            </div>
          </div>

          {/* Branch Assignment */}
          {branches.length > 0 && (
            <div className="rounded-xl bg-gray-50 p-4 space-y-4">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Branch Assignment
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                    Branch *
                  </Label>
                  <Select
                    value={formData.branchId}
                    onValueChange={value => handleChange('branchId', value)}
                    disabled={loading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map(b => (
                        <SelectItem key={b.branchId} value={b.branchId}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                    Branch Role *
                  </Label>
                  <Select
                    value={formData.branchRole}
                    onValueChange={value => handleChange('branchRole', value)}
                    disabled={loading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      {APP_CONFIG.BRANCH_ROLES?.map(r => (
                        <SelectItem key={r.key} value={r.key}>
                          <div>
                            <p className="font-medium">{r.label}</p>
                            <p className="text-xs text-gray-500">{r.description}</p>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Suggested Permissions */}
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-gray-500" />
                    <span className="text-sm font-medium text-gray-700">Suggested Permissions</span>
                    {branchRoleConfig && (
                      <span className="text-xs text-gray-500">({branchRoleConfig.description})</span>
                    )}
                  </div>
                  <Label className="flex items-center gap-2 cursor-pointer text-xs text-gray-500 hover:text-gray-700">
                    <Checkbox
                      checked={showSuggestions}
                      onCheckedChange={(checked) => setShowSuggestions(checked === true)}
                      className="h-4 w-4"
                    />
                    Auto-fill suggestions
                  </Label>
                </div>
                <div className="flex flex-wrap gap-2">
                  {APP_CONFIG.STAFF_FEATURES.map(f => {
                    if (roleDefaults) {
                      const st = featureState(f.key)
                      const on = st === 'default' || st === 'extra'
                      const tag = st === 'default' ? 'Default' : st === 'extra' ? 'Extra' : st === 'removed' ? 'Removed' : ''
                      return (
                        <button key={f.key} type="button" disabled={loading} aria-pressed={on}
                          onClick={() => toggleFeature(f.key)}
                          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${on ? (st === 'extra' ? 'border-blue-600 bg-blue-600 text-white' : 'border-green-600 bg-green-600 text-white') : st === 'removed' ? 'border-red-200 bg-red-50 text-red-600 line-through' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>
                          {on ? '✓ ' : ''}{f.label}{tag && <span className="ml-1.5 text-[10px] font-bold uppercase opacity-80">{tag}</span>}
                        </button>
                      )
                    }
                    const on = formData.permissions.includes(f.key)
                    return (
                      <button key={f.key} type="button" disabled={loading} aria-pressed={on}
                        onClick={() => handlePermissionChange(f.key, !on)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${on ? 'border-green-600 bg-green-600 text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>
                        {on ? '✓ ' : ''}{f.label}
                      </button>
                    )
                  })}
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  {roleDefaults ? 'Green = from the role. Blue = extra for this person. Red = taken away from this person. Click to change, then save.' : 'Green with a tick = this person has it. Click to switch it off (blank) or on, then save.'}
                </p>
              </div>
            </div>
          )}

          {/* ID Card Details */}
          <div className="rounded-xl bg-gray-50 p-4 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <BadgeCheck className="h-4 w-4" />
              ID Card Details (Optional)
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="bloodGroup" className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                  Blood Group
                </Label>
                <Input
                  id="bloodGroup"
                  value={formData.bloodGroup}
                  onChange={e => handleChange('bloodGroup', e.target.value)}
                  placeholder="e.g., O+, A-"
                  disabled={loading}
                />
              </div>
              <div>
                <Label htmlFor="emergencyContact" className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                  Emergency Contact
                </Label>
                <Input
                  id="emergencyContact"
                  value={formData.emergencyContact}
                  onChange={e => handleChange('emergencyContact', e.target.value)}
                  placeholder="Name - Phone"
                  disabled={loading}
                  data-no-upper
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="place" className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                  Place
                </Label>
                <Input
                  id="place"
                  value={formData.place}
                  onChange={e => handleChange('place', e.target.value)}
                  placeholder="City/Place"
                  disabled={loading}
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2 border-t border-gray-100">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={loading}
              className="flex-1 sm:flex-none"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="flex-1 sm:flex-none"
            >
              {loading ? (isEditing ? 'Updating...' : 'Creating...') : (isEditing ? 'Update User' : 'Create User')}
            </Button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )
}