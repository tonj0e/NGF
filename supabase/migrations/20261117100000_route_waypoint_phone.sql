-- Subroutes can carry a phone number so the agent can call the person there. Additive only.
ALTER TABLE public.route_waypoints ADD COLUMN IF NOT EXISTS phone text;
