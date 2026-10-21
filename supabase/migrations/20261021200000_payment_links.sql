-- Online repayment links (bank payment gateway). ADDITIVE ONLY: one new table.
-- A link collects either the due weeks of a loan ("weeks") or the whole remaining balance to close it early ("closure").
-- Money is only credited when the gateway's webhook confirms it; the browser redirect is never trusted.
create table if not exists public.payment_links (
  link_id text primary key,
  kind text not null check (kind in ('weeks', 'closure')),
  loan_id text not null,
  customer_id text not null,
  guarantor_id text,
  repayment_ids text[] not null default '{}',
  base_amount numeric(12,2) not null check (base_amount > 0),     -- what the loan is credited
  fee_percent numeric(5,2) not null default 0,                    -- gateway charge added for the customer
  fee_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null check (total_amount > 0),   -- what the customer pays
  closure_mode text check (closure_mode in ('hold', 'permanent')),
  closure_reason text,
  status text not null default 'Created' check (status in ('Created', 'Paid', 'Failed', 'Expired', 'Cancelled', 'Mismatch', 'Error')),
  provider text not null,
  provider_ref text,
  short_url text,
  gateway_payment_id text unique,
  payment_method text,
  expires_at timestamptz not null,
  paid_at timestamptz,
  error_text text,
  created_by text not null,
  created_by_name text,
  created_at timestamptz not null default now()
);
create index if not exists payment_links_loan_idx on public.payment_links (loan_id, created_at desc);
create unique index if not exists payment_links_one_open on public.payment_links (loan_id, kind) where status = 'Created';
alter table public.payment_links enable row level security;     -- server (service role) only
