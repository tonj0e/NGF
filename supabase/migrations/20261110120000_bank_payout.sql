-- Bank payout files: bank details on leads/customers, one permanent 4-digit number per customer, and the log of every bank file.
-- Additive only. Existing data is not changed except filling customers.pay_number from their existing loan ids.
alter table public.leads add column if not exists account_holder text;
alter table public.leads add column if not exists passbook_photo_url text;
alter table public.leads add column if not exists pay_number text;
alter table public.leads add column if not exists bank_verified_at timestamptz;
alter table public.leads add column if not exists bank_verified_by text;
alter table public.customers add column if not exists account_holder text;
alter table public.customers add column if not exists passbook_photo_url text;
alter table public.customers add column if not exists pay_number text;

-- a customer's permanent number = the 4 digits already inside their loan id (GBN-7425 -> 7425), from their first loan
update public.customers c set pay_number = x.d
from (select distinct on (customer_id) customer_id, substring(loan_id from '(\d{4})(?:R\d+)?$') as d
      from public.loans order by customer_id, created_at asc) x
where c.customer_id = x.customer_id and c.pay_number is null and x.d is not null;

create unique index if not exists customers_pay_number_uniq on public.customers (pay_number) where pay_number is not null;
create unique index if not exists leads_pay_number_uniq on public.leads (pay_number) where pay_number is not null;

create table if not exists public.bank_payout_batches (
  batch_id text primary key,
  file_name text not null unique,          -- NGC-DDMMYYYYNN
  kind text not null check (kind in ('renewal', 'new')),
  file_date date not null,                  -- India date the file was made (the Transaction date in the file)
  file_no integer not null,                 -- 1, 2, 3 ... for that date
  created_at timestamptz not null default now(),
  created_by text,
  lead_count integer not null default 0,
  total_amount numeric(14,2) not null default 0,
  status text not null default 'created' check (status in ('created', 'cancelled')),
  cancelled_at timestamptz, cancelled_by text, cancel_reason text
);
create table if not exists public.bank_payout_lines (
  line_id text primary key,
  batch_id text not null references public.bank_payout_batches(batch_id),
  lead_id text not null,
  reference_number text not null unique,   -- YYYYMMDD + running number; never repeated, in any file, ever
  amount numeric(14,2) not null,
  mode text not null,                      -- S (South Indian Bank own account) | N (NEFT)
  benef_ifsc text not null,
  benef_account text not null,
  benef_name text not null,
  remarks text not null,
  customer_name text,
  disbursed_at timestamptz
);
create index if not exists bank_payout_lines_lead_idx on public.bank_payout_lines (lead_id);
create index if not exists bank_payout_lines_batch_idx on public.bank_payout_lines (batch_id);
alter table public.bank_payout_batches enable row level security;
alter table public.bank_payout_lines enable row level security;
revoke all on public.bank_payout_batches, public.bank_payout_lines from anon, authenticated;
grant all on public.bank_payout_batches, public.bank_payout_lines to service_role;
