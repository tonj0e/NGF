-- Migration: Fix user deletion by updating logs FK constraint
-- Date: 2026-10-14
-- This migration changes the logs.user_id FK to ON DELETE SET NULL
-- so that users can be deleted while preserving audit logs.

-- Step 1: Make user_id nullable (it may already be nullable, but ensure it)
ALTER TABLE logs ALTER COLUMN user_id DROP NOT NULL;

-- Step 2: Drop existing FK constraint
ALTER TABLE logs DROP CONSTRAINT IF EXISTS logs_user_id_fkey;

-- Step 3: Add new FK with ON DELETE SET NULL
ALTER TABLE logs ADD CONSTRAINT logs_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL;

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
WHERE tc.constraint_name = 'logs_user_id_fkey';