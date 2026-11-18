import { NextRequest, after } from 'next/server'
import { apiHandler, ok, err } from '@/lib/api'
import { selfAccess } from '@/lib/access'
import { createToken, createTrustToken, verifyPreAuthToken } from '@/lib/auth'
import { readTable } from '@/lib/supabase-db'
import { APP_CONFIG } from '@/lib/config'
import { authRateLimit } from '@/lib/rate-limiter'
import { validateBody, verifyQrSchema } from '@/lib/validation'
import { createAuditLogger, AUDIT_ACTIONS } from '@/lib/audit'
import { generateCsrfToken, addCsrfToResponse } from '@/lib/csrf'

// Completes login once the scanned ID-card QR matches the pre-authenticated user
export const POST = apiHandler(async (req: NextRequest) => {
  const rateLimitResult = authRateLimit(req)
  if (!rateLimitResult.success) return rateLimitResult.response!

  const validation = await validateBody(verifyQrSchema)(req)
  if (!validation.success) return validation.response
  const { preAuth, uid, remember } = validation.data

  let userId: string
  try { userId = await verifyPreAuthToken(preAuth) } catch {
    await createAuditLogger(req, { userId: 'unknown', username: 'unknown', role: 'unknown' }).failure(
      AUDIT_ACTIONS.QR_VERIFY_FAILED,
      'QR',
      uid,
      { reason: 'Pre-auth token expired or invalid' }
    )
    return err('Session expired — please sign in again')
  }

  if (uid !== userId) {
    await createAuditLogger(req, { userId: 'unknown', username: 'unknown', role: 'unknown' }).failure(
      AUDIT_ACTIONS.QR_VERIFY_FAILED,
      'QR',
      uid,
      { reason: 'QR code does not match user' }
    )
    return err('This QR code does not match your account')
  }

  const users = await readTable('Users')
  const user = users.find(u => u['User ID'] === userId)
  if (!user || user['Status'] !== 'Active') {
    await createAuditLogger(req, { userId: userId || 'unknown', username: 'unknown', role: 'unknown' }).failure(
      AUDIT_ACTIONS.QR_VERIFY_FAILED,
      'QR',
      userId || 'unknown',
      { reason: 'Account not found or inactive' }
    )
    return err('Account not found')
  }

  const session = {
    userId: user['User ID'],
    username: user['Username'],
    role: user['Role'] as any,
    name: user['Name'],
    email: user['Email'],
    guarantorCode: user['Guarantor Code'] || '',
  }
  // the person's own menu and first page (what GET /api/branches?self=1 answers), so the app need not ask again at once
  const [token, access] = await Promise.all([
    createToken(session, user['Password Hash']),
    selfAccess({ userId: session.userId, role: session.role }).catch(() => null),
  ])
  const resp: any = {
    token,
    user: session,
    ...(access ? { access } : {}),
    config: {
      appName: APP_CONFIG.APP_NAME,
      loanProducts: APP_CONFIG.LOAN_PRODUCTS,
      leadStatuses: APP_CONFIG.LEAD_STATUSES,
      verificationResults: APP_CONFIG.VERIFICATION_RESULTS,
    },
  }
  if (remember) resp.trust = await createTrustToken(userId)

  // written right after the answer is sent; a failed write is reported as before (logAudit -> reportError)
  const audit = createAuditLogger(req, { userId: session.userId, username: session.username, role: session.role })
  after(() => audit.success(AUDIT_ACTIONS.QR_VERIFY, 'User', session.userId, { remember: !!remember }))

  const response = ok(resp)
  const csrfToken = await generateCsrfToken(session.userId)
  return addCsrfToResponse(response, csrfToken)
})
