import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Table name mapping from Sheets names to Supabase table names
export type TableName =
  | 'Users' | 'Guarantors' | 'Agents' | 'Notifications' | 'Logs'
  | 'Customers' | 'Loans' | 'Repayments' | 'Collections' | 'Settlements'
  | 'ReviewOptions' | 'Capital' | 'PayoutRequests' | 'Branches' | 'StaffAccess'
  | 'Profiles' | 'Settings' | 'LoanProducts' | 'Deposits' | 'DepositRequests'
  | 'Leads' | 'MigrationLog' | 'AgentTrips' | 'AgentAttendance'
  | 'BranchStaffRoles' | 'GuarantorBranches'

const TABLE_MAP: Record<TableName, string> = {
  Users: 'users',
  Guarantors: 'guarantors',
  Agents: 'agents',
  Notifications: 'notifications',
  Logs: 'logs',
  Customers: 'customers',
  Loans: 'loans',
  Repayments: 'repayments',
  Collections: 'collections',
  Settlements: 'settlements',
  ReviewOptions: 'review_options',
  Capital: 'capital',
  PayoutRequests: 'payout_requests',
  Branches: 'branches',
  StaffAccess: 'staff_access',
  Profiles: 'profiles',
  Settings: 'settings',
  LoanProducts: 'loan_products',
  Deposits: 'deposits',
  DepositRequests: 'deposit_requests',
  Leads: 'leads',
  MigrationLog: 'migration_log',
  AgentTrips: 'agent_trips',
  AgentAttendance: 'agent_attendance',
  BranchStaffRoles: 'branch_staff_roles',
  GuarantorBranches: 'guarantor_branches',
}

// Column name mapping (Sheets PascalCase -> Supabase snake_case)
const COLUMN_MAP: Record<string, string> = {
  'User ID': 'user_id',
  'Username': 'username',
  'Password Hash': 'password_hash',
  'Salt': 'salt',
  'Role': 'role',
  'Status': 'status',
  'Name': 'name',
  'Email': 'email',
  'Guarantor Code': 'guarantor_code',
  'Created At': 'created_at',
  'Updated At': 'updated_at',
  'Guarantor ID': 'guarantor_id',
  'Code': 'code',
  'Phone': 'phone',
  'Address': 'address',
  'Commission Earned': 'commission_earned',
  'Agent ID': 'agent_id',
  'Agent Type': 'agent_type',
  'Notification ID': 'notification_id',
  'Title': 'title',
  'Message': 'message',
  'Entity Type': 'entity_type',
  'Entity ID': 'entity_id',
  'Is Read': 'is_read',
  'Log ID': 'log_id',
  'Action': 'action',
  'Metadata JSON': 'metadata_json',
  'Customer ID': 'customer_id',
  'Lead ID': 'lead_id',
  'House Name': 'house_name',
  'Place': 'place',
  'Landmark': 'landmark',
  'Occupation': 'occupation',
  'Account Number': 'account_number',
  'IFSC Code': 'ifsc_code',
  'PAN No': 'pan_no',
  'Active Loan ID': 'active_loan_id',
  'Loan ID': 'loan_id',
  'Loan Account No': 'loan_account_no',
  'Assigned Agent ID': 'assigned_agent_id',
  'Principal Amount': 'principal_amount',
  'Interest Deduction': 'interest_deduction',
  'Guarantor Commission': 'guarantor_commission',
  'Net Disbursed': 'net_disbursed',
  'Weekly Collection Amount': 'weekly_collection_amount',
  'Duration Weeks': 'duration_weeks',
  'Total Collection Amount': 'total_collection_amount',
  'Start Date': 'start_date',
  'End Date': 'end_date',
  'Repayment ID': 'repayment_id',
  'Due Date': 'due_date',
  'Week No': 'week_no',
  'Amount': 'amount',
  'Paid Date': 'paid_date',
  'NGF Agent ID': 'collection_agent_id',
  'Payment Mode': 'payment_mode',
  'Proof File ID': 'proof_file_id',
  'Notes': 'notes',
  'Collection ID': 'collection_id',
  'Payment Date': 'payment_date',
  'Settlement ID': 'settlement_id',
  'Entity Name': 'entity_name',
  'Settlement Date': 'settlement_date',
  'Saturday Date': 'saturday_date',
  'Total Cash Due': 'total_cash_due',
  'Total UPI Due': 'total_upi_due',
  'Amount Submitted': 'amount_submitted',
  'Balance': 'balance',
  'Recorded By': 'recorded_by',
  'Option ID': 'option_id',
  'Label': 'label',
  'Category': 'category',
  'Capital ID': 'capital_id',
  'Type': 'type',
  'Contributor': 'contributor',
  'Date': 'date',
  'Payout ID': 'payout_id',
  'Requested At': 'requested_at',
  'Processed At': 'processed_at',
  'Branch ID': 'branch_id',
  'Permissions': 'permissions',
  'Photo': 'photo',
  'Blood Group': 'blood_group',
  'Emergency Contact': 'emergency_contact',
  'Card Number': 'card_number',
  'Key': 'key',
  'Value': 'value',
  'Weekly Collection': 'weekly_collection',
  'Last Week Collection': 'last_week_collection',
  'Total Collection': 'total_collection',
  'Txn ID': 'txn_id',
  'Request ID': 'request_id',
  'Submitted Date': 'submitted_date',
  'Guarantor User ID': 'guarantor_user_id',
  'Customer Name': 'customer_name',
  'Aadhaar No': 'aadhaar_no',
  'Nominee Name': 'nominee_name',
  'Nominee Phone': 'nominee_phone',
  'Cheque Number': 'cheque_number',
  'Pinned Location': 'pinned_location',
  'Loan Product': 'loan_product',
  'Risk Level': 'risk_level',
  'Verification Status': 'verification_status',
  'Verification Notes': 'verification_notes',
  'Verification Submitted Date': 'verification_submitted_date',
  'Admin Final Decision': 'admin_final_decision',
  'Recommendation Status': 'recommendation_status',
  'Customer Photo URL': 'customer_photo_url',
  'Aadhaar Front URL': 'aadhaar_front_url',
  'Aadhaar Back URL': 'aadhaar_back_url',
  'Landmark Photo URL': 'landmark_photo_url',
  'House Photo URL': 'house_photo_url',
  'Cheque Photo URL': 'cheque_photo_url',
  'Document Folder ID': 'document_folder_id',
  'Latitude': 'latitude',
  'Longitude': 'longitude',
  'Location Accuracy': 'location_accuracy',
  'Location Updated At': 'location_updated_at',
  'Is Tracking': 'is_tracking',
  'Field': 'field',
  'Drive File ID': 'drive_file_id',
  'Supabase Path': 'supabase_path',
  'Error': 'error',
  'Trip ID': 'trip_id',
  'Start Latitude': 'start_latitude',
  'Start Longitude': 'start_longitude',
  'End Latitude': 'end_latitude',
  'End Longitude': 'end_longitude',
  'Distance Km': 'distance_km',
  'Trip Date': 'trip_date',
  'Week Start': 'week_start',
  // Branch Staff Roles
  'ID': 'id',
  'Role In Branch': 'role_in_branch',
  'Is Active': 'is_active',
  // Guarantor Branches
  'Guarantor Branch ID': 'guarantor_branch_id',
}

let _supabase: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (_supabase) return _supabase
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  if (!url || !key) {
    throw new Error('Missing Supabase env vars')
  }
  _supabase = createClient(url, key, { auth: { persistSession: false } })
  return _supabase
}

function toSnakeCase(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {}
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = COLUMN_MAP[key] || key.toLowerCase().replace(/\s+/g, '_')
    result[snakeKey] = value
  }
  return result
}

function toPascalCase(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {}
  const reverseMap: Record<string, string> = {}
  for (const [k, v] of Object.entries(COLUMN_MAP)) {
    reverseMap[v] = k
  }
  for (const [key, value] of Object.entries(obj)) {
    const pascalKey = reverseMap[key] || key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    result[pascalKey] = value
  }
  return result
}

// In-memory cache with 30s TTL (matches sheets.ts behavior)
const cache = new Map<string, { data: Record<string, string>[]; ts: number }>()
const CACHE_TTL = 30_000

function cacheKey(table: TableName) { return table }

export function invalidateCache(table: TableName) { cache.delete(cacheKey(table)) }

export async function readTable(table: TableName, options?: { forceFresh?: boolean }): Promise<Record<string, string>[]> {
  const key = cacheKey(table)
  const hit = cache.get(key)
  if (!options?.forceFresh && hit && Date.now() - hit.ts < CACHE_TTL) return hit.data

  const supabase = getSupabase()
  const dbTable = TABLE_MAP[table]

  const { data, error } = await supabase.from(dbTable).select('*')
  if (error) throw new Error(`Failed to read ${table}: ${error.message}`)

  const rows = (data || []).map(row => {
    // Convert snake_case keys back to PascalCase for compatibility
    const pascalRow = toPascalCase(row)
    return pascalRow
  })

  cache.set(key, { data: rows, ts: Date.now() })
  return rows
}

export async function appendRow(table: TableName, data: Record<string, string | null>): Promise<void> {
  const supabase = getSupabase()
  const dbTable = TABLE_MAP[table]

  // Convert PascalCase to snake_case
  const snakeData = toSnakeCase(data)

  // Remove __rowIndex if present
  delete snakeData.__row_index

  const { error } = await supabase.from(dbTable).insert(snakeData)
  if (error) throw new Error(`Failed to insert into ${table}: ${error.message}`)

  invalidateCache(table)
}

export async function updateRow(table: TableName, rowIndex: number, data: Record<string, string>): Promise<void> {
  const supabase = getSupabase()
  const dbTable = TABLE_MAP[table]

  // In Supabase, we need to find the row by primary key, not row index
  // Get the primary key column name for this table
  const pkColumn = getPrimaryKeyColumn(table)
  if (!pkColumn) throw new Error(`No primary key for ${table}`)

  // The rowIndex in Sheets is the row number; in Supabase we need the actual ID
  // This is a compatibility layer - we'll fetch all rows and find by index
  const rows = await readTable(table)
  const targetRow = rows[rowIndex - 2] // Adjust for header row (0-indexed)
  if (!targetRow) throw new Error(`Row ${rowIndex} not found in ${table}`)

  const pkValue = targetRow[getPascalPrimaryKey(table)]
  if (!pkValue) throw new Error(`Primary key not found for row ${rowIndex}`)

  const snakeData = toSnakeCase(data)
  delete snakeData.__row_index

  const { error } = await supabase
    .from(dbTable)
    .update(snakeData)
    .eq(getPrimaryKeyColumn(table), pkValue)

  if (error) throw new Error(`Failed to update ${table}: ${error.message}`)

  invalidateCache(table)
}

export async function deleteRow(table: TableName, rowIndex: number): Promise<void> {
  const supabase = getSupabase()
  const dbTable = TABLE_MAP[table]

  const rows = await readTable(table)
  const targetRow = rows[rowIndex - 2]
  if (!targetRow) throw new Error(`Row ${rowIndex} not found in ${table}`)

  const pkValue = targetRow[getPascalPrimaryKey(table)]
  if (!pkValue) throw new Error(`Primary key not found for row ${rowIndex}`)

  const { error } = await supabase
    .from(dbTable)
    .delete()
    .eq(getPrimaryKeyColumn(table), pkValue)

  if (error) throw new Error(`Failed to delete from ${table}: ${error.message}`)

  invalidateCache(table)
}

export async function updateById(table: TableName, pkValue: string, data: Record<string, string | null>): Promise<void> {
  const supabase = getSupabase()
  const dbTable = TABLE_MAP[table]
  const pkColumn = getPrimaryKeyColumn(table)

  const snakeData = toSnakeCase(data)
  delete snakeData.__row_index

  const { error } = await supabase
    .from(dbTable)
    .update(snakeData)
    .eq(pkColumn, pkValue)

  if (error) throw new Error(`Failed to update ${table}: ${error.message}`)

  invalidateCache(table)
}

export async function clearTable(table: TableName): Promise<void> {
  const supabase = getSupabase()
  const dbTable = TABLE_MAP[table]

  const { error } = await supabase.from(dbTable).delete().neq(getPrimaryKeyColumn(table), '')
  if (error) throw new Error(`Failed to clear ${table}: ${error.message}`)

  invalidateCache(table)
}

function getPrimaryKeyColumn(table: TableName): string {
  const pkMap: Record<TableName, string> = {
    Users: 'user_id',
    Guarantors: 'guarantor_id',
    Agents: 'agent_id',
    Notifications: 'notification_id',
    Logs: 'log_id',
    Customers: 'customer_id',
    Loans: 'loan_id',
    Repayments: 'repayment_id',
    Collections: 'collection_id',
    Settlements: 'settlement_id',
    ReviewOptions: 'option_id',
    Capital: 'capital_id',
    PayoutRequests: 'payout_id',
    Branches: 'branch_id',
    StaffAccess: 'user_id', // composite with branch_id
    Profiles: 'user_id',
    Settings: 'key',
    LoanProducts: 'key',
    Deposits: 'txn_id',
    DepositRequests: 'request_id',
    Leads: 'lead_id',
    MigrationLog: 'log_id',
    AgentTrips: 'trip_id',
    AgentAttendance: 'attendance_id',
    BranchStaffRoles: 'id',
    GuarantorBranches: 'id',
  }
  return pkMap[table]
}

function getPascalPrimaryKey(table: TableName): string {
  const pkMap: Record<TableName, string> = {
    Users: 'User ID',
    Guarantors: 'Guarantor ID',
    Agents: 'Agent ID',
    Notifications: 'Notification ID',
    Logs: 'Log ID',
    Customers: 'Customer ID',
    Loans: 'Loan ID',
    Repayments: 'Repayment ID',
    Collections: 'Collection ID',
    Settlements: 'Settlement ID',
    ReviewOptions: 'Option ID',
    Capital: 'Capital ID',
    PayoutRequests: 'Payout ID',
    Branches: 'Branch ID',
    StaffAccess: 'User ID',
    Profiles: 'User ID',
    Settings: 'Key',
    LoanProducts: 'Key',
    Deposits: 'Txn ID',
    DepositRequests: 'Request ID',
    Leads: 'Lead ID',
    MigrationLog: 'Log ID',
    AgentTrips: 'Trip ID',
    AgentAttendance: 'Attendance ID',
    BranchStaffRoles: 'ID',
    GuarantorBranches: 'ID',
  }
  return pkMap[table]
}

export function findRecord(rows: Record<string, string>[], field: string, value: string) {
  return rows.find(r => r[field] === value) || null
}

export function makeId(prefix: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let id = ''
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)]
  return `${prefix}${id}`
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function formatDateYmd(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() + days)
  return d
}

export function getNextSaturday(from: Date = new Date()): Date {
  const istOffset = 5.5 * 60 * 60 * 1000
  const d = new Date(from.getTime() + istOffset)
  const day = d.getUTCDay()
  const diff = day === 6 ? 0 : (6 - day)
  d.setUTCDate(d.getUTCDate() + diff)
  return new Date(d.toISOString().slice(0, 10))
}

export function paginate<T>(rows: T[], page: number, pageSize: number) {
  const total = rows.length
  const start = (page - 1) * pageSize
  return {
    rows: rows.slice(start, start + pageSize),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  }
}

// Additional Supabase-specific helpers
export async function queryTable<T = any>(
  table: TableName,
  queryBuilder: (qb: any) => any
): Promise<T[]> {
  const supabase = getSupabase()
  const dbTable = TABLE_MAP[table]

  const { data, error } = await queryBuilder(supabase.from(dbTable).select('*'))
  if (error) throw new Error(`Query failed on ${table}: ${error.message}`)

  return (data || []).map((row: any) => toPascalCase(row))
}

export async function getRowById(table: TableName, id: string): Promise<Record<string, string> | null> {
  const pkColumn = getPrimaryKeyColumn(table)
  const rows = await queryTable(table, qb => qb.eq(pkColumn, id).limit(1))
  return rows[0] || null
}

export async function getRowsByField(table: TableName, field: string, value: string): Promise<Record<string, string>[]> {
  const snakeField = COLUMN_MAP[field] || field.toLowerCase().replace(/\s+/g, '_')
  return queryTable(table, qb => qb.eq(snakeField, value))
}

export async function deleteById(table: TableName, id: string): Promise<void> {
  const supabase = getSupabase()
  const dbTable = TABLE_MAP[table]
  const pkColumn = getPrimaryKeyColumn(table)

  const { error } = await supabase
    .from(dbTable)
    .delete()
    .eq(pkColumn, id)

  if (error) throw new Error(`Failed to delete from ${table}: ${error.message}`)

  invalidateCache(table)
}