-- Migration: Add temporary blocking support for users
-- Date: 2026-10-14

-- Add blocking columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_until TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_by TEXT REFERENCES users(user_id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS block_reason TEXT;

-- Create index for efficient block queries
CREATE INDEX IF NOT EXISTS idx_users_blocked_until ON users(blocked_until) WHERE blocked_until IS NOT NULL;

-- Verify the changes
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'users' 
AND column_name IN ('blocked_at', 'blocked_until', 'blocked_by', 'block_reason')
ORDER BY column_name;