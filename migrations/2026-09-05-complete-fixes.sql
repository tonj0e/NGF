-- ============================================================
-- COMPLETE MIGRATION FIXES FOR SUPABASE
-- Run this in Supabase Dashboard → SQL Editor
-- Date: 2026-09-05
-- ============================================================

-- ============================================================
-- 1. ADD MISSING updated_at COLUMNS
-- ============================================================
ALTER TABLE loan_products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ============================================================
-- 2. RECREATE TRIGGER FUNCTION + ALL 12 TRIGGERS
-- ============================================================
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Recreate all triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_guarantors_updated_at BEFORE UPDATE ON guarantors FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_agents_updated_at BEFORE UPDATE ON agents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_loans_updated_at BEFORE UPDATE ON loans FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_repayments_updated_at BEFORE UPDATE ON repayments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_payout_requests_updated_at BEFORE UPDATE ON payout_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_staff_access_updated_at BEFORE UPDATE ON staff_access FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_loan_products_updated_at BEFORE UPDATE ON loan_products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 3. ENUM FIXES (add missing values)
-- ============================================================
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'NGF AGENT';
ALTER TYPE agent_type ADD VALUE IF NOT EXISTS 'Verification & Collection';
ALTER TYPE capital_type ADD VALUE IF NOT EXISTS 'Own';
ALTER TYPE capital_type ADD VALUE IF NOT EXISTS 'Investor';
ALTER TYPE user_status ADD VALUE IF NOT EXISTS 'Deleted';
ALTER TYPE verification_result ADD VALUE IF NOT EXISTS 'Submitted';

-- ============================================================
-- 4. FIX NOTIFICATIONS user_id NOT NULL CONSTRAINT
-- (allows null for role-based notifications)
-- ============================================================
ALTER TABLE notifications ALTER COLUMN user_id DROP NOT NULL;

-- ============================================================
-- 5. VERIFY ALL ENUM VALUES
-- ============================================================
SELECT 'user_role' as enum_name, enumlabel FROM pg_enum WHERE enumtypid = 'user_role'::regtype ORDER BY enumsortorder;
SELECT 'agent_type' as enum_name, enumlabel FROM pg_enum WHERE enumtypid = 'agent_type'::regtype ORDER BY enumsortorder;
SELECT 'capital_type' as enum_name, enumlabel FROM pg_enum WHERE enumtypid = 'capital_type'::regtype ORDER BY enumsortorder;
SELECT 'user_status' as enum_name, enumlabel FROM pg_enum WHERE enumtypid = 'user_status'::regtype ORDER BY enumsortorder;
SELECT 'verification_result' as enum_name, enumlabel FROM pg_enum WHERE enumtypid = 'verification_result'::regtype ORDER BY enumsortorder;
SELECT 'lead_status' as enum_name, enumlabel FROM pg_enum WHERE enumtypid = 'lead_status'::regtype ORDER BY enumsortorder;
SELECT 'loan_status' as enum_name, enumlabel FROM pg_enum WHERE enumtypid = 'loan_status'::regtype ORDER BY enumsortorder;
SELECT 'repayment_status' as enum_name, enumlabel FROM pg_enum WHERE enumtypid = 'repayment_status'::regtype ORDER BY enumsortorder;
SELECT 'payout_status' as enum_name, enumlabel FROM pg_enum WHERE enumtypid = 'payout_status'::regtype ORDER BY enumsortorder;

-- ============================================================
-- 6. VERIFY COLUMNS EXIST
-- ============================================================
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name IN ('loan_products', 'payout_requests', 'notifications') 
AND column_name = 'updated_at'
ORDER BY table_name;

SELECT column_name, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'notifications' AND column_name = 'user_id';

-- ============================================================
-- 7. VERIFY TRIGGERS EXIST
-- ============================================================
SELECT trigger_name, event_object_table, action_statement
FROM information_schema.triggers
WHERE trigger_name LIKE 'update_%_updated_at'
ORDER BY event_object_table;