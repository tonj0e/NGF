import { NextRequest } from 'next/server'
import { apiHandler, requireRole, ok, err } from '@/lib/api'
import { readTable as readFromSheets } from '@/lib/sheets'
import { getSupabase } from '@/lib/supabase-db'

const TABLES_IN_ORDER = [
  'Users',
  'Guarantors',
  'Agents',
  'Profiles',
  'Settings',
  'Branches',
  'LoanProducts',
  'ReviewOptions',
  'Leads',
  'Customers',
  'Loans',
  'Repayments',
  'Collections',
  'Settlements',
  'Notifications',
  'Logs',
  'Capital',
  'PayoutRequests',
  'StaffAccess',
  'Deposits',
  'DepositRequests',
  'MigrationLog',
] as const

type TableName = typeof TABLES_IN_ORDER[number]

const EMPTY_STRING_FIELDS = new Set([
  'password_hash',
  'salt',
  'guarantor_code',
  'email',
  'phone',
  'address',
  'aadhaar_no',
  'house_name',
  'place',
  'landmark',
  'nominee_name',
  'nominee_phone',
  'occupation',
  'pan_no',
  'cheque_number',
  'pinned_location',
  'risk_level',
  'verification_status',
  'verification_notes',
  'verification_submitted_date',
  'admin_final_decision',
  'recommendation_status',
  'customer_photo_url',
  'aadhaar_front_url',
  'aadhaar_back_url',
  'landmark_photo_url',
  'house_photo_url',
  'cheque_photo_url',
  'document_folder_id',
  'notes',
  'account_number',
  'ifsc_code',
  'assigned_agent_id',
  'active_loan_id',
  'payment_mode',
  'proof_file_id',
  'blood_group',
  'emergency_contact',
  'card_number',
  'entity_name',
  'last_week_collection',
  'recorded_by',
  'contributor',
  'processed_at',
  'permissions',
  'drive_file_id',
  'supabase_path',
  'error',
])

function cleanRow(row: Record<string, string>) {
  const cleaned: Record<string, any> = {}
  for (const [key, value] of Object.entries(row)) {
    if (key === '__rowIndex') continue
    if (value === '' && EMPTY_STRING_FIELDS.has(key.toLowerCase().replace(/\s+/g, '_'))) {
      cleaned[key] = null
    } else if (value === '') {
      cleaned[key] = ''
    } else {
      // Try to parse numbers
      if (/^-?\d+(\.\d+)?$/.test(value)) {
        cleaned[key] = value.includes('.') ? parseFloat(value) : parseInt(value, 10)
      } else if (value === 'true' || value === 'false') {
        cleaned[key] = value === 'true'
      } else {
        cleaned[key] = value
      }
    }
  }
  return cleaned
}

async function migrateTable(table: TableName, dryRun = false): Promise<{ success: number; errors: string[] }> {
  const supabase = getSupabase()
  const dbTable = table.toLowerCase().replace(/[A-Z]/g, '_$&').toLowerCase() // simple conversion

  // Map table names properly
  const tableMap: Record<TableName, string> = {
    Users: 'users',
    Guarantors: 'guarantors',
    Agents: 'agents',
    Profiles: 'profiles',
    Settings: 'settings',
    Branches: 'branches',
    LoanProducts: 'loan_products',
    ReviewOptions: 'review_options',
    Leads: 'leads',
    Customers: 'customers',
    Loans: 'loans',
    Repayments: 'repayments',
    Collections: 'collections',
    Settlements: 'settlements',
    Notifications: 'notifications',
    Logs: 'logs',
    Capital: 'capital',
    PayoutRequests: 'payout_requests',
    StaffAccess: 'staff_access',
    Deposits: 'deposits',
    DepositRequests: 'deposit_requests',
    MigrationLog: 'migration_log',
  }

  const targetTable = tableMap[table]
  console.log(`Migrating ${table} -> ${targetTable}...`)

  const rows = await readFromSheets(table)
  let success = 0
  const errors: string[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const cleaned = cleanRow(row)

    if (dryRun) {
      success++
      continue
    }

    try {
      const { error } = await supabase.from(targetTable).upsert(cleaned, { onConflict: getPrimaryKey(table) })
      if (error) {
        errors.push(`Row ${i + 1}: ${error.message}`)
      } else {
        success++
      }
    } catch (e: any) {
      errors.push(`Row ${i + 1}: ${e?.message || String(e)}`)
    }
  }

  return { success, errors }
}

function getPrimaryKey(table: TableName): string {
  const pkMap: Record<TableName, string> = {
    Users: 'user_id',
    Guarantors: 'guarantor_id',
    Agents: 'agent_id',
    Profiles: 'user_id',
    Settings: 'key',
    Branches: 'branch_id',
    LoanProducts: 'key',
    ReviewOptions: 'option_id',
    Leads: 'lead_id',
    Customers: 'customer_id',
    Loans: 'loan_id',
    Repayments: 'repayment_id',
    Collections: 'collection_id',
    Settlements: 'settlement_id',
    Notifications: 'notification_id',
    Logs: 'log_id',
    Capital: 'capital_id',
    PayoutRequests: 'payout_id',
    StaffAccess: 'user_id,branch_id',
    Deposits: 'txn_id',
    DepositRequests: 'request_id',
    MigrationLog: 'log_id',
  }
  return pkMap[table]
}

export const GET = apiHandler(async (req: NextRequest) => {
  // Temporarily allow unauthenticated for initial migration
  // await requireRole(req, ['Admin'])
  const { searchParams } = new URL(req.url)
  const dryRun = searchParams.get('dryRun') === 'true'
  const specificTable = searchParams.get('table') as TableName | null

  const tablesToMigrate = specificTable ? [specificTable] : TABLES_IN_ORDER

  const results: Record<string, { success: number; errors: string[] }> = {}
  let totalSuccess = 0
  let totalErrors = 0

  for (const table of tablesToMigrate) {
    const result = await migrateTable(table, dryRun)
    results[table] = result
    totalSuccess += result.success
    totalErrors += result.errors.length

    console.log(`${table}: ${result.success} success, ${result.errors.length} errors`)
  }

  return ok({
    dryRun,
    tables: results,
    totalSuccess,
    totalErrors,
    message: dryRun ? 'Dry run complete - no data written' : 'Migration complete'
  })
})

export const POST = apiHandler(async (req: NextRequest) => {
  await requireRole(req, ['Admin'])
  const body = await req.json()

  if (body.action === 'clear') {
    const supabase = getSupabase()
    const results: Record<string, any> = {}

    // Clear in reverse order to respect foreign keys
    for (const table of [...TABLES_IN_ORDER].reverse()) {
      const targetTable = {
        Users: 'users',
        Guarantors: 'guarantors',
        Agents: 'agents',
        Profiles: 'profiles',
        Settings: 'settings',
        Branches: 'branches',
        LoanProducts: 'loan_products',
        ReviewOptions: 'review_options',
        Leads: 'leads',
        Customers: 'customers',
        Loans: 'loans',
        Repayments: 'repayments',
        Collections: 'collections',
        Settlements: 'settlements',
        Notifications: 'notifications',
        Logs: 'logs',
        Capital: 'capital',
        PayoutRequests: 'payout_requests',
        StaffAccess: 'staff_access',
        Deposits: 'deposits',
        DepositRequests: 'deposit_requests',
        MigrationLog: 'migration_log',
      }[table]

      const pk = getPrimaryKey(table as TableName)
      const { error, count } = await supabase.from(targetTable).delete().neq(pk.split(',')[0], '')
      results[table] = { success: !error, count, error: error?.message }
    }

    return ok({ message: 'All tables cleared', results })
  }

  return err('Invalid action')
})