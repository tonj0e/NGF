-- Agent punch-out: the day's attendance row also records when (and where) the agent finished work.
-- Location tracking runs from mark-attendance until this is set. Additive and nullable, safe to re-run.
alter table public.agent_attendance add column if not exists punched_out_at timestamptz;
alter table public.agent_attendance add column if not exists out_latitude numeric(10,8);
alter table public.agent_attendance add column if not exists out_longitude numeric(11,8);
