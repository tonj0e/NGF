-- Payment Chat: guarantors send UPI screenshots in the portal instead of the WhatsApp group.
-- One row per message (screenshot or a staff reply). Reading cost (tokens, estimated USD) is kept per row for the cost meter.
create table if not exists public.payment_chat (
  message_id        text primary key,
  guarantor_id      text not null,
  kind              text not null default 'slip' check (kind in ('slip','note')),
  parent_id         text,
  mode              text check (mode in ('single','multi')),
  status            text not null default 'Processing',
  problem           text,
  lines             jsonb not null default '[]'::jsonb,
  note              text,
  utr               text,
  amount_read       numeric(12,2),
  txn_date          text,
  txn_time          text,
  payee             text,
  pay_app           text,
  confidence        text,
  image_url         text,
  image_hash        text,
  group_id          text,
  duplicate_group_id text,
  in_tokens         integer not null default 0,
  out_tokens        integer not null default 0,
  cost_usd          numeric(10,6) not null default 0,
  created_by        text,
  created_by_name   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists payment_chat_guarantor_idx on public.payment_chat (guarantor_id, created_at);
create index if not exists payment_chat_hash_idx on public.payment_chat (image_hash) where image_hash is not null;
create index if not exists payment_chat_created_idx on public.payment_chat (created_at);
alter table public.payment_chat enable row level security;   -- the app uses the service key; no public access
