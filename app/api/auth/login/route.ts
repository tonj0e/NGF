import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ok, err } from '@/lib/api'
import { verifyPassword, createToken, createPreAuthToken, verifyTrustToken } from '@/lib/auth'
import { readTable, findRecord } from '@/lib/supabase-db'
import { APP_CONFIG } from '@/lib/config'
import { authRateLimit } from '@/lib/rate-limiter'
import { validateBody, loginSchema } from '@/lib/validation'
import { createAuditLogger, AUDIT_ACTIONS } from '@/lib/audit'
import { generateCsrfToken, addCsrfToResponse } from '@/lib/csrf'

const QR_LOGIN_ROLES = ['Guarantor', 'NGF AGENT', 'Staff']

export const POST = apiHandler(async (req: NextRequest) => {
  const rateLimitResult = authRateLimit(req)
  if (!rateLimitResult.success) return rateLimitResult.response!

  const validation = await validateBody(loginSchema)(req)
  if (!validation.success) return validation.response
  const { username, password, trust } = validation.data

  const users = await readTable('Users', { forceFresh: true })
  
  // Try to find user by username first, then by name, then by email
  let user = findRecord(users, 'Username', username)
  if (!user) {
    user = findRecord(users, 'Name', username)
  }
  if (!user) {
    user = findRecord(users, 'Email', username)
  }
  
  if (!user) {
    console.log('[LOGIN] User not found:', username, 'Available usernames:', users.map(u => u['Username']))
    await createAuditLogger(req, { userId: 'unknown', username, role: 'unknown' }).failure(
      AUDIT_ACTIONS.LOGIN_FAILED,
      'User',
      username,
      { reason: 'User not found' }
    )
    return err('Invalid credentials')
  }
  console.log('[LOGIN] User found:', user['Username'], 'Role:', user['Role'], 'Status:', user['Status'])
  if (user['Status'] !== 'Active') {
    await createAuditLogger(req, { userId: user['User ID'], username, role: user['Role'] }).failure(
      AUDIT_ACTIONS.LOGIN_FAILED,
      'User',
      user['User ID'],
      { reason: 'Account inactive' }
    )
    return err('Account inactive')
  }

  // Check if user is temporarily blocked
  const now = new Date().toISOString()
  if (user['Blocked Until'] && user['Blocked Until'] > now) {
    const blockExpiry = new Date(user['Blocked Until']).toLocaleString()
    await createAuditLogger(req, { userId: user['User ID'], username, role: user['Role'] }).failure(
      AUDIT_ACTIONS.LOGIN_FAILED,
      'User',
      user['User ID'],
      { reason: 'Account temporarily blocked', blockedUntil: user['Blocked Until'], blockReason: user['Block Reason'] }
    )
    return err(`Account temporarily blocked until ${blockExpiry}. Reason: ${user['Block Reason'] || 'Not specified'}`)
  }

  const valid = await verifyPassword(password, user['Password Hash'])
  console.log('[LOGIN] Password verification:', valid, 'for user:', username)
  if (!valid) {
    await createAuditLogger(req, { userId: user['User ID'], username, role: user['Role'] }).failure(
      AUDIT_ACTIONS.LOGIN_FAILED,
      'User',
      user['User ID'],
      { reason: 'Invalid password' }
    )
    return err('Invalid credentials')
  }

  // QR-secured login: required for non-admin portals when enabled in Settings,
  // unless this device is already trusted ("remember me").
  const role = user['Role']
  if (role !== 'Admin' && QR_LOGIN_ROLES.includes(role)) {
    const settings = await readTable('Settings')
    const qrRequired = settings.find(s => s['Key'] === `qrlogin:${role}`)?.['Value'] === '1'
    if (qrRequired) {
      let trusted = false
      if (trust) { try { trusted = (await verifyTrustToken(trust)) === user['User ID'] } catch {} }
      if (!trusted) {
        const preAuth = await createPreAuthToken(user['User ID'])
        await createAuditLogger(req, { userId: user['User ID'], username, role: user['Role'] }).success(
          AUDIT_ACTIONS.LOGIN,
          'User',
          user['User ID'],
          { qrRequired: true }
        )
        return ok({ needQr: true, preAuth, name: user['Name'] })
      }
    }
  }

  const session = {
    userId: user['User ID'],
    username: user['Username'],
    role: user['Role'] as any,
    name: user['Name'],
    email: user['Email'],
    guarantorCode: user['Guarantor Code'] || '',
  }
  const token = await createToken(session, user['Password Hash'])

  await createAuditLogger(req, { userId: session.userId, username: session.username, role: session.role }).success(
    AUDIT_ACTIONS.LOGIN,
    'User',
    session.userId,
    { qrRequired: false }
  )

  const response = ok({
    token,
    user: session,
    config: {
      appName: APP_CONFIG.APP_NAME,
      loanProducts: APP_CONFIG.LOAN_PRODUCTS,
      leadStatuses: APP_CONFIG.LEAD_STATUSES,
      verificationResults: APP_CONFIG.VERIFICATION_RESULTS,
    },
  })

  const csrfToken = await generateCsrfToken(session.userId)
  return addCsrfToResponse(response, csrfToken)
})
