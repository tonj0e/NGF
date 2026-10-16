import { NextResponse } from 'next/server'
import { devOnlyGuard } from '@/lib/devOnly'
import { isEmailConfigured } from '@/lib/email'

// DEVELOPMENT ONLY: lets the recovery page show whether the email provider is configured.
// Reveals only server configuration (never anything about accounts) and returns 404 in production.
export async function GET() {
  const blocked = devOnlyGuard()
  if (blocked) return blocked
  return NextResponse.json({ success: true, data: { emailConfigured: isEmailConfigured() } })
}
