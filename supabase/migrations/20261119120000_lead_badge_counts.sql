-- Leads list tab badges in one call instead of seven. Read-only; no data or table changes.
-- Same rules as the head counts in app/api/leads/route.ts (GET), which stay as the fallback while this function is missing:
--   new             not Converted/Rejected (and not Returned, except for a guarantor), not a renewal
--   history         Converted, Rejected or Returned, not a renewal
--   renewal         loan product RENEWAL
--   approved        status Approved (any product)
--   stage_*         the three parts of New: not yet assigned / with an agent / verified
-- p_guarantors: null = every lead (Admin, agent); otherwise only these guarantors' leads (Guarantor, Staff branches).
-- p_agent: only the leads assigned to this agent (null = no limit).
-- A NULL status or loan product never counts where the API's eq/neq/in filters would leave it out (same NULL rules).
create or replace function public.lead_badge_counts(
  p_guarantors text[] default null, p_agent text default null, p_returned_is_new boolean default false)
returns jsonb
language sql stable security invoker as $$
  with s as (
    select l.status::text as st,
           l.status::text not in ('Converted', 'Rejected') and (p_returned_is_new or l.status::text <> 'Returned')
             and l.loan_product::text <> 'RENEWAL' as is_new,
           l.loan_product::text as lp
    from public.leads l
    where (p_guarantors is null or l.guarantor_id = any(p_guarantors))
      and (p_agent is null or l.assigned_agent_id = p_agent)
  )
  select jsonb_build_object(
    'new',             count(*) filter (where is_new),
    'history',         count(*) filter (where st in ('Converted', 'Rejected', 'Returned') and lp <> 'RENEWAL'),
    'renewal',         count(*) filter (where lp = 'RENEWAL'),
    'approved',        count(*) filter (where st = 'Approved'),
    'stage_new',       count(*) filter (where is_new and st not in ('Converted', 'Rejected', 'Returned',
                         'Agent Assigned', 'Verification In Progress', 'Verification Submitted', 'Approved')),
    'stage_assigned',  count(*) filter (where is_new and st in ('Agent Assigned', 'Verification In Progress')),
    'stage_completed', count(*) filter (where is_new and st in ('Verification Submitted', 'Approved'))
  )
  from s
$$;

revoke all on function public.lead_badge_counts(text[], text, boolean) from public, anon, authenticated;
grant execute on function public.lead_badge_counts(text[], text, boolean) to service_role;

notify pgrst, 'reload schema';
