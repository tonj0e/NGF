// The Agent ID of a signed-in NGF AGENT, read as one row (agents.user_id is unique and indexed) instead of the whole Agents table.
// A found id is kept 30 seconds per server process, the same age readTable('Agents') accepted on these paths before; a miss is
// never kept, so a newly created agent works at once. Callers that ask at the same time share one database call.
import { getSupabase } from './supabase-db'

const KEEP_MS = 30_000
const hits = new Map<string, { id: string; at: number }>()
const inflight = new Map<string, Promise<string>>()

/** The agent_id whose user_id is `userId`, or '' when there is none. Throws on a database error. */
export async function agentIdOfUser(userId: string): Promise<string> {
  if (!userId) return ''
  const hit = hits.get(userId)
  if (hit && Date.now() - hit.at < KEEP_MS) return hit.id
  const pending = inflight.get(userId)
  if (pending) return pending
  const p = (async () => {
    const { data, error } = await getSupabase().from('agents').select('agent_id').eq('user_id', userId).limit(1)
    if (error) throw new Error(`Failed to read Agents: ${error.message}`)
    const id = String(data?.[0]?.agent_id || '')
    if (id) {
      hits.set(userId, { id, at: Date.now() })
      if (hits.size > 500) for (const k of hits.keys()) { hits.delete(k); if (hits.size <= 250) break }
    }
    return id
  })()
  inflight.set(userId, p)
  try { return await p } finally { inflight.delete(userId) }
}
