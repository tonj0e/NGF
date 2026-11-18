import { NextRequest, NextResponse, after } from 'next/server'
import { apiHandler, ok, err, primeSessionUser } from '@/lib/api'
import { selfAccess } from '@/lib/access'
import type { Session } from '@/types'
import { verifyPassword, createToken, createPreAuthToken, verifyTrustToken } from '@/lib/auth'
import { readTable, findRecord, cachedAt } from '@/lib/supabase-db'
import { APP_CONFIG } from '@/lib/config'
import { authRateLimit, rateLimitKey } from '@/lib/rate-limiter'
import { validateBody, loginSchema } from '@/lib/validation'
import { createAuditLogger, AUDIT_ACTIONS } from '@/lib/audit'
import { generateCsrfToken, addCsrfToResponse } from '@/lib/csrf'

const QR_LOGIN_ROLES = ['Guarantor', 'NGF AGENT', 'Staff']
const SELF_ACCESS_ROLES = ['Guarantor', 'NGF AGENT', 'Staff']

export const POST = apiHandler(async (req: NextRequest) => {
  const rateLimitResult = authRateLimit(req)
  if (!rateLimitResult.success) return rateLimitResult.response!

  const validation = await validateBody(loginSchema)(req)
  if (!validation.success) return validation.response
  const { username, password, trust } = validation.data

  // Limit per account as well as per address: a forged X-Forwarded-For cannot dodge this one
  const perUser = rateLimitKey(`login-user:${String(username).trim().toLowerCase()}`, 15, 5 * 60 * 1000)
  if (!perUser.success) return NextResponse.json({ success: false, error: 'Too many attempts for this account. Please try again later.' }, { status: 429, headers: { 'Retry-After': String(perUser.retryAfterSec) } })

  const settingsP = readTable('Settings').catch(() => [] as Record<string, string>[])   // needed later; start now
  const usersAskedAt = Date.now()
  const users = await readTable('Users', { maxAgeMs: 5_000 })
  const usersReadAt = Math.min(cachedAt('Users') ?? usersAskedAt, Date.now())
  
  // Try to find user by username first, then by name, then by email
  let user = findRecord(users, 'Username', username)
  if (!user) {
    user = findRecord(users, 'Name', username)
  }
  if (!user) {
    user = findRecord(users, 'Email', username)
  }
  
  if (!user) {
    await createAuditLogger(req, { userId: 'unknown', username, role: 'unknown' }).failure(
      AUDIT_ACTIONS.LOGIN_FAILED,
      'User',
      username,
      { reason: 'User not found' }
    )
    return err('Invalid credentials')
  }
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
    const when = String(user['Blocked Until']).startsWith('9999') ? 'Account blocked' : `Account temporarily blocked until ${blockExpiry}`
    return err(`${when}. Reason: ${user['Block Reason'] || 'Not specified'}`)
  }

  // The person's own menu and first page (what GET /api/branches?self=1 answers) is read while the password is checked,
  // and only sent back once every check below has passed. Only the portals whose menus are built from it need it.
  const accessP = SELF_ACCESS_ROLES.includes(user['Role'])
    ? selfAccess({ userId: user['User ID'], role: user['Role'] as Session['role'] }).catch(() => null)
    : Promise.resolve(null)
  const valid = await verifyPassword(password, user['Password Hash'])
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
    const settings = await settingsP
    const qrRequired = settings.find(s => s['Key'] === `qrlogin:${role}`)?.['Value'] === '1'
    if (qrRequired) {
      let trusted = false
      if (trust) { try { trusted = (await verifyTrustToken(trust)) === user['User ID'] } catch {} }
      if (!trusted) {
        const preAuth = await createPreAuthToken(user['User ID'])
        const audit = createAuditLogger(req, { userId: user['User ID'], username, role: user['Role'] })
        after(() => audit.success(AUDIT_ACTIONS.LOGIN, 'User', user['User ID'], { qrRequired: true }))
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
  const [token, access] = await Promise.all([createToken(session, user['Password Hash']), accessP])

  // The sign-in record is written right after the answer is sent (one database trip less to wait for). A failed write
  // is reported exactly as before (logAudit -> reportError).
  const audit = createAuditLogger(req, { userId: session.userId, username: session.username, role: session.role })
  after(() => audit.success(AUDIT_ACTIONS.LOGIN, 'User', session.userId, { qrRequired: false }))

  // The app's first requests check this account again; the row read above is reused for the usual few seconds
  primeSessionUser(session.userId, {
    blocked_until: user['Blocked Until'] || null, block_reason: user['Block Reason'] || null, password_hash: user['Password Hash'],
    updated_at: user['Updated At'], role: user['Role'], status: user['Status'],
  }, usersReadAt)

  const response = ok({
    token,
    user: session,
    ...(access ? { access } : {}),
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
