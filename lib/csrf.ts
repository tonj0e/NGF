import { NextRequest, NextResponse } from 'next/server'
import { SignJWT, jwtVerify } from 'jose'

const CSRF_SECRET = new TextEncoder().encode(
  process.env.CSRF_SECRET || 'ngf-csrf-secret-change-in-production-min-32-chars'
)
const CSRF_TTL = 3600 // 1 hour

export async function generateCsrfToken(sessionId: string): Promise<string> {
  return new SignJWT({ sid: sessionId, t: 'csrf' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${CSRF_TTL}s`)
    .sign(CSRF_SECRET)
}

export async function verifyCsrfToken(token: string, sessionId: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, CSRF_SECRET)
    return payload.sid === sessionId && payload.t === 'csrf'
  } catch {
    return false
  }
}

export function getCsrfTokenFromRequest(req: NextRequest): string | null {
  // Check header first (for AJAX requests)
  const headerToken = req.headers.get('x-csrf-token')
  if (headerToken) return headerToken

  // Check cookie (for form submissions)
  const cookieToken = req.cookies.get('csrf_token')?.value
  if (cookieToken) return cookieToken

  return null
}

export function createCsrfResponse(token: string): NextResponse {
  const response = NextResponse.json({ csrfToken: token })
  response.cookies.set('csrf_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: CSRF_TTL,
    path: '/',
  })
  return response
}

export function csrfProtection(req: NextRequest, sessionId: string): NextResponse | null {
  // Skip CSRF for safe methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return null
  }

  const token = getCsrfTokenFromRequest(req)
  if (!token) {
    return NextResponse.json({ success: false, error: 'CSRF token required' }, { status: 403 })
  }

  if (!verifyCsrfToken(token, sessionId)) {
    return NextResponse.json({ success: false, error: 'Invalid CSRF token' }, { status: 403 })
  }

  return null
}

export function addCsrfToResponse(response: NextResponse, token: string): NextResponse {
  response.cookies.set('csrf_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: CSRF_TTL,
    path: '/',
  })
  return response
}