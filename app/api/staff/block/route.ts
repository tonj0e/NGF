import { NextRequest } from 'next/server'
import { apiHandler, requireRole, ok, err, getSession } from '@/lib/api'
import { getSupabase } from '@/lib/supabase-db'
import { createAuditLogger, AUDIT_ACTIONS } from '@/lib/audit'

// Block a user
export const POST = apiHandler(async (req: NextRequest) => {
  const session = await getSession(req)
  await requireRole(req, ['Admin'])
  const body = await req.json()
  const { userId, duration, endDateTime, reason } = body

  if (!userId || !reason) {
    return err('userId and reason are required')
  }

  const supabase = getSupabase()

  // Get target user
  const { data: targetUser, error: targetError } = await supabase
    .from('users')
    .select('user_id, username, name, role, status')
    .eq('user_id', userId)
    .single()

  if (targetError || !targetUser) {
    return err('User not found')
  }

  // Prevent self-blocking
  if (session.userId === userId) {
    return err('Cannot block your own account')
  }

  // Check if user is admin and prevent blocking last admin
  if (targetUser.role === 'Admin') {
    const { data: admins } = await supabase
      .from('users')
      .select('user_id, status')
      .eq('role', 'Admin')
      .eq('status', 'Active')

    if (admins && admins.length <= 1) {
      return err('Cannot block the last active administrator')
    }
  }

  // Calculate block expiry
  let blockedUntil: string | null = null
  if (duration === 'permanent') {
    blockedUntil = null
  } else if (duration === 'custom' && endDateTime) {
    blockedUntil = endDateTime
  } else if (duration) {
    const hours = parseInt(duration.replace('h', ''))
    if (!isNaN(hours)) {
      blockedUntil = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
    }
  }

  if (blockedUntil === null && duration !== 'permanent') {
    return err('Invalid duration or missing endDateTime for custom duration')
  }

  const blockedAt = new Date().toISOString()
  const blockedBy = session.userId

  const { error: updateError } = await supabase
    .from('users')
    .update({
      blocked_at: blockedAt,
      blocked_until: blockedUntil,
      blocked_by: blockedBy,
      block_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)

  if (updateError) {
    console.error('Block user error:', updateError)
    return err('Failed to block user')
  }

  // Audit log
  await createAuditLogger(req, { userId: session.userId, username: session.username, role: session.role }).success(
    AUDIT_ACTIONS.USER_UPDATE,
    'User',
    userId,
    {
      action: 'block',
      reason,
      blockedUntil,
      blockedAt,
      targetUsername: targetUser.username,
      targetName: targetUser.name,
    }
  )

  return ok({
    success: true,
    blockedUntil,
    message: blockedUntil ? `User blocked until ${new Date(blockedUntil).toLocaleString()}` : 'User blocked permanently'
  })
})

// Unblock a user
export const DELETE = apiHandler(async (req: NextRequest) => {
  const session = await getSession(req)
  await requireRole(req, ['Admin'])
  const body = await req.json()
  const { userId } = body

  if (!userId) {
    return err('userId is required')
  }

  const supabase = getSupabase()

  // Get target user
  const { data: targetUser, error: targetError } = await supabase
    .from('users')
    .select('user_id, username, name, role')
    .eq('user_id', userId)
    .single()

  if (targetError || !targetUser) {
    return err('User not found')
  }

  // Prevent self-unblocking (though this is less critical)
  if (session.userId === userId) {
    return err('Cannot unblock your own account')
  }

  const { error: updateError } = await supabase
    .from('users')
    .update({
      blocked_at: null,
      blocked_until: null,
      blocked_by: null,
      block_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)

  if (updateError) {
    console.error('Unblock user error:', updateError)
    return err('Failed to unblock user')
  }

  // Audit log
  await createAuditLogger(req, { userId: session.userId, username: session.username, role: session.role }).success(
    AUDIT_ACTIONS.USER_UPDATE,
    'User',
    userId,
    {
      action: 'unblock',
      targetUsername: targetUser.username,
      targetName: targetUser.name,
    }
  )

  return ok({ success: true, message: 'User unblocked successfully' })
})

// Get block status for a user
export const GET = apiHandler(async (req: NextRequest) => {
  await requireRole(req, ['Admin'])
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')

  if (!userId) {
    return err('userId is required')
  }

  const supabase = getSupabase()

  const { data: user, error } = await supabase
    .from('users')
    .select('user_id, username, name, role, status, blocked_at, blocked_until, blocked_by, block_reason')
    .eq('user_id', userId)
    .single()

  if (error || !user) {
    return err('User not found')
  }

  const now = new Date().toISOString()
  const isBlocked = user.blocked_until && user.blocked_until > new Date().toISOString()

  return ok({
    userId: user.user_id,
    username: user.username,
    name: user.name,
    role: user.role,
    status: user.status,
    isBlocked,
    blockedAt: user.blocked_at,
    blockedUntil: user.blocked_until,
    blockedBy: user.blocked_by,
    blockReason: user.block_reason,
  })
})