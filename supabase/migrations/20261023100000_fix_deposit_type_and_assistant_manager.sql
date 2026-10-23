-- Found by the 2026-10-23 full regression test. NOT APPLIED: the owner must run this on Supabase.
-- 1) Deposits: the app writes 'Deposit', 'Interest Payout', 'Principal Withdrawal' but the live enum only has Commission/Capital/Refund/Other.
alter type deposit_type add value if not exists 'Deposit';
alter type deposit_type add value if not exists 'Interest Payout';
alter type deposit_type add value if not exists 'Principal Withdrawal';
-- 2) Assistant Branch Manager: the live check constraint rejects 'assistant_manager'.
alter table branch_staff_roles drop constraint if exists branch_staff_roles_role_in_branch_check;
alter table branch_staff_roles add constraint branch_staff_roles_role_in_branch_check
  check (role_in_branch = any (array['manager','assistant_manager','accountant','cashier','collection_agent']));
