import { NextRequest } from 'next/server'
import { companyTotals } from '@/lib/db'
import { apiHandler, requireRole, ok, err } from '@/lib/api'
import { readTable, getRowsByField, getSupabase } from '@/lib/supabase-db'
import { buildGuarantorEarnedMap } from '@/lib/guarantorEarned'

export const GET = apiHandler(async (req: NextRequest) => {
  await requireRole(req, ['Admin'])

  const supabase = getSupabase()

  // Fetch users with blocking fields
  const { data: usersData } = await supabase
    .from('users')
    .select('user_id, username, name, role, status, email, guarantor_code, blocked_at, blocked_until, blocked_by, block_reason, created_at, updated_at')

  // Convert snake_case to PascalCase to match readTable output
  const users = (usersData || []).map(u => ({
    'User ID': u.user_id,
    Username: u.username,
    Name: u.name,
    Role: u.role,
    Status: u.status,
    Email: u.email,
    'Guarantor Code': u.guarantor_code,
    'Blocked At': u.blocked_at,
    'Blocked Until': u.blocked_until,
    'Blocked By': u.blocked_by,
    'Block Reason': u.block_reason,
    'Created At': u.created_at,
    'Updated At': u.updated_at,
  }))

  const [
    branches,
    staffAccess,
    agents,
    guarantors,
    profiles,
    branchStaffRoles,
    guarantorBranches
  ] = await Promise.all([
    readTable('Branches', { forceFresh: true }),
    readTable('StaffAccess', { forceFresh: true }),
    readTable('Agents', { forceFresh: true }),
    readTable('Guarantors', { forceFresh: true }),
    readTable('Profiles', { forceFresh: true }),
    readTable('BranchStaffRoles', { forceFresh: true }),
    readTable('GuarantorBranches', { forceFresh: true }),
  ])

  const guarantorEarned = new Map(Object.entries((await companyTotals()).commissionByGuarantor))   // commission per guarantor, added up by the database

  // Find admin user
  const adminUser = users.find(u => u.Role === 'Admin')
  const adminProfile = adminUser ? profiles.find(p => p['User ID'] === adminUser['User ID']) : null

  const organizationAdmin = adminUser ? {
    userId: adminUser['User ID'],
    name: adminUser.Name,
    email: adminUser.Email,
    role: 'Admin' as const,
    avatarUrl: adminProfile?.['Photo'] || null,
    cardNumber: adminProfile?.['Card Number'] || null,
  } : null

  // Build branch data with counts and staff
  const branchData = branches.map(branch => {
    const branchId = branch['Branch ID']

    // Get staff roles for this branch
    const staffRoles = branchStaffRoles
      .filter(r => r['Branch ID'] === branchId && r['Is Active'])
      .map(r => {
        const user = users.find(u => u['User ID'] === r['User ID'])
        const access = staffAccess.find(a => a['User ID'] === r['User ID'])
        const perms = access?.['Permissions']
        const permissions = Array.isArray(perms) ? perms : (perms || '').split(',').map(s => s.trim()).filter(Boolean)
        
        // Check if user is blocked
        const now = new Date().toISOString()
        const isBlocked = user?.['Blocked Until'] && user['Blocked Until'] > now

        return {
          userId: r['User ID'],
          username: user?.Username || '',
          name: user?.Name || '',
          roleInBranch: r['Role In Branch'] as 'manager' | 'assistant_manager' | 'accountant' | 'cashier' | 'collection_agent',
          permissions,
          isActive: r['Is Active'],
          isBlocked: isBlocked || false,
          blockedUntil: user?.['Blocked Until'],
          blockReason: user?.['Block Reason'],
        }
      })

    // Get agents for this branch
    const branchAgents = agents
      .filter(a => a['Branch ID'] === branchId && a['Status'] === 'Active')
      .map(a => {
        const user = users.find(u => u['User ID'] === a['User ID'])
        const now = new Date().toISOString()
        const isBlocked = user?.['Blocked Until'] && user['Blocked Until'] > now

        return {
          userId: a['User ID'],
          username: user?.Username || '',
          name: a['Name'],
          roleInBranch: 'collection_agent' as const,
          permissions: [],
          isActive: true,
          isBlocked: isBlocked || false,
          blockedUntil: user?.['Blocked Until'],
          blockReason: user?.['Block Reason'],
        }
      })

    // Combine staff roles and agents for unified list
    const allStaff = [...staffRoles, ...branchAgents]

    // Get guarantors for this branch
    const branchGuarantorIds = guarantorBranches
      .filter(gb => gb['Branch ID'] === branchId && gb['Is Active'])
      .map(gb => gb['Guarantor ID'])

    const branchGuarantors = guarantors
      .filter(g => branchGuarantorIds.includes(g['Guarantor ID']))
      .map(g => ({
        guarantorId: g['Guarantor ID'],
        userId: g['User ID'],
        name: g['Name'],
        code: g['Code'],
        phone: g['Phone'] || '',
        commissionEarned: guarantorEarned.get(g['Guarantor ID']) || 0,
      }))

    const counts = {
      manager: staffRoles.filter(s => s.roleInBranch === 'manager').length,
      assistantManagers: staffRoles.filter(s => s.roleInBranch === 'assistant_manager').length,
      accountants: staffRoles.filter(s => s.roleInBranch === 'accountant').length,
      cashiers: staffRoles.filter(s => s.roleInBranch === 'cashier').length,
      collectionAgents: branchAgents.length,
      guarantors: branchGuarantors.length,
    }

    return {
      branchId: branch['Branch ID'],
      name: branch['Name'],
      status: branch['Status'],
      counts,
      staff: allStaff,
      guarantors: branchGuarantors,
    }
  })

  return ok({
    organizationAdmin,
    branches: branchData,
  })
})