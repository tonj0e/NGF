-- Migration: UPI/UTR payment matching (collection-day payment marking, duplicate UTR flagging, bank statement cross-check)
-- Date: 2026-10-18
-- Additive only: adds one column to customers and four new tables. Nothing existing is altered, truncated or deleted.
--
-- Design notes
--  * payment_groups = one payment event (one UTR, one or more customers). payment_lines = the customers it covers.
--  * A UTR is unique across all 'Verified' groups (partial unique index). A duplicate is saved with status 'Flagged'
--    (and never marks the repayment paid) so both sides stay visible and editable until the UTR is corrected.
--    'Overridden' = a flagged payment accepted by someone with the override permission, with a written reason.
--  * A repayment can belong to at most one payment line.
--  * bank_transactions holds uploaded bank-statement credits; matching is computed at read time by UTR.
--  * customers.pay_code is the 4-digit code staff search by; unique within one guarantor only.
--  * RLS enabled with NO policies: only the service-role key (server) can read or write.

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS pay_code text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_guarantor_pay_code
  ON public.customers (guarantor_id, pay_code) WHERE pay_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.payment_groups (
  group_id           text        PRIMARY KEY,
  guarantor_id       text,
  saturday_date      date        NOT NULL,
  mode               text        NOT NULL CHECK (mode IN ('Cash','UPI','Bank','Cheque','Other')),
  utr                text,
  total_amount       numeric(12,2) NOT NULL CHECK (total_amount > 0),
  status             text        NOT NULL DEFAULT 'Verified' CHECK (status IN ('Verified','Flagged','Overridden')),
  flag_reason        text,
  screenshot_file_id text,
  notes              text,
  marked_by          text,
  marked_by_name     text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_groups_utr_verified
  ON public.payment_groups (utr) WHERE utr IS NOT NULL AND status = 'Verified';
CREATE INDEX IF NOT EXISTS idx_payment_groups_utr ON public.payment_groups (utr);
CREATE INDEX IF NOT EXISTS idx_payment_groups_guarantor_date ON public.payment_groups (guarantor_id, saturday_date);

CREATE TABLE IF NOT EXISTS public.payment_lines (
  line_id        text        PRIMARY KEY,
  group_id       text        NOT NULL REFERENCES public.payment_groups(group_id) ON DELETE CASCADE,
  repayment_id   text        NOT NULL,
  loan_id        text,
  customer_id    text,
  guarantor_id   text,
  amount         numeric(12,2) NOT NULL CHECK (amount > 0),
  week_no        integer,
  due_date       date,
  applied        boolean     NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (repayment_id)
);
CREATE INDEX IF NOT EXISTS idx_payment_lines_group ON public.payment_lines (group_id);
CREATE INDEX IF NOT EXISTS idx_payment_lines_customer ON public.payment_lines (customer_id);

CREATE TABLE IF NOT EXISTS public.payment_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    text        NOT NULL,
  event       text        NOT NULL,
  old_utr     text,
  new_utr     text,
  reason      text,
  actor_id    text,
  actor_name  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payment_events_group ON public.payment_events (group_id, created_at);

CREATE TABLE IF NOT EXISTS public.bank_transactions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  utr          text        NOT NULL UNIQUE,
  txn_date     date,
  amount       numeric(12,2) NOT NULL,
  payer        text,
  remark       text,
  source_file  text,
  uploaded_by  text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_groups     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_lines      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions  ENABLE ROW LEVEL SECURITY;

-- Backfill a 4-digit code for every existing customer (unique within the guarantor)
DO $$
DECLARE r record; code text; tries int;
BEGIN
  FOR r IN SELECT customer_id, guarantor_id FROM public.customers WHERE pay_code IS NULL ORDER BY created_at LOOP
    tries := 0;
    LOOP
      code := lpad((floor(random() * 10000))::int::text, 4, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.guarantor_id IS NOT DISTINCT FROM r.guarantor_id AND c.pay_code = code);
      tries := tries + 1;
      IF tries > 200 THEN RAISE EXCEPTION 'No free pay_code for guarantor %', r.guarantor_id; END IF;
    END LOOP;
    UPDATE public.customers SET pay_code = code WHERE customer_id = r.customer_id;
  END LOOP;
END $$;
