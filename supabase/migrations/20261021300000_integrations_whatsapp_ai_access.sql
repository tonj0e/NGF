-- Admin-panel managed integrations: encrypted key store, WhatsApp send tracking, AI access tokens. ADDITIVE ONLY.

-- 1. Encrypted keys for SMS / WhatsApp / payment gateway, entered in Dev > Integrations. AES-256-GCM; the key lives on the server, never in the database.
create table if not exists public.integration_secrets (
  name text primary key,
  ciphertext text not null,
  iv text not null,
  tag text not null,
  last4 text not null default '',          -- only the last 4 characters, to show "ends in ...1234"
  updated_by text not null,
  updated_at timestamptz not null default now()
);
alter table public.integration_secrets enable row level security;     -- server (service role) only

-- 2. WhatsApp messages sent automatically (cost control and an audit trail)
create table if not exists public.outbound_messages (
  id uuid primary key default gen_random_uuid(),
  channel text not null,                    -- whatsapp
  purpose text not null,                    -- payment_link | test
  subject_id text,                          -- e.g. the payment link id
  to_phone text not null,
  status text not null,                     -- sent | failed | not_configured
  provider text,
  provider_ref text,
  error_text text,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists outbound_messages_created_idx on public.outbound_messages (created_at desc);
alter table public.outbound_messages enable row level security;
alter table public.payment_links
  add column if not exists whatsapp_status text,
  add column if not exists whatsapp_sent_at timestamptz,
  add column if not exists whatsapp_sends integer not null default 0;

-- 3. Access tokens that let Claude or another tool read (and optionally change) the CRM through /api/mcp. Only a hash is stored.
create table if not exists public.ai_access_tokens (
  token_id text primary key,
  name text not null,
  token_hash text not null unique,
  token_prefix text not null,               -- first characters, to recognise a token in the list
  scope text not null check (scope in ('read', 'write')),
  acts_as text not null,                    -- the Admin user the calls run as
  ip_allowlist text,                        -- optional, comma separated
  created_by text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  last_ip text,
  use_count integer not null default 0
);
alter table public.ai_access_tokens enable row level security;

create table if not exists public.ai_access_log (
  id uuid primary key default gen_random_uuid(),
  token_id text,
  token_name text,
  tool text,
  method text,
  path text,
  status integer,
  ip text,
  created_at timestamptz not null default now()
);
create index if not exists ai_access_log_created_idx on public.ai_access_log (created_at desc);
alter table public.ai_access_log enable row level security;
