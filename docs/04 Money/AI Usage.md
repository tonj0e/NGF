---
title: AI Usage
section: Money
status: current
last_verified: 2026-11-09
tags: [ngf, money, ai, tokens, cost]
---
# AI Usage
**One line: the Admin-only "AI" page (menu: below Dev) shows what every AI call used, laid out like the OpenRouter dashboard: NGF > Activity | Logs.**

## Why
The owner is moving from OpenRouter to the Anthropic API directly. Anthropic's console shows only daily totals, so the CRM keeps its own log of every call. It works the same for every provider.

## Where the numbers come from
- `lib/slipReader.ts` `readSlip(...)` logs one row in `ai_usage` after every call (success or error) through `logAiUsage` (never breaks a payment read if the insert fails).
- Claude direct: `usage.input_tokens`, `usage.output_tokens`, `cache_read_input_tokens`, `stop_reason`; cost is worked out from the published price (`USD_PER_M_IN/OUT`). Thinking is counted inside output tokens (no separate number).
- OpenRouter: `usage.prompt_tokens`, `completion_tokens`, `completion_tokens_details.reasoning_tokens`, `prompt_tokens_details.cached_tokens`, `cost` (real cost), `finish_reason`.
- NVIDIA: tokens only, cost 0.
- Context passed from `lib/paymentChat.ts` (`submitSlip`: purpose `slip`, guarantor, message id, user; `testRead`: purpose `test`).

## Table `ai_usage` (migration `20261109120000_ai_usage.sql`)
`created_at, provider, model, purpose, guarantor_id, message_id, user_id, tokens_in, tokens_out, tokens_reasoning, tokens_cached, cost_usd, duration_ms, status (ok|error), finish_reason, error`. RLS on, service role only. The migration also copied the earlier reads from `payment_chat` (input tokens and cost only; no output split for old rows).

## Page (`components/pages/AIPage.tsx`, API `GET /api/ai-usage`, Admin only)
- Date presets in India time: Today, Yesterday, This week, Past 7 days, This month, Past 30 days, Previous month, Custom range.
- **Activity:** cards (total spend, requests, token volume, cache hit rate, average per read, blended $ per 1M tokens, change against the period before), a warning for failed or cut-off calls, charts (spend by day, requests by day, token breakdown, thinking tokens) and usage by model.
- **Logs:** one row per call (date, model, provider, screenshot or test, guarantor, input, output, thinking, cost, speed, result OK / Cut off / Failed). Filters: provider, model, result, guarantor. Sort by date, tokens or cost. Pages of 50. **Download Excel** (up to 5,000 rows).

## Rupees, provider filter, pricing (2026-11-09)
- Every money amount shows dollars and rupees. The rate (rupees per $1) is the box at the top of the page, saved in Settings key `ai:usdInr` (`POST /api/ai-usage`, Admin; default 90 until set).
- **Token volume = input + output tokens** (OpenRouter counts the same way; thinking tokens are inside output). The Activity tab has a provider filter. "All providers" adds NVIDIA's free tokens to OpenRouter's, so compare with OpenRouter's dashboard using the OpenRouter filter.
- **Blended price per 1M** = spend divided by the tokens of calls that cost money only (free NVIDIA tests left out).
- **Pricing tab:** every Anthropic model price from Anthropic's pricing page (copied 2026-11-09) in `lib/aiPricing.ts`, plus notes (Haiku 5.5 long prompts, cache, batch, US-only 1.1x, tokenizer +30%, web search). `claudeCostUsd()` uses it for the cost of Claude direct calls (cache reads and writes included; Haiku 5.5 prompts over 100K tokens use the higher prices). Update the file when Anthropic changes prices.
- History: the OpenRouter rows were rebuilt from OpenRouter's activity CSV on 2026-11-09 (28 reads, 57,746 tokens, $0.009103, matching its dashboard). The first backfill from `payment_chat` had missed 4 reads because a re-sent screenshot resets that row's token count. New reads are logged live, so this can no longer happen.

## Gotchas
- Aggregates are added up in code from the log rows (up to 20,000 rows per request); fine at this volume.
- A call that fails before an answer is logged with zero tokens and status `error`.
- Compare the totals with the Anthropic console now and then; Anthropic also has a usage report API with an admin key (not wired yet).

## Related
- [[Payment Chat]], [[Money Brain]], [[Integrations]]
