import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase-db'
import { getGateway } from '@/lib/gateway'
import { sign } from '@/lib/gateway/simulator'
import { isProductionEnv } from '@/lib/devOnly'

// PRACTICE gateway only: lets the practice pay page act like the bank. 404 on the live site and whenever the practice gateway is off.
const off = () => NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
const practiceOn = async () => !isProductionEnv() && (await getGateway())?.name === 'simulator'

export async function GET(req: NextRequest) {
  if (!(await practiceOn())) return off()
  const id = new URL(req.url).searchParams.get('linkId') || ''
  const { data: l } = await getSupabase().from('payment_links').select('link_id, status, base_amount, fee_percent, fee_amount, total_amount, kind, expires_at').eq('link_id', id).maybeSingle()
  if (!l) return off()
  return NextResponse.json({ success: true, data: l })
}

export async function POST(req: NextRequest) {
  if (!(await practiceOn())) return off()
  const { linkId, outcome, method } = await req.json().catch(() => ({}))
  const { data: l } = await getSupabase().from('payment_links').select('link_id, total_amount, status').eq('link_id', String(linkId || '')).maybeSingle()
  if (!l) return off()
  const body = JSON.stringify({
    linkId: l.link_id, status: outcome === 'failed' ? 'failed' : 'paid', amount: Number(l.total_amount), method: ['upi', 'card', 'netbanking'].includes(method) ? method : 'upi',
    gatewayPaymentId: `SIM${Date.now()}${Math.floor(Math.random() * 1000)}`, paidAt: new Date().toISOString(),
  })
  const r = await fetch(`${req.nextUrl.origin}/api/gateway/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-gateway-signature': await sign(body) }, body })
  const j = await r.json().catch(() => ({}))
  return NextResponse.json({ success: r.ok, message: j.message || j.error }, { status: r.ok ? 200 : 502 })
}
