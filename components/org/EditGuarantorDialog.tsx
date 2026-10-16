'use client'

import { useState, useEffect, FormEvent } from 'react'
import { motion } from 'framer-motion'
import { X, User, Phone, Mail, MapPin, Shield, Lock, Eye, EyeOff } from 'lucide-react'
import { validatePasswordPolicy, PASSWORD_RULES_TEXT } from '@/lib/passwordPolicy'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

interface GuarantorData {
  guarantorId: string
  userId: string
  username?: string
  name: string
  code: string
  phone: string
  address: string
  status: string
  commissionEarned: number
}

interface EditGuarantorDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (data: EditGuarantorData) => Promise<void>
  guarantor: GuarantorData | null
  loading?: boolean
}

interface EditGuarantorData {
  guarantorId: string
  userId: string
  username: string
  name: string
  code: string
  phone: string
  address: string
  status: string
  password?: string
}

export function EditGuarantorDialog({
  open,
  onClose,
  onSubmit,
  guarantor,
  loading,
}: EditGuarantorDialogProps) {
  const [formData, setFormData] = useState<EditGuarantorData>(() => {
    if (guarantor) {
      return {
        guarantorId: guarantor.guarantorId,
        userId: guarantor.userId,
        username: guarantor.username || '',
        name: guarantor.name,
        code: guarantor.code,
        phone: guarantor.phone || '',
        address: guarantor.address || '',
        status: guarantor.status || 'Active',
      }
    }
    return {
      guarantorId: '',
      userId: '',
      username: '',
      name: '',
      code: '',
      phone: '',
      address: '',
      status: 'Active',
    }
  })

  useEffect(() => {
    if (guarantor) {
      setFormData({
        guarantorId: guarantor.guarantorId,
        userId: guarantor.userId,
        username: guarantor.username || '',
        name: guarantor.name,
        code: guarantor.code,
        phone: guarantor.phone || '',
        address: guarantor.address || '',
        status: guarantor.status || 'Active',
      })
    }
  }, [guarantor])

  const [newPassword, setNewPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [usernameError, setUsernameError] = useState('')

  useEffect(() => {
    setNewPassword('')
    setShowPassword(false)
    setPasswordError('')
    setUsernameError('')
  }, [guarantor])

  const handleChange = (field: keyof EditGuarantorData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (loading) return

    if (!formData.name || !formData.code) {
      alert('Name and Code are required')
      return
    }

    const username = formData.username.trim()
    if (username.length < 3 || /\s/.test(username)) {
      setUsernameError('Username must be at least 3 characters with no spaces')
      return
    }
    setUsernameError('')

    if (newPassword) {
      const policyError = validatePasswordPolicy(newPassword, { username })
      if (policyError) {
        setPasswordError(policyError)
        return
      }
    }
    setPasswordError('')

    const payload = { ...formData, username }
    await onSubmit(newPassword ? { ...payload, password: newPassword } : payload)
  }

  if (!open || !guarantor) return null

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
        className="w-full max-w-lg rounded-[1.75rem] bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-indigo-100 flex items-center justify-center">
              <Shield className="h-5 w-5 text-indigo-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Edit Guarantor</h2>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-3">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
              <span className="text-sm text-gray-600">Saving...</span>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Guarantor Info */}
          <div className="rounded-xl bg-gray-50 p-4 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Guarantor Information
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
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
                <Label htmlFor="username" className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                  Username (used to log in) *
                </Label>
                <Input
                  id="username"
                  value={formData.username}
                  onChange={e => { handleChange('username', e.target.value); setUsernameError('') }}
                  placeholder="e.g. NAME@NGFCODE"
                  autoComplete="off"
                  disabled={loading}
                  data-no-upper
                />
                {usernameError && (
                  <p className="mt-1 text-xs text-red-600" role="alert">{usernameError}</p>
                )}
              </div>
              <div>
                <Label htmlFor="code" className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                  Guarantor Code *
                </Label>
                <Input
                  id="code"
                  value={formData.code}
                  onChange={e => handleChange('code', e.target.value)}
                  placeholder="e.g., GRV"
                  required
                  disabled={loading}
                  data-no-upper
                />
              </div>
              <div>
                <Label htmlFor="phone" className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                  Phone
                </Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={e => handleChange('phone', e.target.value)}
                    placeholder="+91 98765 43210"
                    className="pl-10"
                    disabled={loading}
                    data-no-upper
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="status" className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                  Status *
                </Label>
                <Select
                  value={formData.status}
                  onValueChange={value => handleChange('status', value)}
                  disabled={loading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Inactive">Inactive</SelectItem>
                    <SelectItem value="Suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Password */}
          <div className="rounded-xl bg-gray-50 p-4 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Change Password
            </h3>
            <div>
              <Label htmlFor="newPassword" className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                New Password (optional)
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="newPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={e => { setNewPassword(e.target.value); setPasswordError('') }}
                  placeholder="Leave blank to keep current password"
                  className="pl-10 pr-10"
                  autoComplete="new-password"
                  disabled={loading}
                  data-no-upper
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {passwordError ? (
                <p className="mt-1 text-xs text-red-600" role="alert">{passwordError}</p>
              ) : (
                <p className="mt-1 text-xs text-gray-500">
                  {PASSWORD_RULES_TEXT} Changing it signs the guarantor out of all devices.
                </p>
              )}
            </div>
          </div>

          {/* Address */}
          <div className="rounded-xl bg-gray-50 p-4 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Address
            </h3>
            <div>
              <Label htmlFor="address" className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                Address
              </Label>
              <Textarea
                id="address"
                value={formData.address}
                onChange={e => handleChange('address', e.target.value)}
                placeholder="Full address"
                rows={3}
                disabled={loading}
              />
            </div>
          </div>

          {/* Read-only info */}
          <div className="rounded-xl bg-gray-50 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <User className="h-4 w-4" />
              System Information (Read-only)
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 text-xs">
              <div>
                <p className="text-gray-500">Guarantor ID</p>
                <p className="font-mono text-gray-900">{guarantor.guarantorId}</p>
              </div>
              <div>
                <p className="text-gray-500">User ID</p>
                <p className="font-mono text-gray-900">{guarantor.userId}</p>
              </div>
              <div>
                <p className="text-gray-500">Commission Earned</p>
                <p className="font-mono text-green-700">₹{guarantor.commissionEarned.toLocaleString('en-IN')}</p>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              These fields are managed automatically and cannot be edited.
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2 border-t border-gray-100">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={loading}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="flex-1"
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )
}