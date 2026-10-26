import { NextResponse } from 'next/server'
import { getConfig } from '@/lib/integrations'

// The browser needs the Sentry key to report page errors. A Sentry DSN is meant to be public (it can only send reports in), so it is served openly.
export async function GET() {
  const dsn = await getConfig('SENTRY_DSN').catch(() => '')
  return NextResponse.json({ success: true, data: { dsn: dsn || null } }, { headers: { 'Cache-Control': 'no-store' } })
}
