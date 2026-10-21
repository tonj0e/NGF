---
title: SMS Setup
section: Runbook
status: current
last_verified: 2026-10-21
tags: [ngf, sms, otp, msg91, twilio, env]
---
# SMS Setup
**One line: how to connect an SMS provider so customer OTPs (new-lead verification and renewal approval) reach the customer's phone. The code supports MSG91 and Twilio; pick one and add its env variables.**

## Key facts
- Code: `lib/sms.ts` (sender), `lib/customerOtp.ts` (OTP storage, hashed), `app/api/otp/route.ts`. The provider is chosen by env, so switching needs no code change.
- Until a provider is set, the OTP step still works in two safe ways: (1) **Testing mailbox**: Dev > Testing switch (24 h) emails the code to one mailbox instead of the customer; (2) **local dev only**: the code is shown on screen (`devOtp`, never on the live site, `isProductionEnv()` guard).
- On the live site with no provider and no testing mailbox, the OTP cannot be delivered; staff can continue only with the **override and a written reason** (manager, assistant manager or admin; the agent for a visit).
- Never put these values in code or notes; set them as environment variables on Hostinger (and in `.env.local` for local use).

## Option A: MSG91 (India, recommended for Indian numbers)
1. Create an account at msg91.com and complete business KYC.
2. Register your **sender ID** and an **OTP template** under DLT (TRAI rules). The template must contain the OTP variable (`##OTP##`). Approval takes a day or two.
3. In MSG91: OTP > Templates: note the **Template ID**; Settings > API keys: note the **Auth key**.
4. Set on Hostinger: `SMS_PROVIDER=msg91`, `MSG91_AUTH_KEY=...`, `MSG91_OTP_TEMPLATE_ID=...`. Rebuild (Hostinger > Node.js > redeploy; env changes need a new build).
5. Test with a lead assigned to the demo agent: Send OTP, check the phone.

## Option B: Twilio
1. Create an account at twilio.com and verify your business.
2. Buy or register a sender: a phone number, or a **Messaging Service** (SID). For India, sender registration (DLT) is also required.
3. Set: `SMS_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID=...`, `TWILIO_AUTH_TOKEN=...`, and either `TWILIO_FROM=+1...` or `TWILIO_MESSAGING_SERVICE_SID=MG...`.
4. Rebuild and test as above.

## Cost and limits
- Providers charge per message (roughly paise to a few rupees depending on route); check the current price list. The code sends at most 5 codes per lead per hour and one per minute, which also caps cost.
- The OTP is valid 10 minutes, 5 wrong tries lock it.

## Testing safely
- Turn the testing mailbox on in Dev > Testing (it switches itself off after 24 h). Turn it OFF before real use: while it is on, customers do not get their code.

## Not verified
- The MSG91 and Twilio adapters follow the providers' public API but were **not tested against real accounts** (none exist yet). First live send needs a check; errors show as "The SMS could not be sent".

## Related
[[Customer OTP and Disbursement]], [[Config and Env Vars]], [[Troubleshooting]]
