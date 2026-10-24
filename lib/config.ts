export const APP_CONFIG = {
  APP_NAME: 'NGF FINCORP Finance Operations Platform',
  COMPANY_PREFIX: 'NGF',
  SPREADSHEET_ID: '1cENpumuwL0tp0xwz1c9zVwKQmHHyweFsn5ZXm8PME6o',
  LEADS_SPREADSHEET_ID: '1ck04r3rt_IeO0jJfRFbC-4s33tSHUe7J1xTzj5jAR68',
  PHOTO_ROOT_FOLDER_ID: '1vZ9Xv_40zu2N5FRCvomF2kvxb-Y6VwaJ',
  SESSION_TTL_SECONDS: 21600,
  LOAN_PRODUCTS: [
    { key: '10K10W', label: '10K10W', principal: 10000, durationWeeks: 10, weeklyCollection: 1000, totalCollection: 10000, interestDeduction: 1500, guarantorCommission: 500, netDisbursed: 8500 },
  ],
  LEAD_STATUSES: ['Pending', 'Under Review', 'Agent Assigned', 'Verification In Progress', 'Verification Submitted', 'Approved', 'Rejected', 'Converted'],
  VERIFICATION_RESULTS: ['', 'Submitted', 'Verified', 'Suspicious', 'Rejected Recommendation'],
  ROLES: ['Admin', 'Guarantor', 'NGF AGENT', 'Staff'],
  // Features a branch Staff account can be granted (configured in Dev → Branches).
  // `view` maps to the AppShell page key.
  STAFF_FEATURES: [
    { key: 'customers',   label: 'Customers',             view: 'customers' },
    { key: 'leads',       label: 'Leads & Disbursements', view: 'leads' },
    { key: 'collection',  label: 'Collection',            view: 'collection' },
    { key: 'settlements', label: 'Settlements',           view: 'settlements' },
    { key: 'guarantors',  label: 'Guarantors',            view: 'guarantors' },
    { key: 'reports',     label: 'Reports',               view: 'reports' },
    { key: 'agentTracking', label: 'Agent Tracking',      view: 'agentTracking' },
    { key: 'verificationPlanning', label: 'Verification Routes (call customers, plan agent visits)', view: 'routes' },
    // One Payments module (menu item added in AppShell when any of these is ticked)
    { key: 'payChat', label: 'Payments: chat (see guarantor screenshots, reply, confirm)', view: '' },
    { key: 'payHistory', label: 'Payments: payment history', view: '' },
    { key: 'payMark', label: 'Payments: mark by UTR manually', view: '' },
    { key: 'payBank', label: 'Payments: bank statement check', view: '' },
    { key: 'payOverride', label: 'Payments: override duplicate UTR', view: '' },
    { key: 'paymentLinks', label: 'Payment Links (send links and QR, close loans by payment)', view: 'payLinks' },
  ] as { key: string; label: string; view: string }[],
  // What a Guarantor can see, switched on or off in NGF Branches → edit guarantor. `gp:` keys are the pages in the
  // guarantor's own menu (all on until an Admin saves a custom list, which adds the `pages:custom` marker).
  // `payChat` lets them send payment screenshots, `payHistory` shows their recorded payments. Notifications is always on. Bank-statement
  // access and the duplicate-UTR override are never offered to guarantors.
  GUARANTOR_FEATURES: [
    { key: 'gp:dashboard',   label: 'Dashboard',          view: 'dashboard' },
    { key: 'gp:leads',       label: 'Leads',              view: 'leads' },
    { key: 'gp:collection',  label: 'Collection',         view: 'collection' },
    { key: 'payHistory',     label: 'Payments: payment history', view: '' },
    { key: 'payChat',        label: 'Payments: send payment screenshots in the chat', view: '' },
    { key: 'gp:payLinks',    label: 'Send Payment Link',  view: 'payLinks' },
    { key: 'gp:commissions', label: 'Commissions',        view: 'commissions' },
    { key: 'gp:deposits',    label: 'Deposits',           view: 'deposits' },
    { key: 'gp:myCustomers', label: 'My Customers',       view: 'myCustomers' },
    { key: 'gp:myIdCard',    label: 'My ID Card',         view: 'myIdCard' },
  ] as { key: string; label: string; view: string }[],
  // Branch roles with suggested permissions (editable suggestions, not auto-granted)
  BRANCH_ROLES: [
    { key: 'manager', label: 'Manager', description: 'Branch oversight', suggestedPermissions: ['customers', 'leads', 'collection', 'settlements', 'reports', 'guarantors', 'agentTracking', 'verificationPlanning'] },
    { key: 'assistant_manager', label: 'Assistant Branch Manager', description: 'Supports the branch manager', suggestedPermissions: ['customers', 'leads', 'collection', 'reports', 'guarantors', 'agentTracking', 'verificationPlanning'] },
    { key: 'accountant', label: 'Accountant', description: 'Financial records', suggestedPermissions: ['customers', 'reports', 'settlements', 'agentTracking', 'verificationPlanning'] },
    { key: 'cashier', label: 'Cashier', description: 'Cash and receipts', suggestedPermissions: ['collection', 'settlements'] },
    { key: 'collection_agent', label: 'Collection Agent', description: 'Assigned collections', suggestedPermissions: ['collection'] },
  ] as { key: string; label: string; description: string; suggestedPermissions: string[] }[],
}

export const SHEETS = {
  Users: ['User ID', 'Username', 'Password Hash', 'Salt', 'Role', 'Status', 'Name', 'Email', 'Guarantor Code', 'Created At', 'Updated At'],
  Guarantors: ['Guarantor ID', 'User ID', 'Name', 'Code', 'Phone', 'Address', 'Commission Earned', 'Status', 'Created At', 'Updated At'],
  Agents: ['Agent ID', 'User ID', 'Name', 'Phone', 'Agent Type', 'Status', 'Created At', 'Updated At', 'Latitude', 'Longitude', 'Location Accuracy', 'Location Updated At', 'Is Tracking'],
  Notifications: ['Notification ID', 'User ID', 'Role', 'Title', 'Message', 'Entity Type', 'Entity ID', 'Is Read', 'Created At'],
  Logs: ['Log ID', 'User ID', 'Username', 'Role', 'Action', 'Entity Type', 'Entity ID', 'Metadata JSON', 'Created At'],
  Customers: ['Customer ID', 'Lead ID', 'Name', 'Phone', 'Address', 'House Name', 'Place', 'Landmark', 'Occupation', 'Account Number', 'IFSC Code', 'PAN No', 'Guarantor ID', 'Active Loan ID', 'Status', 'Created At', 'Updated At'],
  Loans: ['Loan ID', 'Loan Account No', 'Customer ID', 'Lead ID', 'Guarantor ID', 'Assigned Agent ID', 'Principal Amount', 'Interest Deduction', 'Guarantor Commission', 'Net Disbursed', 'Weekly Collection Amount', 'Duration Weeks', 'Total Collection Amount', 'Status', 'Start Date', 'End Date', 'Created At', 'Updated At'],
  Repayments: ['Repayment ID', 'Loan ID', 'Customer ID', 'Due Date', 'Week No', 'Amount', 'Status', 'Paid Date', 'NGF Agent ID', 'Payment Mode', 'Proof File ID', 'Notes', 'Created At', 'Updated At'],
  Collections: ['Collection ID', 'Repayment ID', 'Loan ID', 'Customer ID', 'Agent ID', 'Amount', 'Payment Date', 'Proof File ID', 'Payment Mode', 'Notes', 'Created At'],
  Settlements: ['Settlement ID', 'Entity Type', 'Entity ID', 'Entity Name', 'Settlement Date', 'Saturday Date', 'Total Cash Due', 'Total UPI Due', 'Amount Submitted', 'Balance', 'Status', 'Notes', 'Recorded By', 'Created At'],
  ReviewOptions: ['Option ID', 'Label', 'Category', 'Created At'],
  Capital: ['Capital ID', 'Type', 'Contributor', 'Amount', 'Date', 'Notes', 'Created At'],
  PayoutRequests: ['Payout ID', 'Guarantor ID', 'Amount', 'Status', 'Requested At', 'Processed At', 'Notes'],
  Branches: ['Branch ID', 'Name', 'Status', 'Created At'],
  StaffAccess: ['User ID', 'Branch ID', 'Permissions', 'Updated At'],
  Profiles: ['User ID', 'Photo', 'Blood Group', 'Emergency Contact', 'Place', 'Card Number', 'Updated At'],
  Settings: ['Key', 'Value', 'Updated At'],
  LoanProducts: ['Key', 'Label', 'Principal', 'Duration Weeks', 'Weekly Collection', 'Last Week Collection', 'Total Collection', 'Interest Deduction', 'Guarantor Commission', 'Net Disbursed', 'Status', 'Created At'],
  Deposits: ['Txn ID', 'Guarantor ID', 'Type', 'Amount', 'Date', 'Notes', 'Recorded By', 'Created At'],
  DepositRequests: ['Request ID', 'Guarantor ID', 'Type', 'Amount', 'Status', 'Requested At', 'Processed At', 'Notes'],
  MigrationLog: ['Log ID', 'Lead ID', 'Field', 'Status', 'Drive File ID', 'Supabase Path', 'Error', 'Created At'],
}

export const LEADS_COLUMNS = ['Lead ID', 'Submitted Date', 'Guarantor ID', 'Guarantor User ID', 'Customer Name', 'Phone', 'Aadhaar No', 'Address', 'House Name', 'Place', 'Landmark', 'Nominee Name', 'Nominee Phone', 'Occupation', 'PAN No', 'Cheque Number', 'Pinned Location', 'Loan Product', 'Risk Level', 'Status', 'Assigned Agent ID', 'Verification Status', 'Verification Notes', 'Verification Submitted Date', 'Admin Final Decision', 'Recommendation Status', 'Customer Photo URL', 'Aadhaar Front URL', 'Aadhaar Back URL', 'Landmark Photo URL', 'House Photo URL', 'Cheque Photo URL', 'Document Folder ID', 'Notes', 'Account Number', 'IFSC Code', 'Updated At']
