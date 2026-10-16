import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/api'
import { generateCsrfToken, createCsrfResponse } from '@/lib/csrf'

export const GET = async (req: NextRequest) => {
  try {
    const session = await getSession(req)
    const token = await generateCsrfToken(session.userId)
    return createCsrfResponse(token)
  } catch {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
}