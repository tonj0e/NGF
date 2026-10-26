import { NextRequest } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { apiHandler, requireRole, ok, err } from '@/lib/api'
import { csrfProtection } from '@/lib/csrf'
import { ensureSentry } from '@/lib/monitor'

// Admin only: sends one test error to Sentry from the server, so you can see it arrive (and the alert fire).
export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ['Admin'])
  const csrfError = csrfProtection(req, session.userId)
  if (csrfError) return csrfError
  if (!(await ensureSentry())) return err('Error tracking is not connected yet. Paste the Sentry key above first.')
  Sentry.captureException(new Error('Test error from the NGF Dev panel (server). Safe to ignore.'), { tags: { where: 'dev-test' }, user: { id: session.userId } })
  await Sentry.flush(3000)
  return ok({ sent: true })
})
