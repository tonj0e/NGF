import { NextRequest } from 'next/server'
import { apiHandler, requireRole, ok, err } from '@/lib/api'
import { buildTopic } from '@/lib/oreo/topics'

// The page Oreo opens for one part of the business (collection, leads, ...): who feeds it, what it holds, what comes out.
export const GET = apiHandler(async (req: NextRequest) => {
  await requireRole(req, ['Admin'])
  const key = new URL(req.url).searchParams.get('key') || ''
  const t = await buildTopic(key)
  return t ? ok(t) : err('Unknown topic')
})
