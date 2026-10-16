-- ============================================================
-- COMPREHENSIVE ENUM FIX MIGRATION
-- Run this in Supabase SQL Editor to fix ALL enum mismatches
-- ============================================================

-- 1. user_role: Add 'NGF AGENT' (code uses this, DB has 'Collection Agent')
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'NGF AGENT';

-- 2. agent_type: Add 'Verification & Collection' (code uses this, DB has 'Field', 'Tele', 'Both')
ALTER TYPE agent_type ADD VALUE IF NOT EXISTS 'Verification & Collection';

-- 3. capital_type: Add 'Own' and 'Investor' (from previous fix_capital_enum.sql)
ALTER TYPE capital_type ADD VALUE IF NOT EXISTS 'Own';
ALTER TYPE capital_type ADD VALUE IF NOT EXISTS 'Investor';

-- 4. Verify all enum values
SELECT 'user_role' as enum_name, enumlabel FROM pg_enum WHERE enumtypid = 'user_role'::regtype ORDER BY enumsortorder;
SELECT 'agent_type' as enum_name, enumlabel FROM pg_enum WHERE enumtypid = 'agent_type'::regtype ORDER BY enumsortorder;
SELECT 'capital_type' as enum_name, enumlabel FROM pg_enum WHERE enumtypid = 'capital_type'::regtype ORDER BY enumsortorder;
SELECT 'lead_status' as enum_name, enumlabel FROM pg_enum WHERE enumtypid = 'lead_status'::regtype ORDER BY enumsortorder;
SELECT 'verification_result' as enum_name, enumlabel FROM pg_enum WHERE enumtypid = 'verification_result'::regtype ORDER BY enumsortorder;
SELECT 'loan_status' as enum_name, enumlabel FROM pg_enum WHERE enumtypid = 'loan_status'::regtype ORDER BY enumsortorder;
SELECT 'repayment_status' as enum_name, enumlabel FROM pg_enum WHERE enumtypid = 'repayment_status'::regtype ORDER BY enumsortorder;
SELECT 'payout_status' as enum_name, enumlabel FROM pg_enum WHERE enumtypid = 'payout_status'::regtype ORDER BY enumsortorder;