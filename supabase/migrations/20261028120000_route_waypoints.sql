-- Waypoints on an agent's day route: an extra place to pass through (for example the petrol pump where a customer works).
-- It is not a customer visit: no verification form, only "mark done". It exists so the route and the kilometres are right.
-- Additive only: one new table. RLS enabled with no policies: only the server (service role) can read or write.
CREATE TABLE IF NOT EXISTS public.route_waypoints (
  waypoint_id  text        PRIMARY KEY,
  agent_id     text        NOT NULL,
  plan_date    date        NOT NULL,
  name         text        NOT NULL,
  note         text,
  for_lead_id  text,
  lat          numeric(10,7) NOT NULL,
  lng          numeric(10,7) NOT NULL,
  route_seq    integer,
  leg_km       numeric(8,2),
  leg_min      integer,
  done         boolean     NOT NULL DEFAULT false,
  done_at      timestamptz,
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_route_waypoints_agent_date ON public.route_waypoints (agent_id, plan_date);
ALTER TABLE public.route_waypoints ENABLE ROW LEVEL SECURITY;
