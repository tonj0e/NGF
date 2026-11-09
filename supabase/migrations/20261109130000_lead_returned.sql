-- A planner can return a lead to its guarantor with a reason (for example the customer has no cheque yet). Additive; no data is changed.
alter type public.lead_status add value if not exists 'Returned';
alter table public.leads
  add column if not exists return_reason text,
  add column if not exists returned_at timestamptz,
  add column if not exists returned_by text;
