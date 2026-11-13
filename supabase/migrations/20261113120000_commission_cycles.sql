-- Guarantor commission cycles: each guarantor has a start Monday (their first cycle), then back-to-back 35-day cycles.
-- A payout points at the cycle it pays and gets a receipt number. Additive only.
alter table guarantors add column if not exists commission_start date;
alter table payout_requests add column if not exists cycle_start date;
alter table payout_requests add column if not exists cycle_end date;
alter table payout_requests add column if not exists receipt_no text;
create index if not exists payout_requests_cycle_idx on payout_requests (guarantor_id, cycle_start);
