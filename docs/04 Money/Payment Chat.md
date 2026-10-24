---
title: Payment Chat
section: Money
status: built, waiting for the Claude API key
last_verified: 2026-10-25
tags: [ngf, money, payments, utr, ai]
---
# Payment Chat
**Guarantors send UPI screenshots in the portal (replaces the WhatsApp group). Claude reads the UTR, amount, date and time; clean payments are recorded automatically through the same code as Payment Matching.**

## Flow
1. Guarantor opens **Payment Chat** (menu; needs the `upiPayments` switch, same as Payment Matching), taps **Single payment** or **Multi payment**, searches the customer by the 4-digit code (the last 4 digits of the loan ID) or name, uploads the screenshot.
2. Server (`lib/paymentChat.ts` `submitSlip`): saves the picture to Google Drive, checks limits, reads it with Claude (`lib/slipReader.ts`), then:
   - not a payment screen / blurry / no UTR or amount → **Needs Retake** (blocks the next send)
   - payment not successful → **Not Successful** (blocks)
   - amount ≠ total of the chosen customers' weekly amounts → **Amount Mismatch** (blocks)
   - payee does not match the Admin's "payments must go to" setting (if set) → **Wrong Payee** (blocks)
   - same UTR already recorded, or the same picture already used → **Duplicate**, naming the customer(s) it was recorded for (blocks)
   - reading off / key missing / daily cap reached / date older than 14 days or future / confidence not high → **Pending Staff** (office confirms by typing the UTR; does not block)
   - everything fine → `markPayment` (mode UPI, same duplicate-UTR rules, repayments Paid, collections row, loan completion) → **Recorded**
3. The guarantor fixes a blocked message with **Send a new screenshot** or **Change customer** (same message is re-checked). Until then the Single/Multi buttons are disabled and the API refuses a new message.
4. Staff with the feature, branch managers and Admin see the chat for their branch's guarantors, can reply, and confirm Pending Staff messages.

## Cost safety (hard limits)
Model `claude-haiku-5-5` only, no tools, thinking off, answer capped at 500 tokens, picture shrunk in the browser and by the API (about 1,500 tokens). About 2 paise per screenshot. Admin panel on the page: Admin on/off switch, daily limit for all (default 3000), daily limit per guarantor (default 300), "payments must go to" text, and a cost meter (estimates from published prices; the real bill is in the Anthropic account where a monthly spending limit should be set). A picture already recorded is never read twice (SHA-256 of the image). Without `ANTHROPIC_API_KEY` nothing is read and every screenshot goes to the office.

## Storage
Google Drive: `Payment Screenshots / <date sent, IST> / <guarantor code> / <customer 4-digit code>`. A multi payment keeps a copy in each customer's folder. The URL is saved on the message and on the payment (`payment_groups.screenshot_file_id`). `lib/fileAccess.ts` lets a guarantor open only pictures from their own chat. (The Supabase storage buckets `payment-proofs` etc. do not exist in the live project, so uploads that use `saveFileSupabase` fail with "Bucket not found". Payment Matching screenshot upload and repayment proofs are affected.)

## Data
Table `payment_chat` (migration `20261024200000_payment_chat.sql`, applied 2026-10-25): one row per message, with tokens and estimated cost per reading. Settings in `settings`: `slip:enabled`, `slip:daily_cap`, `slip:guarantor_cap`, `slip:payee`. Audit: `PAYMENT_CHAT_SUBMIT`, `PAYMENT_CHAT_APPROVE`, `PAYMENT_CHAT_SETTINGS`.

## Files
`lib/slipReader.ts`, `lib/paymentChat.ts`, `app/api/payment-chat/route.ts`, `components/pages/PaymentChatPage.tsx`; `lib/payments.ts` (`screenshotUrl` on `MarkInput`, `needGuarantor` exported, staff `paymentChat` permission counts as view); menus in `components/AppShell.tsx`; features in `lib/config.ts`.

## Not yet done / known limits
- Needs `ANTHROPIC_API_KEY` in `.env.local` and in the live host's environment; the AI reading path is untested until then.
- Saving the training data for a future own reader: every message already stores the picture, the reading and (when staff confirm) the answer.
- A race where two people record the same UTR at once can leave a Flagged payment holding the week; the guarantor then cannot resend (staff discard it in Payment Matching).
