---
title: Lead 08 Agent can edit any lead
section: Security
status: open
last_verified: 2026-10-17
priority: 8
area: Leads
fix_step: fix-5
fingerprint: lead-submit-verification-missing-assigned-agent-check
tags: [ngf, security, lead, leads]
---
# Lead 08 Agent can edit any lead
**Any agent to other agents' leads. Status: open, not yet fixed. Needs validation (nothing was run).**

## What the source shows
PATCH /api/leads/[leadId] with action submitVerification checks only requireRole(['NGF AGENT']). It then loads the lead by the URL leadId and never compares lead['Assigned Agent ID'] with the caller's Agent ID. It also does not check lead Status. An agent who knows another lead's ID can overwrite that lead's customer PII (name, phone, Aadhaar, PAN, bank account and IFSC), photo URLs and verification notes. The agent can also force Status to 'Verification Submitted' on a lead that was already Approved, Converted or Rejected. The Admin notification names the submitting agent. The list GET in app/api/leads/route.ts does scope agents to their assigned leads, so the item-level PATCH lacks the ownership rule that the list enforces.

## Source trace
1. `app/api/leads/[leadId]/route.ts:84`: Action dispatch; leadId comes from the URL path and the body is validated only for shape by submitVerificationSchema.
2. `app/api/leads/[leadId]/route.ts:92`: requireRole(['NGF AGENT']) followed by findRecord on the URL leadId (lines 93-94). No comparison of Assigned Agent ID with the session's agent, and no Status check.
3. `app/api/leads/[leadId]/route.ts:129`: updateById('Leads', leadId, ...) overwrites the PII fields, photo URLs and Status on the arbitrary lead. Photo uploads (lines 116-121) and Drive folder creation (lines 105-112) also run before this.

## Why it is not confirmed
- No OS-enforced sandbox with memory limits on this host; target code was not executed. The result comes from source reading only.
- The attacker needs another agent's leadId. The ID format and whether it is exposed to other agents (makeId('LEAD') at app/api/leads/route.ts:113, notifications, shared views) were not established. An attacker also needs an NGF AGENT account.
- No database trigger, RLS rule or other server-side check on the Leads table was observed. All access goes through the service-role key, so this is source-inferred only.

## How to check it (safe, dummy data)
With dummy data in a local or staging stack, create lead L assigned to agent A and a lead in Approved status. Authenticate as a separate dummy agent B and send PATCH /api/leads/L with {action:'submitVerification', ...} and a dummy customerName. Expect success and L's fields and Status overwritten. Repeat on the Approved lead and expect Status reset to 'Verification Submitted'. After the fix, expect 403 when the Assigned Agent ID differs from B's Agent ID or when Status is not Agent Assigned or Reverification.

## Owner check
Owner check: confirm that no database trigger or constraint on the Leads table blocks the update. Also confirm whether lead IDs are guessable or visible to other agents, for example through notifications or shared views.

## Related
- [[Open Security Leads]], [[Security Fix Plan]] (step 5), [[Security Brain]]
