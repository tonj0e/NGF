import { NextRequest } from 'next/server'
import { apiHandler, requireRole, ok } from '@/lib/api'
import { voiceStatus } from '@/lib/oreo/voice'

// Which voice service the chat screen should use (names only, never keys).
export const GET = apiHandler(async (req: NextRequest) => { await requireRole(req, ['Admin']); return ok(await voiceStatus()) })
