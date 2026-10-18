import { NextRequest } from 'next/server'
import { apiHandler, requireRole, ok, err } from '@/lib/api'
import { readTable, appendRow, updateRow, findRecord, makeId, nowIso, deleteById, updateById, getRowsByField, getSupabase } from '@/lib/supabase-db'
import { hashPassword } from '@/lib/auth'
import { validatePasswordPolicy } from '@/lib/passwordPolicy'
import { randomUUID } from 'crypto'
import { buildGuarantorEarnedMap } from '@/lib/guarantorEarned'

export const GET = apiHandler(async (req: NextRequest) => {
  await requireRole(req, ['Admin', 'Staff'])
  const [users, agents, guarantors, loans] = await Promise.all([
    readTable('Users', { forceFresh: true }), readTable('Agents', { forceFresh: true }), readTable('Guarantors', { forceFresh: true }), readTable('Loans', { forceFresh: true }),
  ])
  const earnedMap = buildGuarantorEarnedMap(loans)
  return ok({
    staff: users.map(u => ({ userId: u['User ID'], username: u['Username'], role: u['Role'], name: u['Name'], email: u['Email'], phone: u['Phone'] || '', status: u['Status'], createdAt: u['Created At'] })),
    agents: agents.map(a => ({ agentId: a['Agent ID'], userId: a['User ID'], name: a['Name'], phone: a['Phone'], agentType: a['Agent Type'], status: a['Status'] })),
    guarantors: guarantors.map(g => ({ guarantorId: g['Guarantor ID'], userId: g['User ID'], name: g['Name'], code: g['Code'], phone: g['Phone'], address: g['Address'] || '', status: g['Status'], commissionEarned: earnedMap.get(g['Guarantor ID']) || 0 })),
  })
})

export const POST = apiHandler(async (req: NextRequest) => {
  await requireRole(req, ['Admin'])
  const body = await req.json()

  // Check if username already exists
  const existingUsers = await readTable('Users', { forceFresh: true })
  if (existingUsers.find(u => u['Username'] === body.username)) {
    return err('Username already taken')
  }

  const hash = await hashPassword(body.password)
  const userId = makeId('USR')
  let userCreated = false
  let branchRoleCreated = false
  let staffAccessCreated = false
  let guarantorBranchCreated = false

  try {
    // Create user
    await appendRow('Users', {
      'User ID': userId, 'Username': body.username, 'Password Hash': hash, 'Salt': '',
      'Role': body.role, 'Status': body.status || 'Active', 'Name': body.name,
      'Email': body.email || '', 'Guarantor Code': body.guarantorCode || '',
      'Created At': nowIso(), 'Updated At': nowIso(),
    })
    userCreated = true

    // Create linked records for Guarantor or NGF AGENT roles
    if (body.role === 'Guarantor') {
      const guarantorId = makeId('GRT')
      await appendRow('Guarantors', {
        'Guarantor ID': guarantorId, 'User ID': userId, 'Name': body.name,
        'Code': body.guarantorCode || '', 'Phone': body.phone || '',
        'Address': body.address || '', 'Commission Earned': '0',
        'Status': 'Active', 'Created At': nowIso(), 'Updated At': nowIso(),
      })
      // NGF Branches lists guarantors through guarantor_branches, so link the new guarantor to its branch
      if (body.branchId) {
        await appendRow('GuarantorBranches', {
          'ID': randomUUID(), 'Guarantor ID': guarantorId, 'Branch ID': body.branchId,
          'Is Active': 'true', 'Created At': nowIso(),
        })
        guarantorBranchCreated = true
      }
    }
    if (body.role === 'NGF AGENT') {
      await appendRow('Agents', {
        'Agent ID': makeId('AGT'), 'User ID': userId, 'Name': body.name,
        'Phone': body.phone || '', 'Agent Type': body.agentType || 'Verification & Collection',
        'Status': 'Active', 'Created At': nowIso(), 'Updated At': nowIso(),
      })
    }

    // Create branch staff role and staff access if provided
    if (body.branchId && body.branchRole && body.role !== 'Guarantor') {
      const validRoles = ['manager', 'assistant_manager', 'accountant', 'cashier', 'collection_agent']
      if (!validRoles.includes(body.branchRole)) {
        throw new Error('Invalid branch role')
      }

      // Enforce one active manager per branch
      if (body.branchRole === 'manager') {
        const supabase = getSupabase()
        const { data: existingManager } = await supabase
          .from('branch_staff_roles')
          .select('id')
          .eq('branch_id', body.branchId)
          .eq('role_in_branch', 'manager')
          .eq('is_active', true)
          .single()
        if (existingManager) {
          throw new Error('A manager is already assigned to this branch. Please remove the existing manager first.')
        }
      }

      await appendRow('BranchStaffRoles', {
        'ID': randomUUID(), 'User ID': userId, 'Branch ID': body.branchId,
        'Role In Branch': body.branchRole, 'Is Active': 'true',
        'Created At': nowIso(), 'Updated At': nowIso(),
      })
      branchRoleCreated = true

      // Create staff access with permissions (as array)
      const permissions = Array.isArray(body.permissions) ? body.permissions : (body.permissions || '').split(',').map((s: string) => s.trim()).filter(Boolean)
      const supabase = getSupabase()
      const { error: accessError } = await supabase
        .from('staff_access')
        .insert({
          user_id: userId,
          branch_id: body.branchId,
          permissions: permissions,
        })
      if (accessError) throw new Error(`Failed to insert into StaffAccess: ${accessError.message}`)
      staffAccessCreated = true
    }

    return ok({ success: true, userId })
  } catch (error: any) {
    // Compensation: clean up created records in reverse order
    if (staffAccessCreated) {
      try {
        const supabase = getSupabase()
        await supabase.from('staff_access').delete().eq('user_id', userId)
      } catch {}
    }
    if (branchRoleCreated) {
      try {
        const supabase = getSupabase()
        await supabase.from('branch_staff_roles').delete().eq('user_id', userId)
      } catch {}
    }
    if (guarantorBranchCreated || body.role === 'Guarantor') {
      try {
        const supabase = getSupabase()
        const { data: g } = await supabase.from('guarantors').select('guarantor_id').eq('user_id', userId)
        const ids = (g || []).map(r => r.guarantor_id)
        if (ids.length) {
          await supabase.from('guarantor_branches').delete().in('guarantor_id', ids)
          await supabase.from('guarantors').delete().in('guarantor_id', ids)
        }
      } catch {}
    }
    if (userCreated) {
      try {
        await deleteById('Users', userId)
      } catch {}
    }
    return err(error.message || 'Failed to create user')
  }
})

export const PATCH = apiHandler(async (req: NextRequest) => {
  await requireRole(req, ['Admin'])
  const body = await req.json()
  const { userId } = body
  if (!userId) return err('userId required')
  const [users, agents, guarantors] = await Promise.all([
    readTable('Users', { forceFresh: true }), readTable('Agents', { forceFresh: true }), readTable('Guarantors', { forceFresh: true }),
  ])
  const user = findRecord(users, 'User ID', userId)
  if (!user) return err('User not found')

  // If username is changing, ensure it is well-formed and isn't taken by someone else
  if (body.username && body.username !== user['Username']) {
    body.username = String(body.username).trim()
    if (body.username.length < 3 || body.username.length > 64 || /\s/.test(body.username)) {
      return err('Username must be 3-64 characters with no spaces')
    }
    const clash = users.find(u => u['Username'] === body.username && u['User ID'] !== userId)
    if (clash) return err('Username already taken')
  }

  const oldRole = user['Role']
  const newRole = body.role || oldRole

  // Check if this is a guarantor edit (existing guarantor, not role change)
  const isGuarantorEdit = oldRole === 'Guarantor' && newRole === 'Guarantor'
  const existingGuarantor = guarantors.find(g => g['User ID'] === userId)

  if (isGuarantorEdit && existingGuarantor) {
    // Reject a weak new password before anything is written
    if (body.password) {
      const policyError = validatePasswordPolicy(body.password, {
        username: body.username || user['Username'],
        email: body.email ?? user['Email'],
      })
      if (policyError) return err(policyError)
    }

    // Use atomic function for guarantor edits
    const supabase = getSupabase()
    const { data: atomicResult, error: atomicError } = await supabase.rpc('update_guarantor_atomic', {
      p_user_id: userId,
      p_name: body.name || user['Name'],
      p_email: body.email ?? user['Email'],
      p_guarantor_code: body.guarantorCode ?? user['Guarantor Code'],
      p_phone: body.phone ?? existingGuarantor['Phone'],
      p_address: body.address ?? existingGuarantor['Address'],
      p_status: body.status ?? existingGuarantor['Status'],
    })

    if (atomicError) {
      return err(`Atomic guarantor update failed: ${atomicError.message}`)
    }

    const result = atomicResult as any
    if (!result?.success) {
      return err(result?.error || 'Atomic guarantor update failed')
    }

    // Also update username in users table if changed (not handled by atomic function)
    if (body.username && body.username !== user['Username']) {
      await updateById('Users', userId, {
        'Username': body.username,
        'Updated At': nowIso(),
      })
    }

    // Update password if provided
    if (body.password) {
      await updateById('Users', userId, {
        'Password Hash': await hashPassword(body.password),
        'Updated At': nowIso(),
      })
    }

    return ok({ success: true })
  }

  // For non-guarantor edits or role changes, use existing logic
  await updateById('Users', user['User ID'], {
    'Username': body.username || user['Username'],
    'Name': body.name || user['Name'],
    'Email': body.email ?? user['Email'],
    'Role': newRole,
    'Guarantor Code': body.guarantorCode ?? user['Guarantor Code'],
    'Updated At': nowIso(),
    ...(body.password ? { 'Password Hash': await hashPassword(body.password), } : {}),
  })

  // Handle role changes: create/update linked records
  if (newRole === 'NGF AGENT') {
    const agent = agents.find(a => a['User ID'] === userId)
    if (agent) {
      await updateById('Agents', agent['Agent ID'], {
        'Name': body.name || agent['Name'],
        'Phone': body.phone ?? agent['Phone'],
      })
    } else {
      // Create new agent record
      await appendRow('Agents', {
        'Agent ID': makeId('AGT'), 'User ID': userId, 'Name': body.name || user['Name'],
        'Phone': body.phone || '', 'Agent Type': body.agentType || 'Verification & Collection',
        'Status': 'Active', 'Created At': nowIso(), 'Updated At': nowIso(),
      })
    }
  } else if (oldRole === 'NGF AGENT') {
    // Role changed away from Collection Agent - optionally keep agent record or delete
    // For now we keep it but you could delete here
  }

  if (newRole === 'Guarantor') {
    const g = guarantors.find(g => g['User ID'] === userId)
    if (g) {
      await updateById('Guarantors', g['Guarantor ID'], {
        'Name': body.name || g['Name'],
        'Phone': body.phone ?? g['Phone'],
        'Code': body.guarantorCode ?? g['Code'],
        'Address': body.address ?? g['Address'],
        'Status': body.status ?? g['Status'],
      })
    } else {
      // Create new guarantor record
      await appendRow('Guarantors', {
        'Guarantor ID': makeId('GRT'), 'User ID': userId, 'Name': body.name || user['Name'],
        'Code': body.guarantorCode || '', 'Phone': body.phone || '',
        'Address': body.address || '', 'Commission Earned': '0',
        'Status': 'Active', 'Created At': nowIso(), 'Updated At': nowIso(),
      })
    }
  } else if (oldRole === 'Guarantor') {
    // Role changed away from Guarantor - keep record
  }

  return ok({ success: true })
})

export const DELETE = apiHandler(async (req: NextRequest) => {
  console.log('STAFF DELETE METHOD CALLED')
  const session = await requireRole(req, ['Admin'])
  const { userId } = await req.json()
  if (!userId) return err('userId required')

  // Prevent self-deletion
  if (session.userId === userId) {
    return err('Cannot delete your own account while signed in')
  }

  const supabase = getSupabase()

  const users = await readTable('Users')
  const user = findRecord(users, 'User ID', userId)
  if (!user) return err('User not found')
  if (user['Username'] === 'admin') return err('Cannot delete main admin')

  // Prevent deleting the last active admin
  const activeAdmins = users.filter(u => u['Role'] === 'Admin' && u['Status'] === 'Active')
  if (activeAdmins.length <= 1 && user['Role'] === 'Admin') {
    return err('Cannot delete the last active administrator')
  }

  // Fetch agents and guarantors for linked record deletion
  const [agents, guarantors] = await Promise.all([
    readTable('Agents'),
    readTable('Guarantors')
  ])

  // Check for associated records if deleting a guarantor
  if (user['Role'] === 'Guarantor') {
    const guarantor = guarantors.find(g => g['User ID'] === userId)
    if (guarantor) {
      // Check if this guarantor has any associated records in related tables
      const associatedTables = [
        { table: 'Leads', field: 'Guarantor ID' },
        { table: 'Customers', field: 'Guarantor ID' },
        { table: 'Loans', field: 'Guarantor ID' },
        { table: 'PayoutRequests', field: 'Guarantor ID' },
        { table: 'Deposits', field: 'Guarantor ID' },
        { table: 'DepositRequests', field: 'Guarantor ID' }
      ]

      // Debug: Log the guarantor ID we're checking
      console.log(`Checking for associated records for guarantor ID: ${guarantor['Guarantor ID']}`)

      for (const { table, field } of associatedTables) {
        const associatedRecords = await getRowsByField(table as any, field, guarantor['Guarantor ID'])
        console.log(`Table ${table}: ${associatedRecords.length} associated records found`)
        if (associatedRecords.length > 0) {
          console.log(`Found associated records in ${table}:`, associatedRecords)
          return err(`Cannot delete guarantor with associated ${table.toLowerCase()}. Please reassign or delete associated records first.`)
        }
      }
    }
  }

  // Delete linked records in correct order (child tables first)
  
  // 1. Delete branch_staff_roles (has ON DELETE CASCADE, but explicit is safer)
  try {
    await supabase.from('branch_staff_roles').delete().eq('user_id', userId)
    console.log('Deleted branch_staff_roles for user:', userId)
  } catch (e) {
    console.error('Error deleting branch_staff_roles:', e)
  }

  // 2. Delete staff_access (has ON DELETE CASCADE)
  try {
    await supabase.from('staff_access').delete().eq('user_id', userId)
    console.log('Deleted staff_access for user:', userId)
  } catch (e) {
    console.error('Error deleting staff_access:', e)
  }

  // 3. Delete profiles (has ON DELETE CASCADE)
  try {
    await supabase.from('profiles').delete().eq('user_id', userId)
    console.log('Deleted profiles for user:', userId)
  } catch (e) {
    console.error('Error deleting profiles:', e)
  }

  // 4. Delete notifications (has ON DELETE CASCADE)
  try {
    await supabase.from('notifications').delete().eq('user_id', userId)
    console.log('Deleted notifications for user:', userId)
  } catch (e) {
    console.error('Error deleting notifications:', e)
  }

  // 5. Delete linked agent or guarantor row (has ON DELETE CASCADE)
  if (user['Role'] === 'NGF AGENT') {
    const agent = agents.find(a => a['User ID'] === userId)
    if (agent) {
      await deleteById('Agents', agent['Agent ID'])
      console.log('Deleted agent for user:', userId)
    }
  }
  if (user['Role'] === 'Guarantor') {
    const g = guarantors.find(g => g['User ID'] === userId)
    if (g) {
      await deleteById('Guarantors', g['Guarantor ID'])
      console.log('Deleted guarantor for user:', userId)
    }
  }

  // 6. Finally delete the user
  // Note: logs.user_id will be SET NULL by FK constraint (after migration)
  // Other tables with FK to users without CASCADE:
  // - leads.guarantor_user_id (no cascade, but guarantor deletion is blocked above)
  // - repayments.collection_agent_id (no cascade)
  // - collections.agent_id (no cascade)
  // - settlements.recorded_by (no cascade)
  // - deposits.recorded_by (no cascade)
  // These should be handled by setting status to Inactive instead of hard delete
  // or by reassigning before deletion. For now, we allow deletion - the FK will
  // block if records exist (except logs which is SET NULL after migration).

  await deleteById('Users', userId)
  console.log('Deleted user:', userId)
  return ok({ success: true })
})
