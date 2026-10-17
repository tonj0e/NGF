-- Migration: Verification Day Route (visit location + date per lead, ordered route per agent per day)
-- Date: 2026-10-19
-- Additive only: adds nullable columns to leads and one new table. Nothing existing is altered, truncated or deleted.
--
-- Design notes
--  * A lead's visit is described by visit_lat/visit_lng/visit_place (fixed after the phone call), visit_date and an optional visit_window.
--  * The route for one agent on one day = leads with that assigned_agent_id and visit_date, ordered by route_seq.
--  * leg_km / leg_min = road distance and time from the previous stop (or from the start point for stop 1).
--  * route_pin = 'first' | 'last' keeps a stop at the start or end when the route is re-optimised.
--  * route_plans holds the start point and totals of each day's route.
--  * RLS enabled with NO policies: only the service-role key (server) can read or write.

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS visit_lat      numeric(10,7);
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS visit_lng      numeric(10,7);
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS visit_place    text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS visit_date     date;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS visit_window   text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS visit_note     text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS call_outcome   text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS visit_status   text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS route_seq      integer;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS route_pin      text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS leg_km         numeric(8,2);
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS leg_min        integer;

CREATE INDEX IF NOT EXISTS idx_leads_agent_visit_date ON public.leads (assigned_agent_id, visit_date);

CREATE TABLE IF NOT EXISTS public.route_plans (
  agent_id     text        NOT NULL,
  plan_date    date        NOT NULL,
  start_lat    numeric(10,7),
  start_lng    numeric(10,7),
  start_source text,
  total_km     numeric(8,2),
  total_min    integer,
  distance_src text,
  manual       boolean     NOT NULL DEFAULT false,
  updated_by   text,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (agent_id, plan_date)
);
ALTER TABLE public.route_plans ENABLE ROW LEVEL SECURITY;

-- Road distance cache so re-ordering a route does not call the Google Routes API again for the same pair of places.
CREATE TABLE IF NOT EXISTS public.route_dist_cache (
  pair_key   text        PRIMARY KEY,
  km         numeric(8,2) NOT NULL,
  minutes    integer     NOT NULL,
  source     text        NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.route_dist_cache ENABLE ROW LEVEL SECURITY;
