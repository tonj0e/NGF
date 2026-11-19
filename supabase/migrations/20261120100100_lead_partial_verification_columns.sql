-- Partial verification (2026-11-20): who and when. Additive, nullable; no data is changed.
--   partial_verified_at / _by   the agent pressed "Submit partial verification" (lead -> Partially Verified); _by = the agent's user id
--   office_completed_at / _by   Admin or branch staff completed it in the office (lead -> Verification Submitted); _by = that user's id
alter table public.leads
  add column if not exists partial_verified_at timestamptz,
  add column if not exists partial_verified_by text,
  add column if not exists office_completed_at timestamptz,
  add column if not exists office_completed_by text;

notify pgrst, 'reload schema';
