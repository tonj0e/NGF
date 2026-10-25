-- Scale work (dashboard + collection sheet): one read-only view and one read-only function. No data changes.
-- Dates are passed in by the app (Indian time).

-- One row per active loan that still has unpaid weeks: the "collection sheet" line (balance, next week, contact)
create or replace view public.collection_sheet_rows
with (security_invoker = true) as
select l.loan_id, l.customer_id, coalesce(l.guarantor_id, c.guarantor_id) as guarantor_id, l.assigned_agent_id,
       c.name, c.phone, c.place,
       g.name as guarantor_name, g.code as guarantor_code,
       u.balance, u.next_week
from public.loans l
join public.customers c on c.customer_id = l.customer_id
left join public.guarantors g on g.guarantor_id = coalesce(l.guarantor_id, c.guarantor_id)
join lateral (
  select sum(r.amount) as balance, min(r.week_no) as next_week
  from public.repayments r
  where r.loan_id = l.loan_id and r.status not in ('Paid', 'Waived')
) u on u.balance is not null
where l.status = 'Active';

-- Every dashboard figure for one viewer, in one call.
-- p_guarantors / p_agent limit it to a guarantor's, branch's or agent's own loans (both null = everything).
-- p_own_customers: also count customers whose own guarantor is in p_guarantors (guarantor view).
create or replace function public.dashboard_metrics(
  p_today date, p_saturday date,
  p_guarantors text[] default null, p_agent text default null, p_own_customers boolean default false)
returns jsonb
language sql stable security invoker as $$
with ml as (
  select l.* from public.loans l
  where (p_guarantors is null or l.guarantor_id = any(p_guarantors))
    and (p_agent is null or l.assigned_agent_id = p_agent)
), mr as (
  select r.amount, r.status, r.due_date, r.paid_date, r.loan_id, ml.status as loan_status
  from public.repayments r join ml on ml.loan_id = r.loan_id
), rep as (
  select
    coalesce(sum(amount) filter (where status = 'Paid'), 0) as total_collected,
    coalesce(sum(amount) filter (where status = 'Paid'
      and paid_date >= date_trunc('month', p_today)::date
      and paid_date <  (date_trunc('month', p_today) + interval '1 month')::date), 0) as month_collected,
    coalesce(sum(amount) filter (where status = 'Paid' and paid_date >= p_today - 6), 0) as week_collected,
    coalesce(sum(amount) filter (where due_date = p_saturday and status <> 'Waived' and loan_status = 'Active'), 0) as this_week_collection,
    coalesce(sum(amount) filter (where due_date <= p_today and status <> 'Waived'), 0) as due_amount,
    coalesce(sum(amount) filter (where due_date <= p_today and status = 'Paid'), 0) as collected_amount,
    count(*) filter (where due_date <= p_today and status <> 'Waived') as due_count,
    count(*) filter (where due_date <= p_today and status = 'Paid') as collected_count,
    count(*) filter (where status = 'Pending' and due_date = p_today and loan_status = 'Active') as today_due
  from mr
), lo as (
  select
    count(*) filter (where status = 'Active') as active_loans,
    count(*) filter (where status = 'Completed') as completed_loans,
    coalesce(sum(principal_amount) filter (where status = 'Active'), 0) as total_loan_amount,
    coalesce(sum(principal_amount), 0) as total_principal,
    coalesce(sum(interest_deduction), 0) as total_interest,
    coalesce(sum(guarantor_commission), 0) as commission_total
  from ml
), re as (
  select count(*) as renewal_eligible from ml
  where ml.status = 'Completed'
    and not exists (select 1 from public.loans a where a.customer_id = ml.customer_id and a.status = 'Active')
), od as (
  select count(*) as overdue_loans from ml
  where ml.status = 'Active'
    and exists (select 1 from public.repayments r where r.loan_id = ml.loan_id and r.status = 'Pending' and r.due_date < p_today)
), cu as (
  select count(*) as active_customers from public.customers c
  where c.status = 'Active'
    and ((p_guarantors is null and p_agent is null)
         or c.customer_id in (select customer_id from ml)
         or (p_own_customers and c.guarantor_id = any(p_guarantors)))
), ld as (
  select s.status, count(*) as n from (
    select ld0.status::text as status, ld0.assigned_agent_id from public.leads ld0
    where (p_guarantors is null or ld0.guarantor_id = any(p_guarantors))
      and (p_agent is null or ld0.assigned_agent_id = p_agent)) s
  group by s.status
), ser as (
  select paid_date as d, sum(amount) as amt from mr
  where status = 'Paid' and paid_date >= p_today - 13 and paid_date <= p_today
  group by paid_date
)
select jsonb_build_object(
  'rep', (select to_jsonb(rep) from rep),
  'lo',  (select to_jsonb(lo) from lo) || (select to_jsonb(re) from re) || (select to_jsonb(od) from od),
  'cu',  (select to_jsonb(cu) from cu),
  'leads', coalesce((select jsonb_object_agg(status, n) from ld), '{}'::jsonb),
  'assigned_verifications', (select coalesce(sum(n), 0) from ld where status = 'Agent Assigned' and p_agent is not null),
  'series', coalesce((select jsonb_agg(jsonb_build_object('d', d, 'amt', amt)) from ser), '[]'::jsonb)
)
$$;

revoke all on public.collection_sheet_rows from anon, authenticated;
grant select on public.collection_sheet_rows to service_role;
revoke all on function public.dashboard_metrics(date, date, text[], text, boolean) from public, anon, authenticated;
grant execute on function public.dashboard_metrics(date, date, text[], text, boolean) to service_role;

notify pgrst, 'reload schema';
