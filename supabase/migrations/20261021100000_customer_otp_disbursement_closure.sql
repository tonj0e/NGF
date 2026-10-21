-- Customer OTP (new-lead verification + renewal approval), disbursement step, early closure (hold / permanent).
-- ADDITIVE ONLY: new table, new nullable columns. Safe to run while the live site is up; old code ignores them.

-- 1. One row per OTP sent to a customer's phone. Only a keyed hash of the code is stored.
create table if not exists public.customer_otps (
  id uuid primary key default gen_random_uuid(),
  purpose text not null check (purpose in ('lead_verification', 'renewal_approval')),
  subject_id text not null,                 -- the lead id this OTP is for
  phone text not null,                      -- normalised 10-digit mobile the code was sent to
  otp_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  verified_at timestamptz,
  invalidated_at timestamptz,
  send_status text,                         -- sent | test_email | failed | not_configured
  provider text,                            -- msg91 | twilio | test_email
  provider_ref text,
  requested_by text not null,               -- users.user_id of staff / agent who asked
  request_ip text,
  created_at timestamptz not null default now()
);
create index if not exists customer_otps_subject_idx on public.customer_otps (subject_id, purpose, created_at desc);
alter table public.customer_otps enable row level security;   -- server (service role) only

-- 2. Lead: OTP proof, approval and disbursement trail. Lead status "Approved" now means "approved, waiting to be disbursed";
--    "Converted" means disbursed (loan created).
alter table public.leads
  add column if not exists otp_verified_at timestamptz,
  add column if not exists otp_phone text,
  add column if not exists otp_override_reason text,
  add column if not exists otp_override_by text,
  add column if not exists approved_by text,
  add column if not exists approved_at timestamptz,
  add column if not exists disbursed_by text,
  add column if not exists disbursed_at timestamptz;

-- 3. Customer: hold (cannot renew until a date) and permanent block (no more loans until an admin re-admits).
alter table public.customers
  add column if not exists hold_until date,
  add column if not exists permanent_block boolean not null default false,
  add column if not exists block_reason text;

-- 4. Early-closure record: what was collected, which mode, until when held.
create table if not exists public.loan_closures (
  closure_id text primary key,
  loan_id text not null,
  customer_id text not null,
  mode text not null check (mode in ('hold', 'permanent')),
  weeks_remaining integer not null default 0,
  amount_collected numeric not null default 0,
  payment_mode text,
  hold_until date,
  reason text,
  closed_by text not null,
  closed_at timestamptz not null default now(),
  readmitted_at timestamptz,
  readmitted_by text,
  readmit_reason text
);
create index if not exists loan_closures_customer_idx on public.loan_closures (customer_id, closed_at desc);
alter table public.loan_closures enable row level security;   -- server (service role) only
