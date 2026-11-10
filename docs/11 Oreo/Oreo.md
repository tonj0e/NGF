# Oreo — the owner's AI assistant

Built 2026-11-10 (design: `docs/superpowers/specs/2026-11-10-oreo-design.md`). Admin only. The Admin menu item **Oreo (AI)** opens Oreo; the **Activity** button (top right) opens the old AI page (Activity, Logs, Pricing), and **Brain** opens Oreo's brain.

## The page (`components/pages/OreoPage.tsx`)
- Live business map (`components/oreo/OreoMap.tsx`): Leads, Verification, Approval, Disbursement, Loans, Collection, Payments with live numbers; click opens the page, "Ask" sends a question to Oreo. Numbers come from `/api/oreo/overview` (30 s refresh).
- Needs you: overdue weeks, payment screenshots needing staff, leads awaiting approval, approved waiting to be paid, returned leads, pending confirm cards, rules to approve, failed AI calls, near the daily limit.
- Oreo's work: questions and actions by period (Today ... All time), spend in $ and ₹, today against the daily limit.
- Chat panel (`OreoChat.tsx`): orb (tap to talk), English/Malayalam, voice on/off, hands-free, model picker (Auto, Haiku 5.5, Sonnet 5.5, Opus 5.5), History, confirm cards, cost per answer.

## The brain (`lib/oreo/brain.ts`, tables `oreo_brain`, `oreo_brain_versions`)
Kinds: rule, fact, preference, playbook. Pinned notes are read before every answer; others are found by full-text search; the `docs/` vault is searched read only. Rules written by Oreo wait as "pending" until approved. Every edit keeps the old version (undo). Text that looks like a password, key or a full account/Aadhaar number is refused. History = `oreo_threads`, `oreo_messages`, `oreo_actions`.

## Tools (`lib/oreo/tools.ts`)
- read: business_snapshot, find_customer, customer_detail, find_leads, collection_report, overdue_customers, disbursement_queue, guarantor_overview, payments_overview, ai_spend, search_brain, read_doc.
- low (runs at once, audited): remember, notify_guarantor, assign_agent, agent_list, return_lead.
- money (Oreo only PREPARES): approve_lead, reject_lead, create_bank_files, disburse_lead, cancel_bank_file. A confirm card is built from the database; the owner presses Confirm (or types/says "confirm" for a card younger than 5 minutes by voice, 30 by typing); the action then runs through the CRM's own API as the owner (`lib/oreo/api.ts`), so every rule, branch check and audit entry applies. One card at a time; a card can be used once. Audit: OREO_ACTION_DONE / CANCELLED / FAILED, OREO_BRAIN_*.
- No tool yet for: recording payments, commission payouts, deleting data, editing customers. Oreo says so.

## Models (`lib/oreo/models.ts`)
Uses the Claude key if set, else OpenRouter (the key set in Dev > AI keys). Haiku 5.5 for quick lookups, Sonnet 5.5 default, Opus 5.5 for hard work. In Auto, Oreo calls `suggest_model_switch` and the screen offers "Switch to Opus and ask again" with an estimated ₹ cost. Every model call is logged in `ai_usage` (category `oreo`; voice `oreo_voice`) so AI > Activity shows Oreo separately. Daily limit (Settings `oreo:daily_cap_usd`, default $2) is checked before each answer.

## Voice (`lib/oreo/voice.ts`)
Listening: Sarvam `saaras:v4` (Malayalam, English, other Indian languages) or ElevenLabs `scribe_v2`. Speaking: Sarvam `bulbul:v3` (Malayalam) or ElevenLabs (`eleven_flash_v2_5` English, `eleven_v4` Malayalam). Keys SARVAM_API_KEY, ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID in Dev > AI keys. With no key the screen uses the browser's own speech (Chrome). Not tested with real keys.

## Safety
Admin only, CSRF on every write, rate limits, daily cost cap, DB text treated as data, confirm cards from the database, no secrets in the brain.

## Testing notes
`OREO_FAKE_MODEL=1` (in `.env.local` only) replaces the model with a scripted test double so the tools, cards and confirm flow can be tested offline: the AI keys are encrypted with the live server's secret and cannot be read on a developer Mac. Never set it on the server. The real model path (Anthropic and OpenRouter adapters) needs a first live check.

## Testing Oreo on localhost
AI keys saved in Dev > AI keys are encrypted with the live server's secret, so a computer with a different `JWT_SECRET` cannot read them (Oreo then explains this). To test locally add `OPENROUTER_API_KEY=...` (or `ANTHROPIC_API_KEY=...`) to `.env.local` and restart `npm run dev`; the environment value is used when the saved one cannot be read. Voice keys (`SARVAM_API_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`) work the same way.
