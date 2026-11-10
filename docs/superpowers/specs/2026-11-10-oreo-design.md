# Oreo — the owner's AI assistant (design, approved by the owner 2026-11-10)

## Goal
The Admin "AI" page opens on **Oreo**: a live business map, a "Needs you" list, and a chat/voice panel with an assistant that knows NGF, has its own brain (memory), reads live data and can act, with every money action behind a confirm card. A top-right **Activity** button opens the existing Activity / Logs / Pricing.

## Decisions (owner)
- Power: full actions by voice, **money/irreversible actions only after the owner presses or says Confirm** (confirm step approved).
- Voice: natural voice, Malayalam + English: Sarvam AI (listening + speaking, Indian languages) and/or ElevenLabs; browser speech as a free fallback.
- Brain: model chosen per task (Haiku 5.5 basic, Sonnet 5.5 default, Opus 5.5 complex); Oreo recommends a switch; the owner can switch; cost shown per answer and logged in AI > Activity as category Oreo.
- Oreo has its own brain (separate from the NGF docs brain) connected to everything it does.

## Pieces
1. **Page** `components/pages/OreoPage.tsx`: left live map (Leads > Verification > Approval > Disbursement > Loans > Collection > Payments, counts from `/api/oreo/overview`, click opens that page), middle Needs you + stats, right Oreo panel (orb, chat, model picker, cost, mic).
2. **Brain** (`oreo_brain`, versions, threads, messages, actions): kinds rule | fact | preference | playbook; History = threads + actions. Search = Postgres full text over the brain and the `docs/` vault. Rules proposed by Oreo are pending until the owner approves; a rule can add limits, never remove the confirm step.
3. **Tools** (`lib/oreo/tools.ts`), three risk levels: read (free), low (runs, audited: notify, note, assign agent, return lead), money (approve, disburse, bank files, delete: Oreo only *prepares*, a server-built confirm card is shown, the owner confirms, the action then runs through the existing API as the owner so every rule and audit still applies).
4. **Models** (`lib/oreo/models.ts`): Anthropic key if set, else OpenRouter; Auto / Haiku / Sonnet / Opus; usage logged to `ai_usage` (purpose `oreo`, voice `oreo_voice`); daily cost cap.
5. **Voice**: `/api/oreo/stt`, `/api/oreo/tts` with Sarvam and ElevenLabs adapters (keys in Dev > AI keys), browser speech fallback. Spoken "confirm" works only for a pending card shown in the last 5 minutes.

## Safety
Admin only; every tool call audited; DB text is data, never instructions; confirm cards are built from the database, not from model text; no secrets or bank numbers in the brain; daily cap; one pending money action at a time.
