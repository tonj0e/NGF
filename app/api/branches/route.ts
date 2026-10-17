import { NextRequest } from 'next/server'
import { apiHandler, getSession, requireRole, ok, err } from '@/lib/api'
import { readTable, appendRow, updateById, findRecord, makeId, nowIso, deleteById, invalidateCache, getRowById } from '@/lib/supabase-db'
import { randomUUID } from 'crypto'
import { APP_CONFIG } from '@/lib/config'

// GET ?self=1  → the caller's own branch + granted permissions (used to build the
//                Staff menu).
// GET          → (Admin) branches, staff users, and each staff's access mapping.
export const GET = apiHandler(async (req: NextRequest) => {
  const session = await getSession(req)
  const { searchParams } = new URL(req.url)

  if (searchParams.get('self') === '1') {
    const [access, branches] = await Promise.all([readTable('StaffAccess'), readTable('Branches')])
    const mine = access.find(a => a['User ID'] === session.userId)
    const branch = mine ? branches.find(b => b['Branch ID'] === mine['Branch ID']) : null
    const perms = mine?.['Permissions']
    const permissions = Array.isArray(perms) ? perms : (perms || '').split(',').map(s => s.trim()).filter(Boolean)
    return ok({
      branchId: mine?.['Branch ID'] || '',
      branchName: branch?.['Name'] || '',
      permissions,
    })
  }

  await requireRole(req, ['Admin'])
  const [branches, access, users] = await Promise.all([
    readTable('Branches'), readTable('StaffAccess'), readTable('Users'),
  ])
  return ok({
    branches: branches.map(b => ({ branchId: b['Branch ID'], name: b['Name'], status: b['Status'] })),
    access: access.map(a => {
      const perms = a['Permissions']
      const permissions = Array.isArray(perms) ? perms : (perms || '').split(',').map(s => s.trim()).filter(Boolean)
      return {
        userId: a['User ID'], branchId: a['Branch ID'],
        permissions,
      }
    }),
    staff: users.filter(u => u['Role'] === 'Staff' || u['Role'] === 'NGF AGENT').map(u => ({
      userId: u['User ID'], username: u['Username'], name: u['Name'], status: u['Status'], role: u['Role'],
    })),
  })
})

export const POST = apiHandler(async (req: NextRequest) => {
  await requireRole(req, ['Admin'])
  const body = await req.json()
  const { action } = body

  if (action === 'addBranch') {
    if (!body.name?.trim()) return err('Branch name required')
    await appendRow('Branches', {
      'Branch ID': makeId('BR'), 'Name': body.name.trim(), 'Status': 'Active', 'Created At': nowIso(),
    })
    return ok({ success: true })
  }

  if (action === 'deleteBranch') {
    const branches = await readTable('Branches')
    const b = findRecord(branches, 'Branch ID', body.branchId)
    if (!b) return err('Branch not found')
    await deleteById('Branches', body.branchId)
    return ok({ success: true })
  }

  if (action === 'setAccess') {
    const { userId, branchId } = body
    if (!userId) return err('userId required')
    // staff_access.permissions is a text[] column: send a Postgres array literal of known feature keys only
    const known = new Set(APP_CONFIG.STAFF_FEATURES.map(f => f.key))
    const picked = Array.isArray(body.permissions) ? body.permissions.filter((k: unknown): k is string => typeof k === 'string' && known.has(k)) : []
    const permissions = `{${Array.from(new Set(picked)).join(',')}}`
    const access = await readTable('StaffAccess')
    const existing = access.find(a => a['User ID'] === userId)
    if (existing) {
      await updateById('StaffAccess', userId, {
        'Branch ID': branchId || '', 'Permissions': permissions, 'Updated At': nowIso(),
      })
    } else {
      await appendRow('StaffAccess', {
        'User ID': userId, 'Branch ID': branchId || '', 'Permissions': permissions, 'Updated At': nowIso(),
      })
    }
    invalidateCache('StaffAccess')
    return ok({ success: true })
  }

  // New action: set staff role in branch
  if (action === 'setStaffRole') {
    const { userId, branchId, roleInBranch, isActive } = body
    if (!userId || !branchId || !roleInBranch) {
      return err('userId, branchId, and roleInBranch are required')
    }
    const validRoles = ['manager', 'accountant', 'cashier', 'collection_agent']
    if (!validRoles.includes(roleInBranch)) {
      return err('Invalid roleInBranch')
    }

    // Enforce one active manager per branch
    if (roleInBranch === 'manager' && isActive !== false) {
      const existingRoles = await readTable('BranchStaffRoles')
      const activeManager = existingRoles.find(
        r => r['Branch ID'] === branchId && r['Role In Branch'] === 'manager' && r['Is Active'] && r['User ID'] !== userId
      )
      if (activeManager) {
        return err('A manager is already assigned to this branch. Please remove the existing manager first.')
      }
    }

    const existingRoles = await readTable('BranchStaffRoles')
    const existing = existingRoles.find(
      r => r['User ID'] === userId && r['Branch ID'] === branchId && r['Role In Branch'] === roleInBranch
    )

    if (existing) {
      // Update existing
      await updateById('BranchStaffRoles', existing['ID'], {
        'Is Active': String(isActive !== false),
        'Updated At': nowIso(),
      })
    } else {
      // Create new
      await appendRow('BranchStaffRoles', {
        'ID': randomUUID(), 'User ID': userId, 'Branch ID': branchId,
        'Role In Branch': roleInBranch, 'Is Active': String(isActive !== false),
        'Created At': nowIso(), 'Updated At': nowIso(),
      })
    }
    invalidateCache('BranchStaffRoles')
    return ok({ success: true })
  }

  // New action: associate guarantor with branch
  if (action === 'associateGuarantor') {
    const { guarantorId, branchId, isActive } = body
    if (!guarantorId || !branchId) {
      return err('guarantorId and branchId are required')
    }

    const existingLinks = await readTable('GuarantorBranches')
    const existing = existingLinks.find(
      l => l['Guarantor ID'] === guarantorId && l['Branch ID'] === branchId
    )

if (existing) {
      await updateById('GuarantorBranches', existing['ID'], {
        'Is Active': String(isActive !== false),
      })
    } else {
      await appendRow('GuarantorBranches', {
        'ID': randomUUID(), 'Guarantor ID': guarantorId, 'Branch ID': branchId,
        'Is Active': String(isActive !== false), 'Created At': nowIso(),
      })
    }
    invalidateCache('GuarantorBranches')
    return ok({ success: true })
  }

  // New action: set agent branch
  if (action === 'setAgentBranch') {
    const { agentId, branchId } = body
    if (!agentId) return err('agentId required')

    const agents = await readTable('Agents')
    const agent = findRecord(agents, 'Agent ID', agentId)
    if (!agent) return err('Agent not found')

    await updateById('Agents', agentId, {
      'branch_id': branchId || null,
      'updated_at': nowIso(),
    })
    invalidateCache('Agents')
    return ok({ success: true })
  }

  return err('Unknown action')
})