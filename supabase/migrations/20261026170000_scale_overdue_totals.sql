-- Scale work (admin assistant): overdue payment count and amount added to company_totals. Read-only, no data changes.
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
  'overdue_count', (select count(*) from public.repayments where status = 'Pending' and due_date < (now() at time zone 'Asia/Kolkata')::date),
  'overdue_amount', (select coalesce(sum(amount), 0) from public.repayments where status = 'Pending' and due_date < (now() at time zone 'Asia/Kolkata')::date),
  'commission_by_guarantor', coalesce((select jsonb_object_agg(guarantor_id, c)
      from (select guarantor_id, sum(guarantor_commission) as c from public.loans where guarantor_id is not null group by guarantor_id) x), '{}'::jsonb)
)
$$;
notify pgrst, 'reload schema';
