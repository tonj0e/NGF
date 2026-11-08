-- AI usage log: one row for every AI call (screenshot reads and tests), whatever the provider. Additive; no existing data is changed.
create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  provider text not null,                 -- claude | openrouter | nvidia
  model text not null default '',
  purpose text not null default 'slip',   -- slip (payment screenshot read) | test
  guarantor_id text,
  message_id text,
  user_id text,
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  tokens_reasoning integer not null default 0,
  tokens_cached integer not null default 0,
  cost_usd numeric(12,6) not null default 0,
  duration_ms integer not null default 0,
  status text not null default 'ok',      -- ok | error
  finish_reason text,
  error text
);
create index if not exists idx_ai_usage_created on public.ai_usage (created_at desc);
create index if not exists idx_ai_usage_provider_created on public.ai_usage (provider, created_at desc);
create index if not exists idx_ai_usage_guarantor_created on public.ai_usage (guarantor_id, created_at desc);
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;
grant all on public.ai_usage to service_role;

-- History from the payment chat (input tokens and cost only; older rows have no output split)
insert into public.ai_usage (created_at, provider, model, purpose, guarantor_id, message_id, tokens_in, tokens_out, cost_usd, duration_ms, status)
select c.created_at,
       coalesce(nullif(split_part(split_part(c.reader, '@', 1), ':', 1), ''), 'unknown'),
       coalesce(nullif(substr(split_part(c.reader, '@', 1), position(':' in split_part(c.reader, '@', 1)) + 1), ''), ''),
       'slip', c.guarantor_id, c.message_id, c.in_tokens, coalesce(c.out_tokens, 0), coalesce(c.cost_usd, 0),
       coalesce(nullif(split_part(c.reader, '@', 2), '')::int, 0), 'ok'
from public.payment_chat c
where c.in_tokens > 0 and c.reader is not null
  and not exists (select 1 from public.ai_usage a where a.message_id = c.message_id);
