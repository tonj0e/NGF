import { NextResponse } from 'next/server'

// Server-side environment enforcement for development-only utilities.
// Hiding UI is not enough: every dev-only route must call devOnlyGuard() first.
export function isProductionEnv(): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL_ENV === 'production' ||
    process.env.APP_ENV === 'production'
  )
}

// Returns a 404 response in production (indistinguishable from a missing route), otherwise null.
export function devOnlyGuard(): NextResponse | null {
  if (isProductionEnv()) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
  }
  return null
}
