-- Add updated_at column to payout_requests table
-- Run this in Supabase SQL Editor

ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Verify the column was added
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'payout_requests'
ORDER BY ordinal_position;