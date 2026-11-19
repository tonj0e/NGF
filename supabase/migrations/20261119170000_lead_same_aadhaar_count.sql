-- Leads list: "same Aadhaar" check read together with the page rows (one database step instead of two).
-- A computed column for PostgREST: GET /api/leads selects `x_same_aadhaar:lead_same_aadhaar_count` next to `*`.
-- It is the number of leads (any guarantor, any status, the lead itself included) whose aadhaar_no equals this lead's,
-- exactly what the route counted before with a second read (aadhaar_no in (...the page's numbers)).
-- Read-only; no data or table changes. Uses the existing index idx_leads_aadhaar_no.
-- Until this function exists the route keeps the separate read (app/api/leads/route.ts, fallback).
create or replace function public.lead_same_aadhaar_count(l public.leads)
returns bigint
language sql stable security invoker as $$
  select count(*) from public.leads x where x.aadhaar_no = l.aadhaar_no
$$;

revoke all on function public.lead_same_aadhaar_count(public.leads) from public, anon, authenticated;
grant execute on function public.lead_same_aadhaar_count(public.leads) to service_role;

notify pgrst, 'reload schema';
