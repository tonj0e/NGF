import { NextRequest } from 'next/server'
import { apiHandler, requireRole, ok, err } from '@/lib/api'
import { csrfProtection } from '@/lib/csrf'
import { createAuditLogger } from '@/lib/audit'
import { getSupabase } from '@/lib/supabase-db'
import { TOOL_BY_NAME } from '@/lib/oreo/tools'

// The owner's answer to a confirm card. Only here do money actions run, and only as the signed-in owner, through the CRM's own API.
export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ['Admin'])
  const csrf = csrfProtection(req, session.userId); if (csrf) return csrf
  const body = await req.json().catch(() => ({}))
  const sb = getSupabase()
  const { data: a } = await sb.from('oreo_actions').select('*').eq('id', String(body.actionId || '')).maybeSingle()
  if (!a || a.created_by !== session.userId) return err('Action not found', 404)
  if (a.status !== 'pending') return err(`This card was already ${a.status}.`)
  const via = ['button', 'typed', 'voice'].includes(body.via) ? body.via : 'button'
  const ageMin = (Date.now() - new Date(a.created_at).getTime()) / 60_000
  const audit = createAuditLogger(req, session)

  if (body.decision === 'cancel') {
    await sb.from('oreo_actions').update({ status: 'cancelled', decided_at: new Date().toISOString(), via, result: 'Cancelled by the owner' }).eq('id', a.id)
    await audit.log('OREO_ACTION_CANCELLED', 'OreoAction', a.id, { tool: a.tool })
    return ok({ status: 'cancelled', message: 'Cancelled. Nothing was changed.' })
  }
  if (body.decision !== 'confirm') return err('Choose confirm or cancel')
  if (ageMin > (via === 'voice' ? 5 : 30)) {
    await sb.from('oreo_actions').update({ status: 'expired', decided_at: new Date().toISOString(), result: 'Expired' }).eq('id', a.id)
    return err(via === 'voice' ? 'That card is older than 5 minutes. Please press Confirm on the card.' : 'This card expired. Ask Oreo to prepare it again.')
  }
  const spec = TOOL_BY_NAME.get(a.tool)
  if (!spec?.execute) return err('This action cannot be run')
  // claim it first so a double tap or a second device cannot run it twice
  const { data: claimed } = await sb.from('oreo_actions').update({ status: 'done', confirmed_by: session.userId, via, decided_at: new Date().toISOString() }).eq('id', a.id).eq('status', 'pending').select('id')
  if (!claimed?.length) return err('This card was already used.')
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const message = await spec.execute(a.input as Record<string, any>, { req, userId: session.userId, userName: session.name, threadId: a.thread_id || '', tier: 'sonnet' })
    await sb.from('oreo_actions').update({ result: message.slice(0, 500) }).eq('id', a.id)
    await audit.log('OREO_ACTION_DONE', 'OreoAction', a.id, { tool: a.tool, via, summary: String(a.summary).slice(0, 300) })
    if (a.thread_id) await sb.from('oreo_messages').insert({ thread_id: a.thread_id, role: 'assistant', content: { action: a.id }, text: `Done: ${message}` })
    return ok({ status: 'done', message })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed'
    await sb.from('oreo_actions').update({ status: 'failed', result: msg.slice(0, 500) }).eq('id', a.id)
    await audit.log('OREO_ACTION_FAILED', 'OreoAction', a.id, { tool: a.tool, via, error: msg.slice(0, 200) }, false, msg.slice(0, 200))
    return err(`It did not go through: ${msg}`)
  }
})

// pending cards of one conversation (so the screen can show them again after a refresh)
export const GET = apiHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ['Admin'])
  const threadId = new URL(req.url).searchParams.get('threadId') || ''
  const { data } = await getSupabase().from('oreo_actions').select('id, tool, summary, status, created_at, result, via').eq('created_by', session.userId).eq('risk', 'money').eq(threadId ? 'thread_id' : 'status', threadId || 'pending').order('created_at', { ascending: false }).limit(20)
  return ok({ actions: data || [] })
})
