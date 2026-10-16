import { NextRequest } from 'next/server'
import { apiHandler, ok, getSession } from '@/lib/api'

// Lets the client confirm its stored token is still valid (not revoked by a password change)
export const GET = apiHandler(async (req: NextRequest) => {
  await getSession(req)
  return ok({ valid: true })
})
