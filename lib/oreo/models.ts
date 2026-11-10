import Anthropic from '@anthropic-ai/sdk'
import { getConfig } from '@/lib/integrations'
import { getSupabase } from '@/lib/supabase-db'
import { claudeCostUsd } from '@/lib/aiPricing'
import { OPENROUTER_BASE } from '@/lib/slipReader'

// The models Oreo can think with. The owner switches between them; Oreo recommends a switch when a task needs it.
export type Tier = 'haiku' | 'sonnet' | 'opus'
export const TIERS: Record<Tier, { label: string; anthropic: string; openrouter: string; effort: 'low' | 'medium' | 'high'; use: string; perMillionIn: number; perMillionOut: number }> = {
  haiku:  { label: 'Haiku 5.5',  anthropic: 'claude-haiku-5-5',  openrouter: 'anthropic/claude-haiku-5.5',  effort: 'medium', use: 'quick lookups and simple questions', perMillionIn: 0.1, perMillionOut: 0.5 },
  sonnet: { label: 'Sonnet 5.5', anthropic: 'claude-sonnet-5-5', openrouter: 'anthropic/claude-sonnet-5.5', effort: 'medium', use: 'everyday questions, reports and actions', perMillionIn: 2, perMillionOut: 10 },
  opus:   { label: 'Opus 5.5',   anthropic: 'claude-opus-5-5',   openrouter: 'anthropic/claude-opus-5.5',   effort: 'high',   use: 'complex analysis, audits and forecasts', perMillionIn: 4, perMillionOut: 20 },
}
export type Provider = 'anthropic' | 'openrouter'

export type Block = { type: string; [k: string]: unknown }
export type Canon = { role: 'user' | 'assistant'; content: string | Block[] }
export type ToolDef = { name: string; description: string; input_schema: Record<string, unknown> }
export type TurnResult = { text: string; toolUses: { id: string; name: string; input: Record<string, unknown> }[]; assistantBlocks: Block[]; inTokens: number; outTokens: number; cachedTokens: number; costUsd: number; stop: string; model: string; provider: Provider }

export async function pickProvider(): Promise<Provider | null> {
  if (process.env.OREO_FAKE_MODEL === '1') return 'openrouter'   // offline tests only: never set on the server
  if (await getConfig('ANTHROPIC_API_KEY')) return 'anthropic'
  if (await getConfig('OPENROUTER_API_KEY')) return 'openrouter'
  return null
}

/** Why there is no key: not set at all, or saved on the live server but unreadable here (each computer has its own secret). */
export async function noProviderMessage(): Promise<string> {
  try {
    const { data } = await getSupabase().from('integration_secrets').select('name').in('name', ['ANTHROPIC_API_KEY', 'OPENROUTER_API_KEY'])
    if (data?.length) return 'A key is saved in Dev > AI keys, but this computer cannot read it (keys are encrypted with each server\'s own secret, so only the live server can). For testing on localhost, put OPENROUTER_API_KEY=... (or ANTHROPIC_API_KEY=...) in the .env.local file and restart.'
  } catch { /* fall through */ }
  return 'Oreo needs an AI key. Add a Claude or OpenRouter key in Dev > AI keys.'
}

let anth: { key: string; c: Anthropic } | null = null
async function anthropicClient() {
  const key = await getConfig('ANTHROPIC_API_KEY')
  if (!key) throw new Error('No Claude key is set')
  if (!anth || anth.key !== key) anth = { key, c: new Anthropic({ apiKey: key, timeout: 90_000, maxRetries: 1 }) }
  return anth.c
}

// Offline test double (OREO_FAKE_MODEL=1): picks a tool from the words of the question, then answers from the tool result. No network, no cost.
function fakeTurn(tier: Tier, messages: Canon[]): TurnResult {
  const last = messages[messages.length - 1]
  const base = { inTokens: 100, outTokens: 20, cachedTokens: 0, costUsd: 0, stop: 'end_turn', model: 'fake', provider: 'openrouter' as Provider }
  if (Array.isArray(last.content) && last.content.some(b => b.type === 'tool_result')) {
    const r = last.content.filter(b => b.type === 'tool_result').map(b => String(b.content)).join(' | ')
    return { ...base, text: `(test answer on ${tier}) ${r.slice(0, 300)}`, toolUses: [], assistantBlocks: [{ type: 'text', text: 'ok' }] }
  }
  const q = String(typeof last.content === 'string' ? last.content : '').toLowerCase()
  const id = (String(typeof last.content === 'string' ? last.content : '').match(/LEAD-[A-Za-z0-9-]+/) || [''])[0]
  const pick = (name: string, input: Record<string, unknown> = {}) => ({ ...base, text: '', stop: 'tool_use', toolUses: [{ id: 'fake_1', name, input }], assistantBlocks: [{ type: 'tool_use', id: 'fake_1', name, input }] })
  if (q.includes('switch')) return pick('suggest_model_switch', { to: 'opus', reason: 'complex test' })
  if (q.includes('remember rule')) return pick('remember', { kind: 'rule', title: 'Test rule', body: 'Test rule body from the fake model.' })
  if (q.includes('remember')) return pick('remember', { kind: 'fact', title: 'Test fact', body: 'Test fact body from the fake model.' })
  if (q.includes('approve')) return pick('approve_lead', { lead_id: id })
  if (q.includes('disburse')) return pick('disburse_lead', { lead_id: id })
  if (q.includes('overdue')) return pick('overdue_customers', { limit: 3 })
  if (q.includes('queue')) return pick('disbursement_queue')
  if (q.includes('notify')) return pick('notify_guarantor', { guarantor_code: 'ZZNONE', title: 't', message: 'm' })
  if (q.includes('brain') || q.includes('how do')) return pick('search_brain', { query: 'bank file' })
  if (q.includes('business') || q.includes('attention')) return pick('business_snapshot')
  return { ...base, text: `(test answer on ${tier}) Hello, I am Oreo.`, toolUses: [], assistantBlocks: [{ type: 'text', text: 'hello' }] }
}

export async function callModel(provider: Provider, tier: Tier, system: string, messages: Canon[], tools: ToolDef[], maxTokens = 6000): Promise<TurnResult> {
  if (process.env.OREO_FAKE_MODEL === '1') return fakeTurn(tier, messages)
  return provider === 'anthropic' ? callAnthropic(tier, system, messages, tools, maxTokens) : callOpenRouter(tier, system, messages, tools, maxTokens)
}

async function callAnthropic(tier: Tier, system: string, messages: Canon[], tools: ToolDef[], maxTokens: number): Promise<TurnResult> {
  const t = TIERS[tier]
  const res = await (await anthropicClient()).messages.create({
    model: t.anthropic, max_tokens: maxTokens, system,
    messages: messages as unknown as Anthropic.MessageParam[],
    tools: tools.map(x => ({ name: x.name, description: x.description, input_schema: x.input_schema })) as unknown as Anthropic.Tool[],
    thinking: { type: 'adaptive' },
    output_config: { effort: t.effort },
  } as unknown as Anthropic.MessageCreateParamsNonStreaming) as Anthropic.Message
  const cacheRead = res.usage.cache_read_input_tokens || 0, cacheWrite = res.usage.cache_creation_input_tokens || 0
  const blocks = res.content as unknown as Block[]
  return {
    text: blocks.filter(b => b.type === 'text').map(b => String(b.text || '')).join('\n').trim(),
    toolUses: blocks.filter(b => b.type === 'tool_use').map(b => ({ id: String(b.id), name: String(b.name), input: (b.input || {}) as Record<string, unknown> })),
    assistantBlocks: blocks,   // kept exactly as returned (thinking blocks included) for the next step of the same turn
    inTokens: res.usage.input_tokens + cacheRead + cacheWrite, outTokens: res.usage.output_tokens, cachedTokens: cacheRead,
    costUsd: claudeCostUsd(t.anthropic, { input: res.usage.input_tokens, output: res.usage.output_tokens, cacheRead, cacheWrite5m: cacheWrite }),
    stop: res.stop_reason || '', model: t.anthropic, provider: 'anthropic',
  }
}

type OAIMsg = { role: 'system' | 'user' | 'assistant' | 'tool'; content?: string | null; tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[]; tool_call_id?: string }
function toOpenAI(system: string, messages: Canon[]): OAIMsg[] {
  const out: OAIMsg[] = [{ role: 'system', content: system }]
  for (const m of messages) {
    if (typeof m.content === 'string') { out.push({ role: m.role, content: m.content }); continue }
    if (m.role === 'assistant') {
      const text = m.content.filter(b => b.type === 'text').map(b => String(b.text || '')).join('\n')
      const calls = m.content.filter(b => b.type === 'tool_use').map(b => ({ id: String(b.id), type: 'function' as const, function: { name: String(b.name), arguments: JSON.stringify(b.input || {}) } }))
      out.push({ role: 'assistant', content: text || null, ...(calls.length ? { tool_calls: calls } : {}) })
    } else {
      for (const b of m.content) {
        if (b.type === 'tool_result') out.push({ role: 'tool', tool_call_id: String(b.tool_use_id), content: typeof b.content === 'string' ? b.content : JSON.stringify(b.content) })
        else if (b.type === 'text') out.push({ role: 'user', content: String(b.text || '') })
      }
    }
  }
  return out
}

async function callOpenRouter(tier: Tier, system: string, messages: Canon[], tools: ToolDef[], maxTokens: number): Promise<TurnResult> {
  const t = TIERS[tier]
  const apiKey = await getConfig('OPENROUTER_API_KEY')
  if (!apiKey) throw new Error('No OpenRouter key is set')
  const res = await fetch(`${OPENROUTER_BASE()}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json', 'X-Title': 'NGF CRM Oreo' },
    body: JSON.stringify({
      model: t.openrouter, max_tokens: maxTokens, stream: false, usage: { include: true }, tool_choice: 'auto',
      tools: tools.map(x => ({ type: 'function', function: { name: x.name, description: x.description, parameters: x.input_schema } })),
      messages: toOpenAI(system, messages),
    }),
    signal: AbortSignal.timeout(90_000),
  })
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text().catch(() => '')).trim().slice(0, 200)}`)
  const j = await res.json() as { choices?: { message?: { content?: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] }; finish_reason?: string }[]; usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number; prompt_tokens_details?: { cached_tokens?: number } }; error?: { message?: string } }
  const msg = j.choices?.[0]?.message
  if (!msg) throw new Error(`OpenRouter gave no answer${j.error?.message ? `: ${String(j.error.message).slice(0, 150)}` : ''}`)
  const toolUses = (msg.tool_calls || []).map(c => { let input: Record<string, unknown> = {}; try { input = JSON.parse(c.function.arguments || '{}') } catch { /* bad JSON: empty input, the tool will say what is missing */ } return { id: c.id, name: c.function.name, input } })
  const text = String(msg.content || '').trim()
  const blocks: Block[] = [...(text ? [{ type: 'text', text }] : []), ...toolUses.map(u => ({ type: 'tool_use', id: u.id, name: u.name, input: u.input }))]
  return {
    text, toolUses, assistantBlocks: blocks, inTokens: j.usage?.prompt_tokens || 0, outTokens: j.usage?.completion_tokens || 0, cachedTokens: j.usage?.prompt_tokens_details?.cached_tokens || 0,
    costUsd: Number(j.usage?.cost) || 0, stop: j.choices?.[0]?.finish_reason || '', model: t.openrouter, provider: 'openrouter',
  }
}

/** Rough cost of one answer on a model, in dollars, for the "switch to Opus (about ₹X)?" suggestion. */
export function typicalAnswerUsd(tier: Tier): number { const t = TIERS[tier]; return (6000 * t.perMillionIn + 900 * t.perMillionOut) / 1e6 }
