-- Scale work (capital, financial analytics, projection, organisation chart, collections): one read-only function
-- and one read-only view. No data changes. The pages used to download every loan and repayment just to add them up.

-- Company-wide loan and repayment totals, added up by the database
create or replace function public.company_totals()
returns jsonb
language sql stable security invoker as $$
select jsonb_build_object(
  'loan_count', (select count(*) from public.loans),
  'active_principal', (select coalesce(sum(principal_amount), 0) from public.loans where status = 'Active'),
  'active_interest', (select coalesce(sum(interest_deduction), 0) from public.loans where status = 'Active'),
  'active_commission', (select coalesce(sum(guarantor_commission), 0) from public.loans where status = 'Active'),
  'active_net_disbursed', (select coalesce(sum(net_disbursed), 0) from public.loans where status = 'Active'),
  'total_principal', (select coalesce(sum(principal_amount), 0) from public.loans),
  'total_interest', (select coalesce(sum(interest_deduction), 0) from public.loans),
  'paid_total', (select coalesce(sum(amount), 0) from public.repayments where status = 'Paid'),
  'pending_total', (select coalesce(sum(amount), 0) from public.repayments where status in ('Pending', 'Overdue')),
  'commission_by_guarantor', coalesce((select jsonb_object_agg(guarantor_id, c)
      from (select guarantor_id, sum(guarantor_commission) as c from public.loans where guarantor_id is not null group by guarantor_id) x), '{}'::jsonb)
)
$$;

-- Collections with loan, customer, guarantor and agent details; closed / completed loans left out
create or replace view public.collections_enriched
with (security_invoker = true) as
select c.*, l.guarantor_id, cu.name as customer_name, g.name as guarantor_name, g.code as guarantor_code, a.name as agent_name
from public.collections c
join public.loans l on l.loan_id = c.loan_id and l.status not in ('Closed', 'Completed')
left join public.customers cu on cu.customer_id = c.customer_id
left join public.guarantors g on g.guarantor_id = l.guarantor_id
left join public.agents a on a.agent_id = c.agent_id;

revoke all on function public.company_totals() from public, anon, authenticated;
grant execute on function public.company_totals() to service_role;
revoke all on public.collections_enriched from anon, authenticated;
grant select on public.collections_enriched to service_role;

create index if not exists idx_collections_payment_date on public.collections (payment_date);

notify pgrst, 'reload schema';
