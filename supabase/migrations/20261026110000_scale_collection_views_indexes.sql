-- Scale work (collection lists + search). Adds a read-only view, one read-only function and indexes.
-- No data is changed. Dates use Indian time.

create extension if not exists pg_trgm with schema extensions;

-- Repayments with loan/customer/guarantor details, so lists can be filtered, searched and paged in the database
create or replace view public.repayments_enriched
with (security_invoker = true) as
select r.*, l.guarantor_id, l.assigned_agent_id,
       c.name as customer_name, c.phone as customer_phone, g.name as guarantor_name
from public.repayments r
join public.loans l on l.loan_id = r.loan_id
left join public.customers c on c.customer_id = r.customer_id
left join public.guarantors g on g.guarantor_id = l.guarantor_id;

-- Totals for one collection day: how many customers, how much money, how many guarantors.
-- p_guarantors / p_agent narrow it to a guarantor's, branch's or agent's own loans (null = no limit).
create or replace function public.repayment_day_summary(
  p_date date, p_unpaid_only boolean default true, p_guarantors text[] default null, p_agent text default null)
returns table (customer_count bigint, total_amount numeric, guarantor_count bigint)
language sql stable security invoker as $$
  select count(*), coalesce(sum(r.amount), 0), count(distinct r.guarantor_id)
  from public.repayments_enriched r
  where r.due_date = p_date
    and (not p_unpaid_only or r.status <> 'Paid')
    and (p_guarantors is null or r.guarantor_id = any(p_guarantors))
    and (p_agent is null or r.assigned_agent_id = p_agent)
$$;

revoke all on public.repayments_enriched from anon, authenticated;
grant select on public.repayments_enriched to service_role;
revoke all on function public.repayment_day_summary(date, boolean, text[], text) from public, anon, authenticated;
grant execute on function public.repayment_day_summary(date, boolean, text[], text) to service_role;

-- Indexes: due-date lists, pending/overdue lookups, name/phone/loan-id search, newest-first lists
create index if not exists idx_repayments_due_status on public.repayments (due_date, status);
create index if not exists idx_repayments_pending_due on public.repayments (due_date) where status = 'Pending';
create index if not exists idx_customers_name_trgm on public.customers using gin (name extensions.gin_trgm_ops);
create index if not exists idx_customers_phone_trgm on public.customers using gin (phone extensions.gin_trgm_ops);
create index if not exists idx_loans_loan_id_trgm on public.loans using gin (loan_id extensions.gin_trgm_ops);
create index if not exists idx_customers_created_at on public.customers (created_at desc, customer_id);
create index if not exists idx_loans_created_at on public.loans (created_at desc, loan_id);

notify pgrst, 'reload schema';
