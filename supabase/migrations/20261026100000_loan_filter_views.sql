-- Read-only views so the app can page "overdue" and "renewal eligible" loans in the database
-- instead of loading every loan and repayment. No data changes. Dates use Indian time.

create or replace view public.loans_overdue
with (security_invoker = true) as
select l.*
from public.loans l
where exists (
  select 1 from public.repayments r
  where r.loan_id = l.loan_id
    and r.status = 'Pending'
    and r.due_date < (now() at time zone 'Asia/Kolkata')::date
);

create or replace view public.loans_renewal_eligible
with (security_invoker = true) as
select l.*
from public.loans l
where l.status = 'Completed'
  and not exists (select 1 from public.loans a where a.customer_id = l.customer_id and a.status = 'Active')
  and not exists (
    select 1 from public.customers c
    where c.customer_id = l.customer_id
      and (c.permanent_block is true
           or (c.hold_until is not null and c.hold_until::date > (now() at time zone 'Asia/Kolkata')::date))
  );

-- only the server (service role) reads these
revoke all on public.loans_overdue, public.loans_renewal_eligible from anon, authenticated;
grant select on public.loans_overdue, public.loans_renewal_eligible to service_role;

notify pgrst, 'reload schema';
