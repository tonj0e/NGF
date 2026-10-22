# Integrations Admin Panel (Dev page)

All API settings are managed from the **Dev page**, not Hostinger env variables: Dev > SMS, Dev > WhatsApp, Dev > Payments.

- Code: `lib/integrations.ts` (field registry, `getConfig`, `setConfig`), `app/api/integrations/route.ts`, `components/pages/IntegrationFields.tsx`.
- Secrets are encrypted (AES-256-GCM) in table `integration_secrets` with key `SETTINGS_ENCRYPTION_KEY` (or `JWT_SECRET`). Non-secret values live in `settings` as `integration:<NAME>`. Env variables still work as a fallback.
- Admin only. Every set/clear needs the admin password again (8 tries / 10 min), is audited (`INTEGRATION_SET`, `INTEGRATION_CLEARED`, `INTEGRATION_PASSWORD_WRONG`) and notifies Admins. Secrets are never sent back to the browser (only last 4 characters).
- WhatsApp: `lib/whatsapp.ts`, providers Twilio or Meta Cloud API; payment links are sent automatically with `POST /api/payment-links/:linkId` (max 3 sends per link, 60/hour per login, daily cap default 300, logged in `outbound_messages`). Manual wa.me button stays as fallback. Template: "Hello {{1}}, your NGF FINCORP loan {{2}} payment of {{3}} is due. Pay securely: {{4}} (valid till {{5}})".
- Migration `20261021300000_integrations_whatsapp_ai_access.sql` (owner gave access; applied): tables `integration_secrets`, `outbound_messages`, `ai_access_tokens`, `ai_access_log`; columns `payment_links.whatsapp_status/whatsapp_sent_at/whatsapp_sends`.
- Not built yet: AI Access tab and remote MCP endpoint.
