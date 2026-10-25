-- Scale work (Reports page): read-only functions and one view. No data changes.
-- The Reports page used to download every loan, repayment, settlement, customer and guarantor and add them up in the browser.
-- p_guarantors limits everything to a branch's guarantors (null = everything, for the Admin).

-- Paid weeks collected by someone who is not a guarantor (admin, staff or a field agent)
create or replace view public.report_staff_collections
with (security_invoker = true) as
select r.*
from public.repayments_enriched r
where r.status = 'Paid' and coalesce(r.collection_agent_id, '') <> ''
  and not exists (select 1 from public.guarantors g where g.user_id = r.collection_agent_id);

create or replace function public.reports_summary(p_today date, p_guarantors text[] default null)
returns jsonb
language sql stable security invoker as $$
with ml as (select l.* from public.loans l where p_guarantors is null or l.guarantor_id = any(p_guarantors)),
rp as (select r.amount, r.status::text as status, r.due_date, r.paid_date from public.repayments r join ml on ml.loan_id = r.loan_id)
select jsonb_build_object(
  'total_portfolio', (select coalesce(sum(principal_amount), 0) from ml where status = 'Active'),
  'active_loans', (select count(*) from ml where status = 'Active'),
  'completed_loans', (select count(*) from ml where status = 'Completed'),
  'overdue_loans', (select count(*) from ml where status = 'Active' and exists (
      select 1 from public.repayments r where r.loan_id = ml.loan_id and r.status = 'Pending' and r.due_date < p_today)),
  'active_customers', (select count(distinct customer_id) from ml where status = 'Active'),
  'this_month', (select coalesce(sum(amount), 0) from rp where status = 'Paid'
      and paid_date >= date_trunc('month', p_today)::date and paid_date < (date_trunc('month', p_today) + interval '1 month')::date),
  'last_month', (select coalesce(sum(amount), 0) from rp where status = 'Paid'
      and paid_date >= (date_trunc('month', p_today) - interval '1 month')::date and paid_date < date_trunc('month', p_today)::date),
  'total_collected', (select coalesce(sum(amount), 0) from rp where status = 'Paid'),
  'pending_amount', (select coalesce(sum(amount), 0) from rp where status in ('Pending', 'Overdue') and due_date < p_today)
)
$$;

-- Months that have any money movement, with credit (paid in), payment count and debit (disbursed)
create or replace function public.reports_months(p_guarantors text[] default null)
returns table (ym text, credit numeric, tx_count bigint, debit numeric)
language sql stable security invoker as $$
with ml as (select l.loan_id, l.start_date, l.net_disbursed from public.loans l where p_guarantors is null or l.guarantor_id = any(p_guarantors)),
c as (select to_char(r.paid_date, 'YYYY-MM') as ym, sum(r.amount) as credit, count(*) as n
        from public.repayments r join ml on ml.loan_id = r.loan_id where r.status = 'Paid' and r.paid_date is not null group by 1),
d as (select to_char(start_date, 'YYYY-MM') as ym, sum(net_disbursed) as debit from ml where start_date is not null group by 1),
s as (select distinct to_char(settlement_date, 'YYYY-MM') as ym from public.settlements
        where settlement_date is not null and (p_guarantors is null or entity_id = any(p_guarantors)))
select m.ym, coalesce(c.credit, 0), coalesce(c.n, 0), coalesce(d.debit, 0)
from (select ym from c union select ym from d union select ym from s) m
left join c on c.ym = m.ym left join d on d.ym = m.ym
order by m.ym desc
$$;

-- One month's totals (the lists come from paged queries)
create or replace function public.reports_month(p_month text, p_guarantors text[] default null)
returns jsonb
language sql stable security invoker as $$
with bounds as (select (p_month || '-01')::date as d0, ((p_month || '-01')::date + interval '1 month')::date as d1)
select jsonb_build_object(
  'loan_count', (select count(*) from public.loans l, bounds b where l.start_date >= b.d0 and l.start_date < b.d1 and (p_guarantors is null or l.guarantor_id = any(p_guarantors))),
  'loans_net_disbursed', (select coalesce(sum(l.net_disbursed), 0) from public.loans l, bounds b where l.start_date >= b.d0 and l.start_date < b.d1 and (p_guarantors is null or l.guarantor_id = any(p_guarantors))),
  'loans_commission', (select coalesce(sum(l.guarantor_commission), 0) from public.loans l, bounds b where l.start_date >= b.d0 and l.start_date < b.d1 and (p_guarantors is null or l.guarantor_id = any(p_guarantors))),
  'guarantor_submissions', (select coalesce(sum(s.amount_submitted), 0) from public.settlements s, bounds b where s.entity_type = 'Guarantor' and s.settlement_date >= b.d0 and s.settlement_date < b.d1 and (p_guarantors is null or s.entity_id = any(p_guarantors))),
  'commission_settlements', (select coalesce(sum(s.amount_submitted), 0) from public.settlements s, bounds b where s.entity_type = 'GuarantorCommission' and s.settlement_date >= b.d0 and s.settlement_date < b.d1 and (p_guarantors is null or s.entity_id = any(p_guarantors))),
  'staff_collected', (select coalesce(sum(v.amount), 0) from public.report_staff_collections v, bounds b where v.paid_date >= b.d0 and v.paid_date < b.d1 and (p_guarantors is null or v.guarantor_id = any(p_guarantors)))
)
$$;

-- Small stat blocks for the customer and guarantor cards (one page of ids at a time)
create or replace function public.reports_customer_cards(p_ids text[])
returns table (customer_id text, loan_count bigint, collected numeric, late_count bigint)
language sql stable security invoker as $$
select c.id, coalesce((select count(*) from public.loans l where l.customer_id = c.id), 0),
       coalesce((select sum(r.amount) from public.repayments r where r.customer_id = c.id and r.status = 'Paid'), 0),
       coalesce((select count(*) from public.repayments r where r.customer_id = c.id and r.status = 'Delayed'), 0)
from unnest(p_ids) as c(id)
$$;

create or replace function public.reports_guarantor_cards(p_ids text[])
returns table (guarantor_id text, loan_count bigint, earned numeric, settled numeric)
language sql stable security invoker as $$
select g.id, coalesce((select count(*) from public.loans l where l.guarantor_id = g.id), 0),
       coalesce((select sum(l.guarantor_commission) from public.loans l where l.guarantor_id = g.id), 0),
       coalesce((select sum(s.amount_submitted) from public.settlements s where s.entity_id = g.id and s.entity_type = 'GuarantorCommission'), 0)
from unnest(p_ids) as g(id)
$$;

revoke all on public.report_staff_collections from anon, authenticated;
grant select on public.report_staff_collections to service_role;
revoke all on function public.reports_summary(date, text[]), public.reports_months(text[]), public.reports_month(text, text[]),
  public.reports_customer_cards(text[]), public.reports_guarantor_cards(text[]) from public, anon, authenticated;
grant execute on function public.reports_summary(date, text[]), public.reports_months(text[]), public.reports_month(text, text[]),
  public.reports_customer_cards(text[]), public.reports_guarantor_cards(text[]) to service_role;

create index if not exists idx_loans_start_date on public.loans (start_date);
create index if not exists idx_settlements_settlement_date on public.settlements (settlement_date);

notify pgrst, 'reload schema';
