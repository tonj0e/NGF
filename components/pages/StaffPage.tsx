'use client'

import { useEffect, useRef, useState } from 'react'
import { Session } from '@/types'
import { motion } from 'framer-motion'
import { Plus, Building2, User, Shield, RefreshCw } from 'lucide-react'
import { OrgAdminCard } from '@/components/org/OrgAdminCard'
import { BranchCard } from '@/components/org/BranchCard'
import { AddBranchDialog } from '@/components/org/AddBranchDialog'
import { AddUserDialog } from '@/components/org/AddUserDialog'
import { APP_CONFIG } from '@/lib/config'
import { EditGuarantorDialog } from '@/components/org/EditGuarantorDialog'
import { RoleUserList } from '@/components/org/RoleUserList'
import { Button } from '@/components/ui/button'

type BranchRole = 'manager' | 'assistant_manager' | 'accountant' | 'cashier' | 'collection_agent' | 'guarantor'

interface OrgHierarchyData {
  organizationAdmin: {
    userId: string
    name: string
    email: string
    role: 'Admin'
    avatarUrl?: string
    cardNumber?: string
  } | null
  branches: Array<{
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
      userId?: string
      name: string
      code: string
      phone: string
      commissionEarned: number
    }>
  }>
}

export default function StaffPage({ session }: { session: Session }) {
  const [data, setData] = useState<OrgHierarchyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Dialog states
  const [addBranchOpen, setAddBranchOpen] = useState(false)
  const [addUserOpen, setAddUserOpen] = useState(false)
  const [addUserPrefilledBranch, setAddUserPrefilledBranch] = useState<string | undefined>()
  const [addUserPrefilledRole, setAddUserPrefilledRole] = useState<string | undefined>()
  const [editingUser, setEditingUser] = useState<{
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
  } | null>(null)
  const [isLoadingEdit, setIsLoadingEdit] = useState(false)

  // Role user list states
  const [roleListOpen, setRoleListOpen] = useState<{
    open: boolean
    title: string
    role: BranchRole
    branchId: string
  } | null>(null)

  // Guarantor edit dialog states
  const [editingGuarantor, setEditingGuarantor] = useState<{
    guarantorId: string
    userId: string
    username?: string
    name: string
    code: string
    phone: string
    address: string
    status: string
    commissionEarned: number
    branchId?: string
    permissions?: string[]
  } | null>(null)
  const [editGuarantorLoading, setEditGuarantorLoading] = useState(false)

  const [toast, setToast] = useState<string | null>(null)
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast(message)
    setTimeout(() => setToast(null), 3000)
  }

  // Loading states
  const [branchActionsLoading, setBranchActionsLoading] = useState<Record<string, boolean>>({})
  const [userActionsLoading, setUserActionsLoading] = useState<Record<string, boolean>>({})

  const loadedOnce = useRef(false)
  async function loadData() {
    if (!loadedOnce.current) setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/branches/org-hierarchy', {
        headers: { Authorization: `Bearer ${session.token}` },
      })
      const json = await res.json()
      if (json.success) {
        setData(json.data)
      } else {
        setError(json.error || 'Failed to load organization hierarchy')
      }
    } catch (err) {
      setError('Failed to load organization hierarchy')
    } finally {
      loadedOnce.current = true
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [session.token])

  async function handleAddBranch(name: string) {
    setBranchActionsLoading(prev => ({ ...prev, addBranch: true }))
    try {
      const res = await fetch('/api/branches', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'addBranch', name }),
      })
      const json = await res.json()
      if (json.success) {
        showToast('Branch created successfully')
        await loadData()
      } else {
        showToast(json.error || 'Failed to create branch', 'error')
      }
    } catch {
      showToast('Failed to create branch', 'error')
    } finally {
      setBranchActionsLoading(prev => ({ ...prev, addBranch: false }))
      setAddBranchOpen(false)
    }
  }

  async function handleAddUser(userData: any) {
    setUserActionsLoading(prev => ({ ...prev, addUser: true }))
    try {
      const isEditing = editingUser !== null
      const method = isEditing ? 'PATCH' : 'POST'
      const url = '/api/staff'
      const body: any = {
        username: userData.username,
        role: 'Staff',
        name: userData.name,
        email: userData.email,
        phone: userData.phone,
        branchId: userData.branchId,
        branchRole: userData.branchRole,
        permissions: userData.permissions,
      }
      if (!isEditing) {
        body.password = userData.password
      } else if (userData.password) {
        body.password = userData.password
      }
      if (isEditing) {
        body.userId = editingUser.userId
      }

      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || (isEditing ? 'Failed to update user' : 'Failed to create user'))

      showToast(isEditing ? 'User updated successfully' : 'User created successfully')
      setEditingUser(null)
      await loadData()
    } catch (err: any) {
      showToast(err.message || (editingUser ? 'Failed to update user' : 'Failed to create user'), 'error')
    } finally {
      setUserActionsLoading(prev => ({ ...prev, addUser: false }))
      setAddUserOpen(false)
    }
  }

  async function handleEditUser(user: {
    userId: string
    username: string
    name: string
    roleInBranch: string
    permissions: string[]
    isActive: boolean
  }) {
    // Find the branch for this user
    const branch = data?.branches.find(b => b.staff.some(s => s.userId === user.userId))
    if (!branch) return

    setIsLoadingEdit(true)
    
    // Fetch full user data (email, phone) from the users table
    try {
      const res = await fetch('/api/staff', {
        headers: { Authorization: `Bearer ${session.token}` },
      })
      const json = await res.json()
      if (!json.success) throw new Error('Failed to fetch user data')
      
      const fullUser = json.data.staff.find((u: any) => u.userId === user.userId)
      if (!fullUser) throw new Error('User not found')

      setEditingUser({
        userId: user.userId,
        username: fullUser.username,
        name: fullUser.name,
        email: fullUser.email,
        phone: fullUser.phone || '',
        branchId: branch.branchId,
        branchRole: user.roleInBranch,
        permissions: user.permissions,
        bloodGroup: '',
        emergencyContact: '',
        place: '',
      })
      setRoleListOpen(null)
      // Allow time for the editingUser effect to populate formData before opening dialog
      await new Promise(r => setTimeout(r, 50))
      setAddUserOpen(true)
    } catch (err: any) {
      showToast(err.message || 'Failed to load user data for editing', 'error')
    } finally {
      setIsLoadingEdit(false)
    }
  }

  async function handleDeleteUser(userId: string) {
    if (!confirm('Delete this user? This cannot be undone.')) return
    setUserActionsLoading(prev => ({ ...prev, [`delete:${userId}`]: true }))
    try {
      const res = await fetch('/api/staff', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
const json = await res.json()
      if (json.success) {
        showToast('User deleted successfully')
        await loadData()
      } else {
        showToast(json.error || 'Failed to delete user', 'error')
      }
    } catch {
      showToast('Failed to delete user', 'error')
} finally {
      setUserActionsLoading(prev => ({ ...prev, [`delete:${userId}`]: false }))
    }
  }

  async function handleDeleteBranch(branchId: string) {
    if (!confirm('Delete this branch? All staff assignments will be removed.')) return
    setBranchActionsLoading(prev => ({ ...prev, [`delete:${branchId}`]: true }))
    try {
      const res = await fetch('/api/branches', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteBranch', branchId }),
      })
      const json = await res.json()
if (json.success) {
        showToast('Branch deleted')
        await loadData()
      } else {
        showToast(json.error || 'Failed to delete branch', 'error')
      }
    } catch {
      showToast('Failed to delete branch', 'error')
} finally {
      setBranchActionsLoading(prev => ({ ...prev, [`delete:${branchId}`]: false }))
    }
  }

  async function handleBlockUser(user: {
    userId: string
    username: string
    name: string
    roleInBranch: string
  }) {
    // Close the role list modal first so it can be reopened with fresh data
    setRoleListOpen(null)

    const reason = prompt('Enter reason for blocking:')
    if (!reason) return

    const duration = prompt('Enter duration (1h, 24h, 7d, 30d, permanent, or custom):', '24h')
    if (!duration) return

    let endDateTime = ''
    if (duration === 'custom') {
      const customDate = prompt('Enter end date/time (YYYY-MM-DDTHH:MM):')
      if (!customDate) return
    }

    setUserActionsLoading(prev => ({ ...prev, [`block:${user.userId}`]: true }))
    try {
      const res = await fetch('/api/staff/block', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.userId, duration, endDateTime: duration === 'custom' ? prompt('Enter end date/time (YYYY-MM-DDTHH:MM):') : '', reason }),
      })
      const json = await res.json()
      if (json.success) {
        showToast(json.message || 'User blocked successfully')
        await loadData()
      } else {
        showToast(json.error || 'Failed to block user', 'error')
      }
    } catch {
      showToast('Failed to block user', 'error')
    } finally {
      setUserActionsLoading(prev => ({ ...prev, [`block:${user.userId}`]: false }))
    }
  }

  async function handleUnblockUser(user: {
    userId: string
    username: string
    name: string
    roleInBranch: string
  }) {
    // Close the role list modal first
    setRoleListOpen(null)

    if (!confirm(`Unblock ${user.name} (@${user.username})?`)) return

    setUserActionsLoading(prev => ({ ...prev, [`unblock:${user.userId}`]: true }))
    try {
      const res = await fetch('/api/staff/block', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.userId }),
      })
      const json = await res.json()
      if (json.success) {
        showToast('User unblocked successfully')
        await loadData()
      } else {
        showToast(json.error || 'Failed to unblock user', 'error')
      }
    } catch {
      showToast('Failed to unblock user', 'error')
    } finally {
      setUserActionsLoading(prev => ({ ...prev, [`unblock:${user.userId}`]: false }))
    }
  }

  async function handleViewGuarantor(guarantor: {
    guarantorId: string
    name: string
    code: string
    phone: string
    commissionEarned: number
  }) {
    // Close the role list modal first
    setRoleListOpen(null)

    // Fetch full guarantor details from the staff API (includes userId, status, address, etc.)
    try {
      const res = await fetch('/api/staff', {
        headers: { Authorization: `Bearer ${session.token}` },
      })
      const json = await res.json()
      if (!json.success) throw new Error('Failed to fetch guarantor data')
      
      const fullGuarantor = json.data.guarantors.find((g: any) => g.guarantorId === guarantor.guarantorId)
      if (!fullGuarantor) throw new Error('Guarantor not found')

      // Navigate to Guarantors page with this guarantor selected
      // We'll use a toast to indicate the action, and the user can go to Guarantors page to view details
      showToast(`View details for ${fullGuarantor.name} (${fullGuarantor.code}) - Go to Guarantors page for full details`)
      
      // TODO: In a future enhancement, we could open a detail modal here or navigate to Guarantors page
      // For now, the Guarantors page already shows full details with View action
    } catch (err: any) {
      showToast(err.message || 'Failed to load guarantor details', 'error')
    }
  }

  async function handleEditGuarantor(guarantor: {
    guarantorId: string
    name: string
    code: string
    phone: string
    commissionEarned: number
  }) {
    // Remember which branch this guarantor was opened from, then close the role list modal
    const fromBranchId = roleListOpen?.branchId || ''
    setRoleListOpen(null)

    // Fetch full guarantor details including userId for editing
    try {
      const res = await fetch('/api/staff', {
        headers: { Authorization: `Bearer ${session.token}` },
      })
      const json = await res.json()
      if (!json.success) throw new Error('Failed to fetch guarantor data')
      
      const fullGuarantor = json.data.guarantors.find((g: any) => g.guarantorId === guarantor.guarantorId)
      if (!fullGuarantor) throw new Error('Guarantor not found')

      // Username lives on the user record, not the guarantor record
      const linkedUser = (json.data.staff || []).find((u: any) => u.userId === fullGuarantor.userId)

      // Current extra permissions for this guarantor (Admin-only endpoint)
      let perms: string[] = [], accessBranch = ''
      try {
        const ar = await fetch('/api/branches', { headers: { Authorization: `Bearer ${session.token}` } })
        const aj = await ar.json()
        const mine = aj?.data?.access?.find((a: any) => a.userId === fullGuarantor.userId)
        perms = mine?.permissions || []; accessBranch = mine?.branchId || ''
      } catch {}
      // Until an Admin saves a custom list, a guarantor has every page they always had
      if (!perms.includes('pages:custom')) perms = [...perms.filter(k => !k.startsWith('gp:')), ...APP_CONFIG.GUARANTOR_FEATURES.filter(f => f.key.startsWith('gp:')).map(f => f.key)]

      // Open the edit dialog with full guarantor data
      setEditingGuarantor({
        branchId: accessBranch || fromBranchId,
        permissions: perms,
        guarantorId: fullGuarantor.guarantorId,
        userId: fullGuarantor.userId,
        username: linkedUser?.username || '',
        name: fullGuarantor.name,
        code: fullGuarantor.code,
        phone: fullGuarantor.phone || '',
        address: fullGuarantor.address || '',
        status: fullGuarantor.status,
        commissionEarned: fullGuarantor.commissionEarned,
      })
    } catch (err: any) {
      showToast(err.message || 'Failed to load guarantor for editing', 'error')
    }
  }

  async function handleSaveGuarantor(data: {
    guarantorId: string
    userId: string
    username: string
    name: string
    code: string
    phone: string
    address: string
    status: string
    password?: string
    branchId?: string
    permissions: string[]
  }) {
    setEditGuarantorLoading(true)
    try {
      // Use the staff API PATCH endpoint to update guarantor
      const res = await fetch('/api/staff', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: data.userId,
          username: data.username,
          name: data.name,
          phone: data.phone,
          guarantorCode: data.code,
          address: data.address,
          status: data.status,
          ...(data.password ? { password: data.password } : {}),
        }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Failed to update guarantor')

      // Extra permissions live in staff_access (needs a branch)
      const before = [...(editingGuarantor?.permissions || [])].sort().join(',')
      const after = [...data.permissions].sort().join(',')
      if (before !== after) {
        data = { ...data, permissions: Array.from(new Set(['pages:custom', ...data.permissions])) }
        if (!data.branchId) throw new Error('Open this guarantor from a branch to change permissions')
        const pr = await fetch('/api/branches', {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'setAccess', userId: data.userId, branchId: data.branchId, permissions: data.permissions }),
        })
        const pj = await pr.json()
        if (!pj.success) throw new Error(pj.error || 'Could not save permissions')
      }

      showToast('Guarantor updated successfully')
      setEditingGuarantor(null)
      await loadData()
    } catch (err: any) {
      showToast(err.message || 'Failed to update guarantor', 'error')
    } finally {
      setEditGuarantorLoading(false)
    }
  }

  function openRoleList(branchId: string, role: BranchRole, branchName: string) {
    const titles: Record<BranchRole, string> = {
      manager: 'Branch Managers',
      assistant_manager: 'Assistant Branch Managers',
      accountant: 'Accountants',
      cashier: 'Cashiers',
      collection_agent: 'Collection Agents',
      guarantor: 'Guarantors',
    }
    setRoleListOpen({
      open: true,
      title: `${titles[role]} - ${branchName}`,
      role,
      branchId,
    })
  }

  if (loading && !loadedOnce.current) {
    return (
      <div className="space-y-5 animate-pulse">
        <div className="rounded-[1.75rem] border border-white/70 bg-white p-5 h-40"></div>
        <div className="rounded-[1.75rem] border border-white/70 bg-white p-5 h-40"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <Shield className="h-12 w-12 text-gray-300 mb-4" />
        <p className="text-gray-500">{error}</p>
        <Button onClick={loadData} className="mt-4" variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    )
  }

  if (!data) {
    return <div className="flex h-40 items-center justify-center text-gray-400">Failed to load data.</div>
  }

  return (
    <div className="space-y-5">
      {toast && (
        <motion.div
          initial={{ opacity: 0, x: 300, scale: 0.9 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 300, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          className="fixed bottom-4 right-4 z-50 rounded-2xl border p-4 shadow-lg max-w-md bg-green-50 border-green-200 text-green-700"
        >
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <p className="text-sm flex-1">{toast}</p>
            <button onClick={() => setToast(null)} className="ml-4 text-current opacity-50 hover:opacity-100">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </motion.div>
      )}

      {/* Organization Admin Card */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {data.organizationAdmin && (
          <OrgAdminCard admin={data.organizationAdmin} />
        )}
      </motion.div>

      {/* Branches Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Branches
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {data.branches.length} branch{data.branches.length !== 1 ? 'es' : ''}
            </p>
          </div>
          <Button
            onClick={() => setAddBranchOpen(true)}
            disabled={branchActionsLoading.addBranch}
            className="inline-flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Branch
          </Button>
        </div>

        {data.branches.length === 0 ? (
          <div className="rounded-[1.75rem] border border-white/70 bg-white p-8 shadow-panel text-center">
            <Building2 className="mx-auto h-12 w-12 text-gray-300 mb-3" />
            <p className="text-gray-500 mb-2">No branches yet</p>
            <p className="text-sm text-gray-400 mb-4">Create your first branch to start organizing staff</p>
            <Button onClick={() => setAddBranchOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Branch
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {data.branches.map((branch, index) => (
              <motion.div
                key={branch.branchId}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.1 + index * 0.1 }}
              >
                <BranchCard
                  branch={branch}
                  onAddUser={(branchId, role) => {
                    setAddUserPrefilledBranch(branchId)
                    setAddUserPrefilledRole(role)
                    setAddUserOpen(true)
                  }}
                  onAddBranch={() => setAddBranchOpen(true)}
                  onManageStaff={(branchId) => openRoleList(branchId, 'manager', branch.name)}
                  onOpenRoleList={openRoleList}
                />
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Add Branch Dialog */}
      <AddBranchDialog
        open={addBranchOpen}
        onClose={() => setAddBranchOpen(false)}
        onSubmit={handleAddBranch}
        loading={branchActionsLoading.addBranch}
      />

      {/* Add User Dialog */}
      <AddUserDialog
        open={addUserOpen}
        onClose={() => {
          setAddUserOpen(false)
          setAddUserPrefilledBranch(undefined)
          setAddUserPrefilledRole(undefined)
          setEditingUser(null)
        }}
        onSubmit={handleAddUser}
        branches={data.branches}
        prefilledBranchId={addUserPrefilledBranch}
        prefilledRole={addUserPrefilledRole}
        loading={userActionsLoading.addUser}
        editingUser={editingUser}
        isLoading={isLoadingEdit}
      />

      {/* Role User List */}
      {roleListOpen && (
        <RoleUserList
          open={roleListOpen.open}
          onClose={() => setRoleListOpen(null)}
          title={roleListOpen.title}
          role={roleListOpen.role}
          staff={data.branches.find(b => b.branchId === roleListOpen.branchId)?.staff || []}
          guarantors={data.branches.find(b => b.branchId === roleListOpen.branchId)?.guarantors || []}
          branchId={roleListOpen.branchId}
          onAddUser={(branchId, role) => {
            setRoleListOpen(null)
            setAddUserPrefilledBranch(branchId)
            setAddUserPrefilledRole(role)
            setAddUserOpen(true)
          }}
          onEditUser={handleEditUser}
          onDeleteUser={handleDeleteUser}
          onViewUser={(user) => {
            // TODO: Implement view user details
            console.log('View user:', user)
          }}
          onBlockUser={handleBlockUser}
          onUnblockUser={handleUnblockUser}
          onViewGuarantor={handleViewGuarantor}
          onEditGuarantor={handleEditGuarantor}
          onDeleteGuarantor={(g) => {
            if (g.userId) handleDeleteUser(g.userId)
            else showToast('Cannot delete: guarantor has no linked user', 'error')
          }}
        />
      )}

      {/* Edit Guarantor Dialog */}
      {editingGuarantor && (
        <EditGuarantorDialog
          open={true}
          onClose={() => setEditingGuarantor(null)}
          onSubmit={handleSaveGuarantor}
          guarantor={editingGuarantor}
          loading={editGuarantorLoading}
        />
      )}
    </div>
  )
}