-- Scale tuning (found by the speed test on fake data): faster settlement totals and the paid-history list.
-- Replaces one view and one function with faster versions that give the same answers, and adds one index. No data changes.

-- Same lines as before, but the payment mode from Collections is looked up once per repayment through a matching index (it was evaluated twice)
create or replace view public.settlement_lines
with (security_invoker = true) as
select r.repayment_id, r.due_date, r.amount, r.status::text as status, r.loan_id, r.customer_id,
       l.guarantor_id,
       nullif(r.collection_agent_id, '') as collector_user_id,
       coalesce(c.payment_mode, r.payment_mode::text, '') as payment_mode,
       u.role::text as collector_role, u.name as collector_name,
       coalesce(gc.code, ag.agent_id, '') as collector_code,
       r.updated_at
from public.repayments r
join public.loans l on l.loan_id = r.loan_id
left join lateral (select nullif(c1.payment_mode::text, '') as payment_mode from public.collections c1
                     where c1.repayment_id = r.repayment_id and c1.payment_mode is not null
                     order by c1.created_at desc limit 1) c on true
left join public.users u on u.user_id = r.collection_agent_id
left join public.guarantors gc on gc.user_id = r.collection_agent_id
left join public.agents ag on ag.user_id = r.collection_agent_id
where r.status <> 'Waived'
  and (l.status not in ('Closed', 'Completed')
       or (r.status = 'Paid' and coalesce(r.collection_agent_id, '') <> ''));

-- Same totals; the date window is written so the database can use the due-date index
create or replace function public.settlement_summary(
  p_from date, p_to date, p_guarantors text[] default null, p_unsettled boolean default false,
  p_search text default null, p_offset integer default 0, p_limit integer default 100)
returns table (due_date date, guarantor_id text, guarantor_name text, guarantor_code text, guarantor_phone text,
               total_due numeric, unpaid numeric, upi_due numeric, cash_due numeric,
               collectors jsonb, settlement jsonb, total_count bigint)
language sql stable security invoker as $$
with lines as (
  select s.*, (lower(s.payment_mode) like '%upi%' or lower(s.payment_mode) like '%qr%' or lower(s.payment_mode) like '%bank%') as is_upi
  from public.settlement_lines s
  where s.due_date >= coalesce(p_from, date '2000-01-01') and s.due_date <= coalesce(p_to, date '2999-12-31')
    and (p_guarantors is null or s.guarantor_id = any(p_guarantors))
), per_collector as (
  select due_date, guarantor_id, collector_user_id,
         max(collector_name) as collector_name, max(collector_code) as collector_code, max(collector_role) as collector_role,
         coalesce(sum(amount) filter (where not is_upi), 0) as cash, coalesce(sum(amount) filter (where is_upi), 0) as upi
  from lines where status = 'Paid'
  group by due_date, guarantor_id, collector_user_id
), totals as (
  select due_date, guarantor_id,
         sum(amount) as total_due,
         coalesce(sum(amount) filter (where status <> 'Paid'), 0) as unpaid,
         coalesce(sum(amount) filter (where status = 'Paid' and is_upi), 0) as upi_due,
         coalesce(sum(amount) filter (where status = 'Paid' and not is_upi
                    and (collector_user_id is null or collector_role = 'Guarantor')), 0) as cash_due
  from lines group by due_date, guarantor_id
), collectors_agg as (
  select due_date, guarantor_id,
         jsonb_agg(jsonb_build_object('collectorUserId', coalesce(collector_user_id, ''),
                'collectorName', collector_name, 'collectorCode', coalesce(collector_code, ''),
                'collectorRole', coalesce(collector_role, ''), 'cash', cash, 'upi', upi)) as collectors
  from per_collector group by due_date, guarantor_id
), joined as (
  select t.*, g.name as g_name, g.code as g_code, g.phone as g_phone, s.settlement, ca.collectors
  from totals t
  join public.guarantors g on g.guarantor_id = t.guarantor_id
  left join collectors_agg ca on ca.due_date = t.due_date and ca.guarantor_id = t.guarantor_id
  left join lateral (select to_jsonb(x) as settlement from public.settlements x
                      where x.saturday_date = t.due_date and x.entity_id = t.guarantor_id order by x.created_at limit 1) s on true
  where p_search is null or p_search = '' or g.name ilike '%' || p_search || '%' or g.code ilike '%' || p_search || '%'
)
select j.due_date, j.guarantor_id, j.g_name, j.g_code, j.g_phone, j.total_due, j.unpaid, j.upi_due, j.cash_due,
       coalesce(j.collectors, '[]'::jsonb), j.settlement, count(*) over () as total_count
from joined j
where not p_unsettled
   or j.unpaid > 0
   or coalesce((j.settlement->>'balance')::numeric, 0) > 0
   or j.settlement is null
   or j.settlement->>'status' <> 'Settled'
order by j.due_date desc, j.g_name
offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 500)
$$;

-- Paid-history list: newest payment first, ties by id (matches the list's sort so the index can be used)
create index if not exists idx_collections_repayment_mode on public.collections (repayment_id, created_at desc) where payment_mode is not null;
create index if not exists idx_repayments_paid_order on public.repayments (paid_date desc, repayment_id) where status = 'Paid';

notify pgrst, 'reload schema';
