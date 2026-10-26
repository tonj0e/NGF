import { NextRequest, NextResponse } from 'next/server'
import { getGateway } from '@/lib/gateway'
import { settleFromEvent } from '@/lib/paymentLinks'
import { reportError } from '@/lib/monitor'

// PUBLIC: the bank's gateway calls this when a payment succeeds or fails. Nothing is trusted without the gateway's signature.
// Give this URL to the bank as the callback / webhook URL.
export async function POST(req: NextRequest) {
  const gateway = await getGateway()
  if (!gateway) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
  const raw = await req.text()
  const ev = gateway.verifyWebhook(raw, req.headers)
  if (!ev) return NextResponse.json({ success: false, error: 'Invalid signature' }, { status: 401 })
  try {
    const r = await settleFromEvent(ev)
    return NextResponse.json({ success: r.status < 400, message: r.message }, { status: r.status })
  } catch (e) {
    reportError('gateway webhook failed', e)
    return NextResponse.json({ success: false, error: 'Could not process' }, { status: 500 })   // the gateway will retry
  }
}
