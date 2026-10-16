-- Add 'Own' and 'Investor' values to capital_type enum
-- Run this in Supabase SQL Editor

ALTER TYPE capital_type ADD VALUE 'Own';
ALTER TYPE capital_type ADD VALUE 'Investor';

-- Verify the enum values
SELECT enumlabel FROM pg_enum WHERE enumtypid = 'capital_type'::regtype ORDER BY enumsortorder;
