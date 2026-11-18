-- Customers list in one database call: the page of customers, their count and everything the list shows about them
-- (loans, weekly rows, first collection times, leads, guarantor and agent names). Read-only; no data or table changes.
-- Used by GET /api/customers (app/api/customers/route.ts). Until this function exists the route reads the same rows
-- with its old separate requests (page query, then loans + leads, then guarantors + agents + weeks, then collections).
-- Same rules as those requests:
--   p_guarantors  null = every customer; otherwise only these guarantors' customers (Guarantor, Staff branches)
--   p_agent       only customers with a loan assigned to this agent (null = no limit)
--   p_customer_id one customer (null = no limit)
--   p_search      the cleaned search text: name, phone, place or active loan id contains it (ilike), null/'' = no search
--   order         newest first (created_at desc, customer_id), then p_offset / p_limit (null limit = every row)
--   total         the exact count of the filtered customers (before paging)
--   loans         every loan of the page's customers, by loan_id
--   active_loans  the loans named in the page's active_loan_id, by loan_id
--   repayments    every weekly row of `loans`, by repayment_id
--   collections   repayment_id + created_at of every collection of those weeks
--   other_overdue loans in active_loans that are not in loans and have a Pending week due before p_today
--   leads         the list's lead columns; guarantors (id, name, code) and agents (id, name) of the customers and loans
create or replace function public.customers_page(
  p_guarantors text[] default null, p_agent text default null, p_customer_id text default null,
  p_search text default null, p_offset integer default 0, p_limit integer default null, p_today date default null)
returns json
language sql stable security invoker
set search_path = public
as $$
  with f as (
    select c.* from public.customers c
    where (p_guarantors is null or c.guarantor_id = any(p_guarantors))
      and (p_agent is null or c.customer_id in (select l.customer_id from public.loans l where l.assigned_agent_id = p_agent))
      and (p_customer_id is null or c.customer_id = p_customer_id)
      and (coalesce(p_search, '') = ''
           or c.name ilike '%' || p_search || '%' or c.phone ilike '%' || p_search || '%'
           or c.place ilike '%' || p_search || '%' or c.active_loan_id ilike '%' || p_search || '%')
  ),
  pg as (select * from f order by created_at desc, customer_id offset coalesce(p_offset, 0) limit p_limit),
  own as (select l.* from public.loans l where l.customer_id in (select customer_id from pg)),
  act as (select l.* from public.loans l where l.loan_id in (select active_loan_id from pg)),
  reps as (select r.* from public.repayments r where r.loan_id in (select loan_id from own))
  select json_build_object(
    'total', (select count(*) from f),
    'customers', coalesce((select json_agg(pg order by pg.created_at desc, pg.customer_id) from pg), '[]'::json),
    'loans', coalesce((select json_agg(own order by own.loan_id) from own), '[]'::json),
    'active_loans', coalesce((select json_agg(act order by act.loan_id) from act), '[]'::json),
    'repayments', coalesce((select json_agg(reps order by reps.repayment_id) from reps), '[]'::json),
    'collections', coalesce((select json_agg(t order by t.collection_id) from (
        select co.collection_id, co.repayment_id, co.created_at from public.collections co
        where co.repayment_id in (select repayment_id from reps)) t), '[]'::json),
    'other_overdue', coalesce((select json_agg(distinct r.loan_id) from public.repayments r
        where r.loan_id in (select loan_id from act where loan_id not in (select loan_id from own))
          and r.status = 'Pending' and r.due_date < p_today), '[]'::json),
    'leads', coalesce((select json_agg(t) from (
        select ld.lead_id, ld.nominee_name, ld.nominee_phone, ld.aadhaar_no, ld.customer_photo_url, ld.aadhaar_front_url,
               ld.aadhaar_back_url, ld.house_photo_url, ld.landmark_photo_url, ld.cheque_photo_url, ld.verification_notes
        from public.leads ld where ld.lead_id in (select lead_id from pg)) t), '[]'::json),
    'guarantors', coalesce((select json_agg(t) from (
        select g.guarantor_id, g.name, g.code from public.guarantors g
        where g.guarantor_id in (select guarantor_id from pg union select guarantor_id from own union select guarantor_id from act)) t), '[]'::json),
    'agents', coalesce((select json_agg(t) from (
        select a.agent_id, a.name from public.agents a
        where a.agent_id in (select assigned_agent_id from own union select assigned_agent_id from act)) t), '[]'::json)
  )
$$;

revoke all on function public.customers_page(text[], text, text, text, integer, integer, date) from public, anon, authenticated;
grant execute on function public.customers_page(text[], text, text, text, integer, integer, date) to service_role;

notify pgrst, 'reload schema';
