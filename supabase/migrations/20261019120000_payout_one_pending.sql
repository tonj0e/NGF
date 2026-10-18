-- One Pending payout request per guarantor, and amounts must be positive.
-- If this fails, resolve existing duplicate Pending rows / non-positive amounts first.
CREATE UNIQUE INDEX IF NOT EXISTS payout_one_pending
  ON public.payout_requests (guarantor_id) WHERE status = 'Pending';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payout_amount_positive') THEN
    ALTER TABLE public.payout_requests
      ADD CONSTRAINT payout_amount_positive CHECK (amount > 0) NOT VALID;
    ALTER TABLE public.payout_requests VALIDATE CONSTRAINT payout_amount_positive;
  END IF;
END $$;
