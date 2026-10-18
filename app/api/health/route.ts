import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Public uptime probe: says only whether the app and its database answer. No details, no data.
export const dynamic = 'force-dynamic'

export async function GET() {
  let db = false
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (url && key) {
      const sb = createClient(url, key, { auth: { persistSession: false } })
      const { error } = await sb.from('settings').select('*', { head: true, count: 'exact' }).limit(1)
      db = !error
    }
  } catch { db = false }
  return NextResponse.json({ ok: db, db, time: new Date().toISOString() }, { status: db ? 200 : 503, headers: { 'Cache-Control': 'no-store' } })
}
