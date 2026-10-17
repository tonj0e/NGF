-- Migration: unique loan account number (NGF000001, NGF000002, ...) for every loan
-- Date: 2026-10-19
-- Additive: one new column, one sequence, one unique index. Existing loan_id values (e.g. GRV-8163) are untouched.
--
-- The number is assigned by the database itself (column default from a sequence), so every code path that inserts a loan
-- (lead approval, renewal, import, scripts) gets one, and two loans can never share a number.

CREATE SEQUENCE IF NOT EXISTS public.loan_account_seq START 1;

ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS loan_account_no text;

-- Backfill existing loans in the order they were created
UPDATE public.loans l
SET loan_account_no = 'NGF' || lpad(nextval('public.loan_account_seq')::text, 6, '0')
FROM (SELECT loan_id FROM public.loans WHERE loan_account_no IS NULL ORDER BY created_at, loan_id) o
WHERE l.loan_id = o.loan_id AND l.loan_account_no IS NULL;

ALTER TABLE public.loans ALTER COLUMN loan_account_no SET DEFAULT ('NGF' || lpad(nextval('public.loan_account_seq')::text, 6, '0'));
ALTER TABLE public.loans ALTER COLUMN loan_account_no SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_loans_loan_account_no ON public.loans (loan_account_no);
