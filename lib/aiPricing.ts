// Anthropic API prices, USD per million tokens (MTok). Source: Anthropic "Pricing" page, copied 2026-11-09. Check claude.com/pricing for changes.
// Used by the cost meter (Claude direct calls) and shown on the AI page > Pricing tab.
export type ModelPrice = {
  id: string; name: string; note: string
  input: number; output: number; write5m: number; write1h: number; cacheRead: number   // standard
  batchIn: number; batchOut: number
  longInput?: number; longOutput?: number; longWrite5m?: number; longWrite1h?: number; longCacheRead?: number; longBatchIn?: number; longBatchOut?: number   // prompts over 100,000 tokens (Haiku 5.5 only)
}

export const ANTHROPIC_PRICES: ModelPrice[] = [
  { id: 'claude-fable-5-1',  name: 'Claude Fable 5.1',  note: 'Demanding reasoning and long-horizon agentic work', input: 10, output: 50, write5m: 12.5, write1h: 20, cacheRead: 0.25, batchIn: 5, batchOut: 25 },
  { id: 'claude-opus-5-5',   name: 'Claude Opus 5.5',   note: 'Long-running agentic coding and knowledge work', input: 4, output: 20, write5m: 5, write1h: 8, cacheRead: 0.2, batchIn: 2, batchOut: 10 },
  { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', note: 'Best combination of speed and intelligence', input: 2, output: 10, write5m: 2.5, write1h: 4, cacheRead: 0.1, batchIn: 1, batchOut: 5 },
  { id: 'claude-haiku-5-5',  name: 'Claude Haiku 5.5',  note: 'High-volume, latency-sensitive tasks (what the screenshot reader uses)', input: 0.1, output: 0.5, write5m: 0.125, write1h: 0.2, cacheRead: 0.01, batchIn: 0.05, batchOut: 0.25,
    longInput: 0.5, longOutput: 2.5, longWrite5m: 0.625, longWrite1h: 1, longCacheRead: 0.05, longBatchIn: 0.25, longBatchOut: 1.25 },
  { id: 'claude-mythos-5-1', name: 'Claude Mythos 5.1', note: '', input: 10, output: 50, write5m: 12.5, write1h: 20, cacheRead: 0.25, batchIn: 5, batchOut: 25 },
  { id: 'claude-fable-5',    name: 'Claude Fable 5',    note: '', input: 10, output: 50, write5m: 12.5, write1h: 20, cacheRead: 1, batchIn: 5, batchOut: 25 },
  { id: 'claude-mythos-5',   name: 'Claude Mythos 5',   note: '', input: 10, output: 50, write5m: 12.5, write1h: 20, cacheRead: 1, batchIn: 5, batchOut: 25 },
  { id: 'claude-opus-5',     name: 'Claude Opus 5',     note: '', input: 5, output: 25, write5m: 6.25, write1h: 10, cacheRead: 0.5, batchIn: 2.5, batchOut: 12.5 },
  { id: 'claude-opus-4-8',   name: 'Claude Opus 4.8',   note: '', input: 5, output: 25, write5m: 6.25, write1h: 10, cacheRead: 0.5, batchIn: 2.5, batchOut: 12.5 },
  { id: 'claude-opus-4-7',   name: 'Claude Opus 4.7',   note: '', input: 5, output: 25, write5m: 6.25, write1h: 10, cacheRead: 0.5, batchIn: 2.5, batchOut: 12.5 },
  { id: 'claude-opus-4-6',   name: 'Claude Opus 4.6',   note: '', input: 5, output: 25, write5m: 6.25, write1h: 10, cacheRead: 0.5, batchIn: 2.5, batchOut: 12.5 },
  { id: 'claude-opus-4-5',   name: 'Claude Opus 4.5',   note: '', input: 5, output: 25, write5m: 6.25, write1h: 10, cacheRead: 0.5, batchIn: 2.5, batchOut: 12.5 },
  { id: 'claude-opus-4-1',   name: 'Claude Opus 4.1',   note: '', input: 15, output: 75, write5m: 18.75, write1h: 30, cacheRead: 1.5, batchIn: 7.5, batchOut: 37.5 },
  { id: 'claude-opus-4',     name: 'Claude Opus 4',     note: '', input: 15, output: 75, write5m: 18.75, write1h: 30, cacheRead: 1.5, batchIn: 7.5, batchOut: 37.5 },
  { id: 'claude-sonnet-5',   name: 'Claude Sonnet 5',   note: '', input: 2, output: 10, write5m: 2.5, write1h: 4, cacheRead: 0.2, batchIn: 1, batchOut: 5 },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', note: '', input: 3, output: 15, write5m: 3.75, write1h: 6, cacheRead: 0.3, batchIn: 1.5, batchOut: 7.5 },
  { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', note: '', input: 3, output: 15, write5m: 3.75, write1h: 6, cacheRead: 0.3, batchIn: 1.5, batchOut: 7.5 },
  { id: 'claude-sonnet-4',   name: 'Claude Sonnet 4',   note: '', input: 3, output: 15, write5m: 3.75, write1h: 6, cacheRead: 0.3, batchIn: 1.5, batchOut: 7.5 },
  { id: 'claude-haiku-4-5',  name: 'Claude Haiku 4.5',  note: '', input: 1, output: 5, write5m: 1.25, write1h: 2, cacheRead: 0.1, batchIn: 0.5, batchOut: 2.5 },
]

export const PRICING_NOTES = [
  'Prices are USD per million tokens (MTok). A cache hit costs a fraction of the normal input price (Opus 5.5: 5%, Sonnet 5.5: 5%, Fable 5.1 and Mythos 5.1: 2.5%, others: 10%).',
  'Claude Haiku 5.5: prompts over 100,000 tokens pay the higher prices shown in the second line. All other 5.x models have one price for the whole 1M context.',
  'Batch API: 50% off input and output, for work that can wait. Not available with fast mode.',
  'US-only processing (inference_geo "us") on Claude 4.6 and later: 1.1x on every price. Fast mode (Opus 5.5 $8 in / $40 out; Opus 5 and 4.8 $10 / $50) stacks with caching and data residency.',
  'Claude 4.7 and later models use a newer tokenizer that makes about 30% more tokens for the same text.',
  'Web search: $10 per 1,000 searches plus tokens. Web fetch: tokens only. Code execution: free with web search or fetch; otherwise 1,550 free hours a month, then $0.05 per hour. Managed Agents: $0.08 per session-hour plus tokens.',
]

export function priceFor(modelId: string): ModelPrice | undefined { return ANTHROPIC_PRICES.find(p => p.id === modelId) }

// Cost in USD of one Claude call. `inputTokens` here is the NEW input only (Anthropic reports cache reads and writes separately).
export function claudeCostUsd(modelId: string, u: { input: number; output: number; cacheRead?: number; cacheWrite5m?: number; cacheWrite1h?: number }): number {
  const p = priceFor(modelId)
  if (!p) return 0
  const cr = u.cacheRead || 0, w5 = u.cacheWrite5m || 0, w1 = u.cacheWrite1h || 0
  const long = !!p.longInput && (u.input + cr + w5 + w1) > 100_000   // the prompt length counts every input token, cached or not
  const inP = long ? p.longInput! : p.input, outP = long ? p.longOutput! : p.output
  const wr5 = long ? p.longWrite5m! : p.write5m, wr1 = long ? p.longWrite1h! : p.write1h, rd = long ? p.longCacheRead! : p.cacheRead
  return (u.input * inP + u.output * outP + w5 * wr5 + w1 * wr1 + cr * rd) / 1e6
}
