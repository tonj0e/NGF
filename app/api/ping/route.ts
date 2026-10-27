import { NextRequest, NextResponse } from 'next/server'

// Tiny public probe the agent's phone uses to measure its own network (the green / orange / red light).
// GET answers at once. POST takes a small body and says how many bytes arrived, so upload speed can be timed.
// Touches no database and returns no data.
export const dynamic = 'force-dynamic'
const MAX_BODY = 64 * 1024
const headers = { 'Cache-Control': 'no-store' }

export async function GET() {
  return NextResponse.json({ ok: true }, { headers })
}

export async function POST(req: NextRequest) {
  const declared = Number(req.headers.get('content-length') || 0)
  if (declared > MAX_BODY) return NextResponse.json({ ok: false }, { status: 413, headers })
  const bytes = (await req.arrayBuffer()).byteLength
  if (bytes > MAX_BODY) return NextResponse.json({ ok: false }, { status: 413, headers })
  return NextResponse.json({ ok: true, bytes }, { headers })
}
