import { NextRequest } from 'next/server'
import { apiHandler, requireRole, ok, err } from '@/lib/api'
import { getSupabase } from '@/lib/supabase-db'

// Conversation history (Oreo's "History"): the list, or one conversation's messages.
export const GET = apiHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ['Admin'])
  const id = new URL(req.url).searchParams.get('id')
  const sb = getSupabase()
  if (id) {
    const { data: t } = await sb.from('oreo_threads').select('id, title, updated_at').eq('id', id).eq('user_id', session.userId).maybeSingle()
    if (!t) return err('Conversation not found', 404)
    const { data } = await sb.from('oreo_messages').select('id, role, text, content, model, cost_usd, created_at').eq('thread_id', id).order('created_at').limit(200)
    return ok({ thread: t, messages: data || [] })
  }
  const { data } = await sb.from('oreo_threads').select('id, title, updated_at').eq('user_id', session.userId).order('updated_at', { ascending: false }).limit(40)
  return ok({ threads: data || [] })
})
