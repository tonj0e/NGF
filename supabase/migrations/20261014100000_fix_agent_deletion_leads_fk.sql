-- Migration: Fix agent deletion by updating leads FK constraint
-- Date: 2026-10-14
-- This migration changes the leads.assigned_agent_id FK to ON DELETE SET NULL
-- so that agents can be deleted while preserving leads (agent_id set to NULL).

-- Drop existing FK constraint
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_assigned_agent_id_fkey;

-- Add new FK with ON DELETE SET NULL
ALTER TABLE leads ADD CONSTRAINT leads_assigned_agent_id_fkey 
  FOREIGN KEY (assigned_agent_id) REFERENCES agents(agent_id) ON DELETE SET NULL;

-- Verify the change
SELECT 
  tc.constraint_name, 
  tc.table_name, 
  kcu.column_name, 
  ccu.table_name AS foreign_table_name,
  rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
WHERE tc.constraint_name = 'leads_assigned_agent_id_fkey';