-- Migration: password recovery by email OTP
-- Date: 2026-10-16
-- Status: PROPOSED — review before applying. Additive only: creates one new table.
--         Does not alter, truncate or delete anything in existing tables.
--
-- Design notes
--  * Only a keyed hash of the 6-digit OTP is stored (HMAC-SHA256 with a server secret, salted by row id).
--  * Rows are short-lived and single-use. Older rows are invalidated when a new OTP is issued.
--  * attempts / max_attempts bound guessing; the app increments attempts with an optimistic lock.
--  * RLS is enabled with NO policies: only the service-role key (server) can read or write.
--  * user_id cascades on user delete so a deleted account leaves no recovery rows behind.
--    Audit history lives in public.logs and is untouched.

CREATE TABLE IF NOT EXISTS public.password_reset_otps (
  id                 uuid        PRIMARY KEY,
  user_id            text        NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  otp_hash           text        NOT NULL,
  expires_at         timestamptz NOT NULL,
  attempts           integer     NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts       integer     NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
  verified_at        timestamptz,
  consumed_at        timestamptz,
  invalidated_at     timestamptz,
  email_status       text        NOT NULL DEFAULT 'pending'
                     CHECK (email_status IN ('pending', 'sent', 'failed', 'not_configured')),
  email_provider_id  text,
  request_ip         text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- Look up a user's most recent / active OTPs and apply per-user cooldown & hourly caps
CREATE INDEX IF NOT EXISTS idx_password_reset_otps_user_created
  ON public.password_reset_otps (user_id, created_at DESC);

ALTER TABLE public.password_reset_otps ENABLE ROW LEVEL SECURITY;
-- intentionally no policies: anon/authenticated roles get no access

COMMENT ON TABLE public.password_reset_otps IS
  'Short-lived, single-use email OTPs for password recovery. Server-side (service role) access only.';

-- Verify
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'password_reset_otps'
ORDER BY ordinal_position;
