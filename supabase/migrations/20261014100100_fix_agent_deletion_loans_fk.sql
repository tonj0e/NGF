-- Migration: Fix agent deletion by updating loans FK constraint
-- Date: 2026-10-14
-- This migration changes the loans.assigned_agent_id FK to ON DELETE SET NULL
-- so that agents can be deleted while preserving loans (agent_id set to NULL).

-- Drop existing FK constraint
ALTER TABLE loans DROP CONSTRAINT IF EXISTS loans_assigned_agent_id_fkey;

-- Add new FK with ON DELETE SET NULL
ALTER TABLE loans ADD CONSTRAINT loans_assigned_agent_id_fkey 
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
WHERE tc.constraint_name = 'loans_assigned_agent_id_fkey';