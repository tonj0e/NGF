-- Scale work (history / past month): totals of paid weekly payments in a date range, done in the database.
-- Read-only function and one index. No data changes.

create or replace function public.repayment_paid_summary(
  p_from date, p_to date, p_guarantors text[] default null, p_agent text default null)
returns table (paid_count bigint, paid_total numeric)
language sql stable security invoker as $$
  select count(*), coalesce(sum(r.amount), 0)
  from public.repayments_enriched r
  where r.status = 'Paid'
    and r.paid_date between p_from and p_to
    and (p_guarantors is null or r.guarantor_id = any(p_guarantors))
    and (p_agent is null or r.assigned_agent_id = p_agent)
$$;

revoke all on function public.repayment_paid_summary(date, date, text[], text) from public, anon, authenticated;
grant execute on function public.repayment_paid_summary(date, date, text[], text) to service_role;

create index if not exists idx_repayments_paid_date on public.repayments (paid_date) where status = 'Paid';

notify pgrst, 'reload schema';
