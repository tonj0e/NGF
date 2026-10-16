---
title: Lead 09 Agent can read other agents' GPS history
section: Security
status: open
last_verified: 2026-10-17
priority: 9
area: Field
fix_step: fix-6
fingerprint: agent-attendance-trips-get-agentid-idor
tags: [ngf, security, lead, field]
---
# Lead 09 Agent can read other agents' GPS history
**Any agent to other agents' data. Status: open, not yet fixed. Needs validation (nothing was run).**

## What the source shows
GET /api/agent/attendance and GET /api/agent/trips allow the roles NGF AGENT, Admin and Staff. A client-supplied agentId query parameter overrides the caller's own Agent ID, and the code has no ownership check for the NGF AGENT role. A low-privilege agent who knows another agent's Agent ID could read that agent's attendance rows (including latitude and longitude) and trip rows (start and end coordinates, distances, lead IDs).

## Source trace
1. `app/api/agent/attendance/route.ts:61`: requireRole allows NGF AGENT, Admin and Staff. The agentId query parameter is read at line 63.
2. `app/api/agent/attendance/route.ts:70`: targetAgentId = agentId || own Agent ID. The client value wins, and the only role check is the 'Agent not found' error at line 68, which applies to a missing own record and not to the override.
3. `app/api/agent/attendance/route.ts:74`: AgentAttendance rows are filtered by the client-chosen Agent ID and returned at line 80 with their full contents, including Latitude and Longitude.
4. `app/api/agent/trips/route.ts:75`: requireRole allows NGF AGENT, Admin and Staff. The agentId query parameter is read at line 78.
5. `app/api/agent/trips/route.ts:84`: targetAgentId = agentId || own Agent ID. The client value wins.
6. `app/api/agent/trips/route.ts:88`: AgentTrips rows are filtered by the client-chosen Agent ID and returned at line 94.

## Why it is not confirmed
- No OS-enforced sandbox with memory limits on this host; target code was not executed, so the result is derived from source only.
- A decisive runtime fact is unobserved: whether an NGF AGENT can learn another agent's Agent ID, which is needed to exploit this. The source does not show where IDs are exposed to agents, for example through lead assignment data.

## How to check it (safe, dummy data)
Use dummy data only. Create two Agents rows (A and B) with users, plus AgentAttendance and AgentTrips rows for each. Authenticate as agent A and call GET /api/agent/attendance?agentId=<B's Agent ID> and GET /api/agent/trips?agentId=<B's Agent ID>. If B's rows are returned, the issue is confirmed. After a fix, expect a 403 or only A's own rows. Also check which agent-accessible endpoints (leads, profile) expose other agents' Agent IDs.

## Owner check
Not required beyond confirming that the deployed build matches this source.

## Related
- [[Open Security Leads]], [[Security Fix Plan]] (step 6), [[Security Brain]]
