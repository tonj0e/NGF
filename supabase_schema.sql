-- Supabase PostgreSQL Schema for NGF CRM
-- Generated from Google Sheets structure
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE user_role AS ENUM ('Admin', 'Guarantor', 'Collection Agent', 'Staff');
CREATE TYPE user_status AS ENUM ('Active', 'Inactive', 'Suspended');
CREATE TYPE lead_status AS ENUM ('Pending', 'Under Review', 'Agent Assigned', 'Verification In Progress', 'Verification Submitted', 'Approved', 'Rejected', 'Converted');
CREATE TYPE verification_result AS ENUM ('Verified', 'Suspicious', 'Rejected Recommendation');
CREATE TYPE loan_status AS ENUM ('Active', 'Completed', 'Defaulted', 'Settled');
CREATE TYPE repayment_status AS ENUM ('Pending', 'Paid', 'Overdue', 'Delayed', 'Waived');
CREATE TYPE payment_mode AS ENUM ('Cash', 'UPI', 'Bank', 'Cheque', 'Other');
CREATE TYPE settlement_status AS ENUM ('Pending', 'Completed', 'Partial');
CREATE TYPE review_category AS ENUM ('Document', 'Field', 'Financial', 'Other');
CREATE TYPE capital_type AS ENUM ('Investment', 'Withdrawal', 'Profit', 'Loss');
CREATE TYPE payout_status AS ENUM ('Pending', 'Approved', 'Rejected', 'Paid');
CREATE TYPE branch_status AS ENUM ('Active', 'Inactive');
CREATE TYPE deposit_type AS ENUM ('Commission', 'Capital', 'Refund', 'Other');
CREATE TYPE deposit_request_status AS ENUM ('Pending', 'Approved', 'Rejected');
CREATE TYPE agent_type AS ENUM ('Field', 'Tele', 'Both');

-- ============================================================
-- CORE TABLES
-- ============================================================

-- Users table
CREATE TABLE users (
    user_id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    role user_role NOT NULL,
    status user_status NOT NULL DEFAULT 'Active',
    name TEXT NOT NULL,
    email TEXT,
    guarantor_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_guarantor_code ON users(guarantor_code);
CREATE INDEX idx_users_role ON users(role);

-- Guarantors table
CREATE TABLE guarantors (
    guarantor_id TEXT PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    phone TEXT,
    address TEXT,
    commission_earned DECIMAL(12,2) DEFAULT 0,
    status user_status NOT NULL DEFAULT 'Active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_guarantors_user_id ON guarantors(user_id);
CREATE INDEX idx_guarantors_code ON guarantors(code);

-- Agents table
CREATE TABLE agents (
    agent_id TEXT PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    agent_type agent_type,
    status user_status NOT NULL DEFAULT 'Active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agents_user_id ON agents(user_id);

-- Profiles table
CREATE TABLE profiles (
    user_id TEXT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    photo TEXT, -- Drive URL or Supabase proxy URL
    blood_group TEXT,
    emergency_contact TEXT,
    place TEXT,
    card_number TEXT UNIQUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Settings table (key-value)
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- LEAD & CUSTOMER TABLES
-- ============================================================

-- Leads table (in separate spreadsheet)
CREATE TABLE leads (
    lead_id TEXT PRIMARY KEY,
    submitted_date DATE NOT NULL,
    guarantor_id TEXT NOT NULL REFERENCES guarantors(guarantor_id),
    guarantor_user_id TEXT NOT NULL REFERENCES users(user_id),
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    aadhaar_no TEXT,
    address TEXT,
    house_name TEXT,
    place TEXT,
    landmark TEXT,
    nominee_name TEXT,
    nominee_phone TEXT,
    occupation TEXT,
    pan_no TEXT,
    cheque_number TEXT,
    pinned_location TEXT,
    loan_product TEXT NOT NULL,
    risk_level TEXT,
    status lead_status NOT NULL DEFAULT 'Pending',
    assigned_agent_id TEXT REFERENCES agents(agent_id),
    verification_status verification_result,
    verification_notes TEXT,
    verification_submitted_date DATE,
    admin_final_decision TEXT,
    recommendation_status TEXT,
    customer_photo_url TEXT,
    aadhaar_front_url TEXT,
    aadhaar_back_url TEXT,
    landmark_photo_url TEXT,
    house_photo_url TEXT,
    cheque_photo_url TEXT,
    document_folder_id TEXT, -- Google Drive folder ID
    notes TEXT,
    account_number TEXT,
    ifsc_code TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_leads_guarantor_id ON leads(guarantor_id);
CREATE INDEX idx_leads_assigned_agent_id ON leads(assigned_agent_id);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_aadhaar_no ON leads(aadhaar_no);
CREATE INDEX idx_leads_submitted_date ON leads(submitted_date);

-- Customers table
CREATE TABLE customers (
    customer_id TEXT PRIMARY KEY,
    lead_id TEXT UNIQUE NOT NULL REFERENCES leads(lead_id),
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT,
    house_name TEXT,
    place TEXT,
    landmark TEXT,
    occupation TEXT,
    account_number TEXT,
    ifsc_code TEXT,
    pan_no TEXT,
    guarantor_id TEXT NOT NULL REFERENCES guarantors(guarantor_id),
    active_loan_id TEXT, -- Will reference loans after creation
    status user_status NOT NULL DEFAULT 'Active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customers_guarantor_id ON customers(guarantor_id);
CREATE INDEX idx_customers_lead_id ON customers(lead_id);
CREATE INDEX idx_customers_active_loan_id ON customers(active_loan_id);

-- ============================================================
-- LOAN & REPAYMENT TABLES
-- ============================================================

-- Loans table
CREATE TABLE loans (
    loan_id TEXT PRIMARY KEY,
    customer_id TEXT UNIQUE NOT NULL REFERENCES customers(customer_id),
    lead_id TEXT NOT NULL REFERENCES leads(lead_id),
    guarantor_id TEXT NOT NULL REFERENCES guarantors(guarantor_id),
    assigned_agent_id TEXT REFERENCES agents(agent_id),
    principal_amount DECIMAL(12,2) NOT NULL,
    interest_deduction DECIMAL(12,2) NOT NULL,
    guarantor_commission DECIMAL(12,2) NOT NULL,
    net_disbursed DECIMAL(12,2) NOT NULL,
    weekly_collection_amount DECIMAL(12,2) NOT NULL,
    duration_weeks INTEGER NOT NULL,
    total_collection_amount DECIMAL(12,2) NOT NULL,
    status loan_status NOT NULL DEFAULT 'Active',
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_loans_customer_id ON loans(customer_id);
CREATE INDEX idx_loans_guarantor_id ON loans(guarantor_id);
CREATE INDEX idx_loans_assigned_agent_id ON loans(assigned_agent_id);
CREATE INDEX idx_loans_status ON loans(status);

-- Repayments table
CREATE TABLE repayments (
    repayment_id TEXT PRIMARY KEY,
    loan_id TEXT NOT NULL REFERENCES loans(loan_id) ON DELETE CASCADE,
    customer_id TEXT NOT NULL REFERENCES customers(customer_id),
    due_date DATE NOT NULL,
    week_no INTEGER NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    status repayment_status NOT NULL DEFAULT 'Pending',
    paid_date DATE,
    collection_agent_id TEXT REFERENCES users(user_id),
    payment_mode payment_mode,
    proof_file_id TEXT, -- Drive file ID or Supabase proxy path
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(loan_id, week_no)
);

CREATE INDEX idx_repayments_loan_id ON repayments(loan_id);
CREATE INDEX idx_repayments_customer_id ON repayments(customer_id);
CREATE INDEX idx_repayments_status ON repayments(status);
CREATE INDEX idx_repayments_due_date ON repayments(due_date);
CREATE INDEX idx_repayments_collection_agent_id ON repayments(collection_agent_id);

-- Collections table
CREATE TABLE collections (
    collection_id TEXT PRIMARY KEY,
    repayment_id TEXT NOT NULL REFERENCES repayments(repayment_id) ON DELETE CASCADE,
    loan_id TEXT NOT NULL REFERENCES loans(loan_id),
    customer_id TEXT NOT NULL REFERENCES customers(customer_id),
    agent_id TEXT NOT NULL REFERENCES users(user_id),
    amount DECIMAL(12,2) NOT NULL,
    payment_date DATE NOT NULL,
    proof_file_id TEXT,
    payment_mode payment_mode,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_collections_repayment_id ON collections(repayment_id);
CREATE INDEX idx_collections_loan_id ON collections(loan_id);
CREATE INDEX idx_collections_agent_id ON collections(agent_id);
CREATE INDEX idx_collections_payment_date ON collections(payment_date);

-- ============================================================
-- SETTLEMENTS & FINANCIAL
-- ============================================================

-- Settlements table
CREATE TABLE settlements (
    settlement_id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL, -- 'Guarantor', 'Agent', 'Branch'
    entity_id TEXT NOT NULL,
    entity_name TEXT NOT NULL,
    settlement_date DATE NOT NULL,
    saturday_date DATE NOT NULL,
    total_cash_due DECIMAL(12,2) DEFAULT 0,
    total_upi_due DECIMAL(12,2) DEFAULT 0,
    amount_submitted DECIMAL(12,2) DEFAULT 0,
    balance DECIMAL(12,2) DEFAULT 0,
    status settlement_status NOT NULL DEFAULT 'Pending',
    notes TEXT,
    recorded_by TEXT NOT NULL REFERENCES users(user_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_settlements_entity ON settlements(entity_type, entity_id);
CREATE INDEX idx_settlements_saturday_date ON settlements(saturday_date);
CREATE INDEX idx_settlements_recorded_by ON settlements(recorded_by);

-- ReviewOptions table
CREATE TABLE review_options (
    option_id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    category review_category NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Capital table
CREATE TABLE capital (
    capital_id TEXT PRIMARY KEY,
    type capital_type NOT NULL,
    contributor TEXT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    date DATE NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_capital_contributor ON capital(contributor);
CREATE INDEX idx_capital_date ON capital(date);

-- PayoutRequests table
CREATE TABLE payout_requests (
    payout_id TEXT PRIMARY KEY,
    guarantor_id TEXT NOT NULL REFERENCES guarantors(guarantor_id),
    amount DECIMAL(12,2) NOT NULL,
    status payout_status NOT NULL DEFAULT 'Pending',
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    notes TEXT
);

CREATE INDEX idx_payout_requests_guarantor_id ON payout_requests(guarantor_id);
CREATE INDEX idx_payout_requests_status ON payout_requests(status);

-- ============================================================
-- BRANCH & STAFF
-- ============================================================

-- Branches table
CREATE TABLE branches (
    branch_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    status branch_status NOT NULL DEFAULT 'Active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- StaffAccess table
CREATE TABLE staff_access (
    user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    branch_id TEXT NOT NULL REFERENCES branches(branch_id) ON DELETE CASCADE,
    permissions TEXT[] NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, branch_id)
);

CREATE INDEX idx_staff_access_branch_id ON staff_access(branch_id);

-- ============================================================
-- LOAN PRODUCTS & DEPOSITS
-- ============================================================

-- LoanProducts table
CREATE TABLE loan_products (
    key TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    principal DECIMAL(12,2) NOT NULL,
    duration_weeks INTEGER NOT NULL,
    weekly_collection DECIMAL(12,2) NOT NULL,
    last_week_collection DECIMAL(12,2),
    total_collection DECIMAL(12,2) NOT NULL,
    interest_deduction DECIMAL(12,2) NOT NULL,
    guarantor_commission DECIMAL(12,2) NOT NULL,
    net_disbursed DECIMAL(12,2) NOT NULL,
    status user_status NOT NULL DEFAULT 'Active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Deposits table
CREATE TABLE deposits (
    txn_id TEXT PRIMARY KEY,
    guarantor_id TEXT NOT NULL REFERENCES guarantors(guarantor_id),
    type deposit_type NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    date DATE NOT NULL,
    notes TEXT,
    recorded_by TEXT NOT NULL REFERENCES users(user_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_deposits_guarantor_id ON deposits(guarantor_id);
CREATE INDEX idx_deposits_date ON deposits(date);

-- DepositRequests table
CREATE TABLE deposit_requests (
    request_id TEXT PRIMARY KEY,
    guarantor_id TEXT NOT NULL REFERENCES guarantors(guarantor_id),
    type deposit_type NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    status deposit_request_status NOT NULL DEFAULT 'Pending',
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    notes TEXT
);

CREATE INDEX idx_deposit_requests_guarantor_id ON deposit_requests(guarantor_id);
CREATE INDEX idx_deposit_requests_status ON deposit_requests(status);

-- ============================================================
-- NOTIFICATIONS & LOGS
-- ============================================================

-- Notifications table
CREATE TABLE notifications (
    notification_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    role user_role NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);

-- Logs table
CREATE TABLE logs (
    log_id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(user_id),
    username TEXT,
    role user_role,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    metadata_json JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_logs_user_id ON logs(user_id);
CREATE INDEX idx_logs_entity ON logs(entity_type, entity_id);
CREATE INDEX idx_logs_created_at ON logs(created_at DESC);

-- ============================================================
-- MIGRATION LOG (for image migration tracking)
-- ============================================================

CREATE TABLE migration_log (
    log_id TEXT PRIMARY KEY,
    lead_id TEXT,
    field TEXT,
    status TEXT NOT NULL, -- 'success', 'failed', 'skipped'
    drive_file_id TEXT,
    supabase_path TEXT,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_migration_log_lead_id ON migration_log(lead_id);
CREATE INDEX idx_migration_log_status ON migration_log(status);

-- ============================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE guarantors ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE repayments ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE capital ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE deposit_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_log ENABLE ROW LEVEL SECURITY;

-- Service role has full access (for server-side operations)
-- These policies allow the service role key to bypass RLS
-- Client-side access should use more restrictive policies

-- For now, service role can do everything (adjust as needed for production)
CREATE POLICY "Service role full access" ON users FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON guarantors FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON agents FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON profiles FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON settings FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON leads FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON customers FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON loans FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON repayments FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON collections FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON settlements FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON review_options FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON capital FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON payout_requests FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON branches FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON staff_access FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON loan_products FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON deposits FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON deposit_requests FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON notifications FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON logs FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON migration_log FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

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
-- AGENT LOCATION TRACKING (Added 2026-08-11)
-- ============================================================
ALTER TABLE agents ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8);
ALTER TABLE agents ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8);
ALTER TABLE agents ADD COLUMN IF NOT EXISTS location_accuracy DECIMAL(10, 2);
ALTER TABLE agents ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS is_tracking BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_agents_location_updated ON agents(location_updated_at DESC);

-- ============================================================
-- AGENT TRIPS (Travel Distance Tracking)
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_trips (
    trip_id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
    lead_id TEXT REFERENCES leads(lead_id),
    start_latitude DECIMAL(10, 8) NOT NULL,
    start_longitude DECIMAL(11, 8) NOT NULL,
    end_latitude DECIMAL(10, 8) NOT NULL,
    end_longitude DECIMAL(11, 8) NOT NULL,
    distance_km DECIMAL(10, 2) NOT NULL,
    trip_date DATE NOT NULL,
    week_start DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_trips_agent_id ON agent_trips(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_trips_trip_date ON agent_trips(trip_date);
CREATE INDEX IF NOT EXISTS idx_agent_trips_week_start ON agent_trips(week_start);
CREATE INDEX IF NOT EXISTS idx_agent_trips_lead_id ON agent_trips(lead_id);

-- ============================================================
-- AGENT ATTENDANCE
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_attendance (
    attendance_id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
    date DATE NOT NULL,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    accuracy DECIMAL(10, 2),
    status TEXT NOT NULL DEFAULT 'Present',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(agent_id, date)
);

CREATE INDEX IF NOT EXISTS idx_agent_attendance_agent_id ON agent_attendance(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_attendance_date ON agent_attendance(date);