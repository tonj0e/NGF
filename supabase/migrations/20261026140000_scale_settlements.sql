-- Scale work (settlements): one read-only view and one read-only function. No data changes.
-- The Settlements page used to download every repayment ever made and add them up in the browser;
-- now the database adds them up per guarantor and Saturday and the page asks for one page at a time.

-- One line per repayment that counts toward a settlement.
-- Waived weeks never count. Weeks of closed / completed loans count only if a real person collected them.
create or replace view public.settlement_lines
with (security_invoker = true) as
select r.repayment_id, r.due_date, r.amount, r.status::text as status, r.loan_id, r.customer_id,
       l.guarantor_id,
       nullif(r.collection_agent_id, '') as collector_user_id,
       coalesce(
         (select nullif(c.payment_mode::text, '') from public.collections c
           where c.repayment_id = r.repayment_id order by c.created_at desc limit 1),
         r.payment_mode::text, '') as payment_mode,
       u.role::text as collector_role, u.name as collector_name,
       coalesce(gc.code, ag.agent_id, '') as collector_code,
       r.updated_at
from public.repayments r
join public.loans l on l.loan_id = r.loan_id
left join public.users u on u.user_id = r.collection_agent_id
left join public.guarantors gc on gc.user_id = r.collection_agent_id
left join public.agents ag on ag.user_id = r.collection_agent_id
where r.status <> 'Waived'
  and (l.status not in ('Closed', 'Completed')
       or (r.status = 'Paid' and coalesce(r.collection_agent_id, '') <> ''));

-- Per guarantor and Saturday: totals, cash/UPI split, who collected what, and the settlement record if there is one.
-- p_from / p_to: Saturdays to include (either may be null). p_unsettled: only weeks that still need attention.
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
  where (p_from is null or s.due_date >= p_from) and (p_to is null or s.due_date <= p_to)
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
), joined as (
  select t.*, g.name as g_name, g.code as g_code, g.phone as g_phone,
         (select jsonb_agg(jsonb_build_object('collectorUserId', coalesce(pc.collector_user_id, ''),
                'collectorName', pc.collector_name, 'collectorCode', coalesce(pc.collector_code, ''),
                'collectorRole', coalesce(pc.collector_role, ''), 'cash', pc.cash, 'upi', pc.upi))
            from per_collector pc where pc.due_date = t.due_date and pc.guarantor_id = t.guarantor_id) as collectors,
         (select to_jsonb(s) from public.settlements s
            where s.saturday_date = t.due_date and s.entity_id = t.guarantor_id order by s.created_at limit 1) as settlement
  from totals t join public.guarantors g on g.guarantor_id = t.guarantor_id
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

revoke all on public.settlement_lines from anon, authenticated;
grant select on public.settlement_lines to service_role;
revoke all on function public.settlement_summary(date, date, text[], boolean, text, integer, integer) from public, anon, authenticated;
grant execute on function public.settlement_summary(date, date, text[], boolean, text, integer, integer) to service_role;

create index if not exists idx_settlements_saturday_entity on public.settlements (saturday_date, entity_id);

notify pgrst, 'reload schema';
