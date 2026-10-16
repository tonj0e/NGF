-- ============================================================
-- PHASE 3 COMPLETION - Remaining Database Migrations
-- Run this in Supabase SQL Editor AFTER fix_all_enums.sql
-- ============================================================

-- 3.1 Add updated_at column to payout_requests (from fix_payout_requests_updated_at.sql)
ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 3.2 Create updated_at trigger for payout_requests (already in schema but won't work without column)
DROP TRIGGER IF EXISTS update_payout_requests_updated_at ON payout_requests;
CREATE TRIGGER update_payout_requests_updated_at
BEFORE UPDATE ON payout_requests
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 3.3 Verify updated_at triggers exist for all tables with updated_at column
SELECT
    event_object_table as table_name,
    trigger_name,
    action_statement
FROM information_schema.triggers
WHERE action_statement LIKE '%update_updated_at_column%'
ORDER BY event_object_table;

-- 3.4 Foreign Key Constraints - Verify and add missing cascades
-- Current cascades from schema:
-- users -> guarantors (CASCADE)
-- users -> agents (CASCADE)
-- users -> profiles (CASCADE)
-- guarantors -> leads (no cascade, but guarantor_id is FK)
-- guarantors -> customers (no cascade)
-- guarantors -> loans (no cascade)
-- guarantors -> payout_requests (no cascade)
-- guarantors -> deposits (no cascade)
-- guarantors -> deposit_requests (no cascade)
-- leads -> customers (unique FK, no cascade defined in schema)
-- customers -> loans (unique FK, no cascade)
-- loans -> repayments (CASCADE)
-- repayments -> collections (CASCADE)

-- Add missing FK cascades for proper delete order (Repayments -> Loans -> Customers -> Leads)
-- Note: Only add if not already present

-- Leads -> Customers: When lead deleted, cascade to customer
ALTER TABLE customers
DROP CONSTRAINT IF EXISTS customers_lead_id_fkey,
ADD CONSTRAINT customers_lead_id_fkey
FOREIGN KEY (lead_id) REFERENCES leads(lead_id) ON DELETE CASCADE;

-- Customers -> Loans: When customer deleted, cascade to loan
ALTER TABLE loans
DROP CONSTRAINT IF EXISTS loans_customer_id_fkey,
ADD CONSTRAINT loans_customer_id_fkey
FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE CASCADE;

-- Loans -> Repayments: Already has CASCADE (verified in schema line 208)

-- 3.5 Verify all FK constraints
SELECT
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
AND tc.table_schema = 'public'
ORDER BY tc.table_name, kcu.column_name;

-- 3.6 RLS Policies verification - Service role access
-- Schema already has these (lines 474-495), verify they exist
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies
WHERE policyname = 'Service role full access'
ORDER BY tablename;

-- 3.7 Verify all enum values are correct
SELECT 'user_role' as enum_name, enumlabel FROM pg_enum WHERE enumtypid = 'user_role'::regtype ORDER BY enumsortorder;
SELECT 'agent_type' as enum_name, enumlabel FROM pg_enum WHERE enumtypid = 'agent_type'::regtype ORDER BY enumsortorder;
SELECT 'capital_type' as enum_name, enumlabel FROM pg_enum WHERE enumtypid = 'capital_type'::regtype ORDER BY enumsortorder;
SELECT 'lead_status' as enum_name, enumlabel FROM pg_enum WHERE enumtypid = 'lead_status'::regtype ORDER BY enumsortorder;
SELECT 'verification_result' as enum_name, enumlabel FROM pg_enum WHERE enumtypid = 'verification_result'::regtype ORDER BY enumsortorder;
SELECT 'loan_status' as enum_name, enumlabel FROM pg_enum WHERE enumtypid = 'loan_status'::regtype ORDER BY enumsortorder;
SELECT 'repayment_status' as enum_name, enumlabel FROM pg_enum WHERE enumtypid = 'repayment_status'::regtype ORDER BY enumsortorder;
SELECT 'payout_status' as enum_name, enumlabel FROM pg_enum WHERE enumtypid = 'payout_status'::regtype ORDER BY enumsortorder;

-- 3.8 Verify agent tracking columns exist
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'agents'
AND column_name IN ('latitude', 'longitude', 'location_accuracy', 'location_updated_at', 'is_tracking')
ORDER BY ordinal_position;

-- 3.9 Verify payout_requests updated_at column
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'payout_requests'
ORDER BY ordinal_position;