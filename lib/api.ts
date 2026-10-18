import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, passwordVersionMatches } from './auth'
import { Session } from '../types'
import { getSupabase } from './supabase-db'

export async function getSession(req: NextRequest): Promise<Session> {
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace('Bearer ', '').trim()
  if (!token) throw new Error('No token provided')
  const session = await verifyToken(token)

  const now = new Date().toISOString()
  const supabase = getSupabase()
  const { data: user } = await supabase
    .from('users')
    .select('blocked_until, block_reason, password_hash, updated_at, role, status')
    .eq('user_id', session.userId)
    .single()

  // Reject tokens for deleted users and tokens issued before the user's last password change
  if (!user) throw new Error('Session expired')
  if (session.pv !== undefined) {
    if (!passwordVersionMatches(session.pv, user.password_hash || '')) throw new Error('Session expired')
  } else {
    // Legacy token (issued before the pv claim existed): reject if the account was modified after issue
    const changedAt = Date.parse(user.updated_at)
    if (!session.iat || Number.isNaN(changedAt) || changedAt > session.iat * 1000) throw new Error('Session expired')
  }

  // Role and status come from the database on every request, so a demotion or deactivation takes effect at once
  if (user.status && user.status !== 'Active') throw new Error('Session expired')
  if (user.role && user.role !== session.role) session.role = user.role

  // Check if user is blocked (server-side time). A permanent block is stored as a far-future date.
  if (user.blocked_until && user.blocked_until > now) {
    const blockExpiry = new Date(user.blocked_until).toLocaleString()
    throw new Error(`Account temporarily blocked until ${blockExpiry}. Reason: ${user.block_reason || 'Not specified'}`)
  }

  return session
}

export async function requireRole(req: NextRequest, roles: string[]): Promise<Session> {
  const session = await getSession(req)
  if (!roles.includes(session.role)) throw new Error('No permission')
  return session
}

export function ok(data: unknown) {
  return NextResponse.json({ success: true, data })
}

export function err(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status })
}

export function apiHandler(fn: (req: NextRequest, ctx?: any) => Promise<NextResponse>) {
  return async (req: NextRequest, ctx?: any) => {
    try {
      return await fn(req, ctx)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Server error'
      return err(msg, msg === 'No permission' ? 403 : msg === 'No token provided' || msg === 'Session expired' ? 401 : 400)
    }
  }
}
