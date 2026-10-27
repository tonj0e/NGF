-- A second contact number on a lead (husband, wife, nominee ...) with who it belongs to. Additive and optional.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS alt_phone TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS alt_phone_label TEXT;
NOTIFY pgrst, 'reload schema';
