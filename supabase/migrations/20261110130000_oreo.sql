-- Oreo: the owner's AI assistant. Its brain (rules, facts, preferences, playbooks), conversations, and every action it prepared or did. Additive only.
create table if not exists public.oreo_brain (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('rule','fact','preference','playbook')),
  title text not null,
  body text not null,
  pinned boolean not null default false,
  status text not null default 'active' check (status in ('active','pending','archived')),
  source text not null default 'owner' check (source in ('owner','oreo')),
  tags text[] not null default '{}',
  created_by text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  search tsvector generated always as (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(body,''))) stored
);
create index if not exists oreo_brain_search_idx on public.oreo_brain using gin (search);
create index if not exists oreo_brain_status_idx on public.oreo_brain (status, kind);
create table if not exists public.oreo_brain_versions (
  id uuid primary key default gen_random_uuid(),
  brain_id uuid not null references public.oreo_brain(id) on delete cascade,
  kind text, title text, body text, status text, pinned boolean,
  changed_by text, changed_at timestamptz not null default now()
);
create index if not exists oreo_brain_versions_idx on public.oreo_brain_versions (brain_id, changed_at desc);
create table if not exists public.oreo_threads (
  id uuid primary key default gen_random_uuid(),
  user_id text not null, title text not null default 'New chat',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists oreo_threads_user_idx on public.oreo_threads (user_id, updated_at desc);
create table if not exists public.oreo_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.oreo_threads(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content jsonb not null,                -- exactly what the model sent/received (kept unchanged for replay)
  text text not null default '',         -- the readable text of the turn
  model text, provider text, tokens_in integer not null default 0, tokens_out integer not null default 0, cost_usd numeric(12,6) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists oreo_messages_thread_idx on public.oreo_messages (thread_id, created_at);
create table if not exists public.oreo_actions (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references public.oreo_threads(id) on delete set null,
  tool text not null, risk text not null check (risk in ('read','low','money')),
  input jsonb not null default '{}'::jsonb, summary text not null default '',
  status text not null default 'pending' check (status in ('pending','done','failed','cancelled','expired')),
  result text, via text,                 -- via: button | typed | voice
  created_by text, confirmed_by text, created_at timestamptz not null default now(), decided_at timestamptz
);
create index if not exists oreo_actions_thread_idx on public.oreo_actions (thread_id, created_at desc);
create index if not exists oreo_actions_status_idx on public.oreo_actions (status, created_at desc);
alter table public.oreo_brain enable row level security;
alter table public.oreo_brain_versions enable row level security;
alter table public.oreo_threads enable row level security;
alter table public.oreo_messages enable row level security;
alter table public.oreo_actions enable row level security;
revoke all on public.oreo_brain, public.oreo_brain_versions, public.oreo_threads, public.oreo_messages, public.oreo_actions from anon, authenticated;
grant all on public.oreo_brain, public.oreo_brain_versions, public.oreo_threads, public.oreo_messages, public.oreo_actions to service_role;

-- starting rules (pinned): the owner can edit them in the Brain screen
insert into public.oreo_brain (kind, title, body, pinned, source, created_by) values
 ('rule','Money actions need the owner''s confirm','Never run approve, disburse, bank file, payout, payment or delete actions without the owner pressing or saying Confirm on the confirm card. Prepare the action and wait.',true,'owner','system'),
 ('rule','Never mark disbursed before the bank pays','A customer is marked disbursed only after the bank file was uploaded and paid at the bank portal. Remind the owner if asked to disburse a lead that is not in a bank file.',true,'owner','system'),
 ('rule','Keep customer data private','Do not repeat full bank account numbers or Aadhaar numbers in chat; show the last 4 digits. Use customer names with their 4-digit number.',true,'owner','system'),
 ('preference','Language','Answer in the language the owner speaks (English or Malayalam). Keep answers short and plain; amounts in rupees with the ₹ sign.',true,'owner','system'),
 ('fact','How the weekly money works','Customers pay every Saturday. Guarantors hand in the collection; payments are recorded from screenshots (UTR) and cash. A loan is 10K10W: ₹10,000 loan, ₹8,500 paid out, ₹1,000 a week for 10 weeks.',false,'owner','system'),
 ('playbook','Bank file day','1) In Leads > Disbursements > To Disburse, check each customer''s bank details and verify by phone. 2) Select the verified customers and create the bank files (renewals and new customers are separate files). 3) Upload them in the bank portal. 4) After the bank pays, press Mark disbursed for each customer.',false,'owner','system')
on conflict do nothing;
