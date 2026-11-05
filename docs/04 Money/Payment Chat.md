---
title: Payment Chat
section: Money
status: built as one Payments module, waiting for the Claude API key
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


## Payments module (restructured 2026-10-25)
One menu item **Payments** (`components/pages/PaymentsPage.tsx`) with parts, shown per permission: **Chat**, **Payment history** (the old UPI Payments / Records), **Mark manually** (old Collect), **Bank check**, **Settings** (Admin: reading on/off, limits, payee, cost meter). Permissions (staff_access.permissions), assigned in the guarantor and staff edit dialogs:

| Key | Meaning | Guarantor | Staff |
|---|---|---|---|
| `payChat` | send / see screenshots, reply, confirm held items | yes | yes |
| `payHistory` | recorded payments | yes (default on until a custom page list is saved) | yes |
| `payMark` | mark by UTR by hand | never | yes |
| `payBank` | bank statement check | never | yes |
| `payOverride` | approve a duplicate UTR | never | yes |

Old keys (`upiPayments`, `upiPaymentsBank`, `upiPaymentsOverride`, `paymentChat`, `gp:payments`, `gp:paymentChat`) were converted once by `20261025100000_payments_module_permissions.sql` and no longer exist.

## Wrong-screenshot allowance
Per guarantor and **collection Saturday** (today if Saturday, else the last Saturday): collections due that Saturday only (older unpaid weeks do not count). Allowance = max(5, 25% of due). Wrong = Needs Retake, Not Successful, Amount Mismatch, Wrong Payee, Duplicate (`payment_chat.wrong_count`). The top strip shows recorded / due, remaining and wrong tries left. When used up (manual mode) no reading happens: the guarantor sends the screenshot and types the transaction ID, which is checked for duplicates and recorded straight away (marked "Typed by the guarantor"; the bank check catches typos). The count starts fresh each Saturday. Staff uploading for a guarantor are not limited.

## Readers: Claude and NVIDIA Nemotron (2026-10-25)
Two readers behind one function (`lib/slipReader.ts` `readSlip(b64, media, provider)`). Admin picks in Payments > Settings: **Automatic** (Claude if `ANTHROPIC_API_KEY` is set, else NVIDIA), **Claude**, or **NVIDIA**. NVIDIA uses the OpenAI-style endpoint `https://integrate.api.nvidia.com/v1/chat/completions` with `NVIDIA_API_KEY`; model from `NVIDIA_MODEL` (default `nvidia/nemotron-nano-12b-v2-vl`, must be a vision model); optional `NVIDIA_BASE_URL`. It is asked for JSON and the answer is cleaned and validated field by field (it cannot force a schema), so a bad answer becomes "not clear enough". The free NVIDIA service is for trying things out (speed limits, the picture is sent to NVIDIA); cost shows as free. Settings has a **Test a screenshot** panel: read one picture with NVIDIA, Claude or both side by side, nothing is recorded. Each message stores which reader read it (`payment_chat.reader`, migration `20261025200000`). To go live on Claude: set `ANTHROPIC_API_KEY`, choose Claude (or leave Automatic), remove `NVIDIA_API_KEY`.

**Keys in the portal (2026-10-25):** Dev > **AI Reader** tab holds `ANTHROPIC_API_KEY`, `NVIDIA_API_KEY` (encrypted, never shown again, Admin password to change) and `NVIDIA_MODEL`, through the same integration store as SMS/WhatsApp (`lib/integrations.ts`, group `ai`). The server environment still works as a fallback. Which reader is used and the test panel stay in Payments > Settings.

## Staff: Resubmit screenshot (2026-11-01)
A message "With the office" (status Pending Staff, for example when the reader failed) now has a **Resubmit screenshot** button for office staff. It opens the same composer as "Send a new screenshot" and re-reads the new picture for the same message (`submitSlip` with `messageId`; allowed for Pending Staff only when the sender is not a guarantor). Guarantors cannot do this, so their wrong-screenshot allowance is unchanged.

## Guarantor chat: WhatsApp-style layout (2026-11-02)
For a guarantor (no Mark manually or Bank check permission) `PaymentsPage` shows one chat screen with no tabs. `PaymentChatPage` renders a WhatsApp-like layout when `isG`: green header with progress, wallpaper, green bubbles for the guarantor's own messages and white for the office's, day separators, ticks (✓✓ blue = recorded, ✓ = with the office, ! = needs fixing), quick buttons "＋ Single payment" / "＋ Multi payment", a pill message box with a round send button. **History** (icon in the header) opens Payment history as a full-screen page with a back arrow (`PaymentMatchingPage fixedTab="records"`). Staff and Admin keep the old layout and tabs. Bubble: `WaBubble`; the staff bubble is still `Bubble`.

## Cash from the chat (2026-11-03)
A third button **Cash payment** (blue; Single is green, Multi is orange) in the guarantor chat. It opens the same search window (customers appear only after typing; several customers allowed, no screenshot). **Mark paid as cash** asks once more ("Record ₹X as cash received…"), then `POST /api/payment-chat {action:'cash'}` → `submitCash` in `lib/paymentChat.ts`: checks the customers belong to the guarantor and are unpaid (`lineDetails`), records the payment through `markPayment` with mode `Cash` (same records and history as Mark manually; staff can edit or discard it there) and adds a chat bubble (`status Recorded`, `pay_app = 'Cash'`, `amount_read` = total, no image). Allowed for a guarantor with the chat permission, or staff who may mark payments. 60 cash entries per hour per user. Audit event `PAYMENT_CHAT_CASH`. The bubble shows "Cash received ✓" and "paid in cash".

## Guarantor chat has no message box (2026-11-03)
The guarantor chat no longer has the "Write a message…" box and send button: the chat is only for recording payments (Single, Multi, Cash). The office's replies (notes) still show as white bubbles. Staff and Admin keep their message box (`sendNote`, API action `note` unchanged).

## Week picker and history date bar (2026-11-03)
- **Chat header (guarantor):** a week picker between the title and the History button: ‹ This week / Last week / Week + `2 Nov – 8 Nov` ›. Weeks run **Monday to Sunday (India time)**; arrows step one week, tapping the label lists the last 27 weeks. The chat shows only that week's messages (`GET /api/payment-chat?view=messages&weekStart=YYYY-MM-DD`, any date is turned into its Monday; without `weekStart` the old "latest 120" list is returned, which staff still use). The progress line and bar show that week's Saturday (`weekStats`; while the week's Saturday has not come yet, the latest collection Saturday as before). The "Wrong screenshots left" note shows on the current week only. A message that needs fixing in another week still blocks the next screenshot, so the chat shows "A payment from <week> needs fixing first. Tap here to open it." (`openIssueWeek`). After sending a payment or cash the chat jumps to the current week.
- **History page (guarantor overlay):** the date bar (‹ date ›) moved into the green top bar, right of "Payment history" (`PaymentMatchingPage` prop `dateSlotId`, shown through a portal). Staff pages keep the date bar inside the page.

## Third reader: Claude through OpenRouter (2026-11-04)
`readWithOpenRouter` in `lib/slipReader.ts`: OpenAI-style `https://openrouter.ai/api/v1/chat/completions` (optional `OPENROUTER_BASE_URL`), key `OPENROUTER_API_KEY`, model `OPENROUTER_MODEL` (default `anthropic/claude-haiku-5.5`, about $0.10 per million input tokens; must be a vision model). Entered in Dev > AI Reader. It asks for `usage.include` so OpenRouter reports the real cost of each call, stored in `payment_chat.cost_usd`; answers go through the same `parseLoose` validation as NVIDIA. Settings reader choices: Automatic (Claude own key, then OpenRouter, then NVIDIA), Claude, **Claude through OpenRouter**, NVIDIA. The Test panel has a "Read with OpenRouter" button, and on failure lists the Claude vision models OpenRouter offers (public list). The picture is sent to OpenRouter and on to Anthropic.


## Staff "Ask to send again" (2026-11-04)
Staff (chat on + permission to mark payments, Admin too) see **Ask to send again** on every payment message that is not already waiting to be fixed. They must type a reason (5+ letters). API action `resubmit` -> `requestResubmit` in `lib/paymentChat.ts` (audit `PAYMENT_CHAT_RESUBMIT`).
- Status **Resubmit** is added to `FIX_STATUSES`, so it behaves like a wrong screenshot: red message, and the guarantor cannot send new payments until it is fixed (existing block in `submitSlip`).
- **Already Recorded** payment: first undone by `undoPaymentGroup` in `lib/payments.ts` (event `undone` with who and why is written first; the repayments return to Pending, the matching collection rows are removed, a loan that this payment completed becomes Active again, the payment group is deleted so its UTR is free). The message text tells the guarantor the payment was undone.
- **Cash** message: no screenshot to send, so it becomes **Cancelled** (does not block); the guarantor records cash again if it was real.
- Guarantor view: `listMessages` also returns `resubmits` (all weeks). The chat opens scrolled to a red **Important · send again first** card at the top with "Send a new screenshot" / "Change customer". The guarantor may fix it even if staff created the message. Sending it again goes through the normal `submitSlip` fix path; wrong tries are counted only when the new try is wrong.

## Earlier tries and "who read it" (2026-11-04)
- **Earlier tries:** when a message is sent again (guarantor fix, staff resend, or after "Ask to send again"), `submitSlip.finish` first copies the previous state into a hidden row of the same table: new `message_id`, `parent_id` = the message, `status` = `Earlier try`, `problem` = `"<old status>: <old problem>"`, `created_at` = when that try happened, `wrong_count` 0. The live row's tokens/cost/reader are reset to 0 so reading cost is never counted twice (each try keeps its own cost). No migration needed. `listMessages` hides `Earlier try` rows from the list and returns them as `earlier[]` on each message (`attachEarlier`). UI `EarlierList`: purple "Sent again · this is try N" bar that opens each earlier try (screenshot, status, amount, UTR, reader, reason) and says when the transaction ID changed. Everyone who can see the chat sees the tries, but reader and cost only Admins. Messages sent again before 2026-11-04 have no saved history.
- **Who read it:** `payment_chat.reader` is now `provider:model@milliseconds` (for example `openrouter:anthropic/claude-haiku-5.5@12300`; old rows have no `@ms`). Office bubbles show a blue "Read by Claude via OpenRouter · model · seconds · cost (Admin only)" line, or "Cash", "typed by the guarantor", "confirmed by the office (not read by AI)". **Only Admins** see the reader, time and cost (bubbles and Recent reads); the API strips them for every other staff member and for guarantors (owner's rule, 2026-11-04).
- **Admin history:** Payments > Settings > **Recent reads** (last 40 reads, including earlier tries): time, guarantor, customers, amount, UTR, reader, seconds, cost (`slipUsage().recent`).

## Week filter for staff (2026-11-04)
The staff chat has the same Monday-to-Sunday (India time) week picker as the guarantor chat: ‹ › arrows and a list of 27 weeks, default **This week**, plus **All recent (latest 120)**. It uses the same `weekStart` the server already accepted (`listMessages`), combined with the guarantor filter. Messages that need fixing from other weeks are still found through the guarantor's own red/Important card.

## Speed: Drive upload runs while the screenshot is read (2026-11-04)
`submitSlip` used to save the picture to Google Drive (several folder lookups and the upload) and only then read it. The upload is now started first and runs at the same time as the AI read; `settleProof()` waits for it before the row is saved or the payment is marked. The "Read by ... N s" time and the Admin test time measure only the AI call, so a send takes longer than that figure (upload, checks, recording).

## Receiver check (2026-11-05)
Always on, even if the Dev "receiver name" setting is blank (then "ngf" is used). After amount check: no receiver shown → "Pending Staff" (office checks); receiver shown but not NGF → "Wrong Payee" (guarantor must resend); sender not shown → "Pending Staff". The AI prompt now says a "Payment received from X" screen means X is the payer, never the payee. Found because a screenshot read as payee "REVATHY A S" was recorded (SONINI 8401, 2026-10-31) — review that one manually.

## Fix pop-up (2026-11-05)
`listMessages` also returns `issues`: every slip of that guarantor still in a fix status (Wrong Payee, Needs Retake, Duplicate, Amount Mismatch, Not Successful, Resubmit), any week. The guarantor chat shows the oldest one as a full-screen pop-up that cannot be closed; it goes away only when the guarantor fixes it (Send a new screenshot / Change customer). Hidden while the fix form is open. Staff do not get the pop-up.
The pop-up has a View screenshot button next to the customer line; it shows the not-accepted screenshot and earlier tries so the guarantor sends a different one.
