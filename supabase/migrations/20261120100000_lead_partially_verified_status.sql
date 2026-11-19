-- Partial verification (2026-11-20): new lead status "Partially Verified" (the agent visited, the customer was not at home; house photo,
-- landmark photo and home location are saved; the office completes the rest). Additive; no data is changed.
-- On its own on purpose: a value added with ADD VALUE cannot be used in the same transaction, so the columns and the
-- lead_badge_counts update are in the next two files. Apply this BEFORE deploying the code (the code filters on this value,
-- and Postgres rejects an unknown enum value in a filter).
alter type public.lead_status add value if not exists 'Partially Verified';
