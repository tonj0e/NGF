-- Speed work: indexes only. No data is changed. Safe to run more than once.

-- Leads search (name, mobile, Aadhaar, lead id contain-text search) and the list order / scoped counts
create index if not exists idx_leads_name_trgm    on public.leads using gin (customer_name extensions.gin_trgm_ops);
create index if not exists idx_leads_phone_trgm   on public.leads using gin (phone extensions.gin_trgm_ops);
create index if not exists idx_leads_aadhaar_trgm on public.leads using gin (aadhaar_no extensions.gin_trgm_ops);
create index if not exists idx_leads_leadid_trgm  on public.leads using gin (lead_id extensions.gin_trgm_ops);
create index if not exists idx_leads_list_order   on public.leads (submitted_date desc, lead_id desc);
create index if not exists idx_leads_guarantor_status on public.leads (guarantor_id, status);

-- Notifications: own list (newest first), role-wide list, unread
create index if not exists idx_notifications_user_created on public.notifications (user_id, created_at desc);
create index if not exists idx_notifications_role_created on public.notifications (role, created_at desc) where user_id is null;
create index if not exists idx_notifications_unread on public.notifications (user_id) where is_read = false;

-- Repayment search by the last digits of the loan id
create index if not exists idx_repayments_loan_id_trgm on public.repayments using gin (loan_id extensions.gin_trgm_ops);

analyze public.leads;
analyze public.notifications;
