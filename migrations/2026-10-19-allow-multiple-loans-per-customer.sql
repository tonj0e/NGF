-- Migration: allow a customer to take several loans over time (renewals, repeat loans)
-- Date: 2026-10-19
-- loans had a UNIQUE index on customer_id, so a second loan for the same customer was rejected by the database.
-- The app already supports renewals (customers.active_loan_id points at the current loan; older loans stay as history),
-- so the unique rule is removed. The ordinary lookup index idx_loans_customer_id stays.
-- To undo (only while every customer has at most one loan): CREATE UNIQUE INDEX loans_customer_id_key ON public.loans (customer_id);

ALTER TABLE public.loans DROP CONSTRAINT IF EXISTS loans_customer_id_key;
DROP INDEX IF EXISTS public.loans_customer_id_key;
