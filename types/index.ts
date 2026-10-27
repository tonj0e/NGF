export type Role = 'Admin' | 'Guarantor' | 'NGF AGENT' | 'Staff'

export interface User {
  userId: string
  username: string
  role: Role
  name: string
  email: string
  guarantorCode?: string
  status: string
}

export interface Session {
  token: string
  userId: string
  username: string
  role: Role
  name: string
  email: string
  guarantorCode?: string
  photo?: string
  createdAt: string
  pv?: string
  iat?: number
}

export interface Lead {
  leadId: string
  submittedDate: string
  guarantorId: string
  guarantorUserId: string
  guarantorName?: string
  branchId?: string
  branchName?: string
  customerName: string
  phone: string
  aadhaarNo: string
  address: string
  houseName: string
  place: string
  landmark: string
  nomineeName: string
  nomineePhone: string
  altPhone?: string
  altPhoneLabel?: string
  occupation: string
  panNo: string
  chequeNumber: string
  pinnedLocation: string
  loanProduct: string
  riskLevel: string
  status: string
  assignedAgentId: string
  assignedAgentName?: string
  verificationStatus: string
  verificationNotes: string
  verificationSubmittedDate: string
  adminFinalDecision: string
  recommendationStatus: string
  customerPhotoUrl: string
  aadhaarFrontUrl: string
  aadhaarBackUrl: string
  landmarkPhotoUrl: string
  housePhotoUrl: string
  chequePhotoUrl: string
  documentFolderId: string
  notes: string
  accountNumber: string
  ifscCode: string
  updatedAt: string
  aadhaarStatus?: 'exists' | 'new' | ''
  otpVerifiedAt?: string | null
  otpOverrideReason?: string
  approvedAt?: string | null
  disbursedAt?: string | null
}

export interface Customer {
  customerId: string
  leadId: string
  name: string
  phone: string
  address: string
  houseName: string
  place: string
  landmark: string
  occupation: string
  accountNumber: string
  ifscCode: string
  panNo: string
  guarantorId: string
  activeLoanId: string
  status: string
  createdAt: string
  updatedAt: string
}

export interface Loan {
  loanId: string
  customerId: string
  leadId: string
  guarantorId: string
  assignedAgentId: string
  principalAmount: number
  interestDeduction: number
  guarantorCommission: number
  netDisbursed: number
  weeklyCollectionAmount: number
  durationWeeks: number
  totalCollectionAmount: number
  status: string
  startDate: string
  endDate: string
  createdAt: string
  updatedAt: string
}

export interface Repayment {
  repaymentId: string
  loanId: string
  customerId: string
  dueDate: string
  weekNo: number
  amount: number
  status: string
  paidDate: string
  collectionAgentId: string
  proofFileId: string
  notes: string
  createdAt: string
  updatedAt: string
}

export interface Collection {
  collectionId: string
  repaymentId: string
  loanId: string
  customerId: string
  agentId: string
  amount: number
  paymentDate: string
  proofFileId: string
  paymentMode: string
  notes: string
  createdAt: string
}

export interface Notification {
  notificationId: string
  userId: string
  role: string
  title: string
  message: string
  entityType: string
  entityId: string
  isRead: string
  createdAt: string
}

export interface LoanProduct {
  key: string
  label: string
  principal: number
  durationWeeks: number
  weeklyCollection: number
  lastWeekCollection: number
  totalCollection: number
  interestDeduction: number
  guarantorCommission: number
  netDisbursed: number
}

export interface FilePayload {
  fileName: string
  mimeType: string
  base64Data: string
}

export interface AgentLocation {
  agentId: string
  name: string
  phone: string
  agentType: string
  userId: string
  username: string
  latitude: number | null
  longitude: number | null
  accuracy: number | null
  locationUpdatedAt: string | null
  isTracking: boolean
  isOnline: boolean
  ageMinutes: number | null
  speed: number | null
  heading: number | null
}

export interface AgentTrip {
  tripId: string
  agentId: string
  leadId: string
  startLatitude: number
  startLongitude: number
  endLatitude: number
  endLongitude: number
  distanceKm: number
  tripDate: string
  weekStart: string
  createdAt: string
}

export interface AgentAttendance {
  attendanceId: string
  agentId: string
  date: string
  latitude: number | null
  longitude: number | null
  accuracy: number | null
  status: string
  createdAt: string
}

export type BranchRole = 'manager' | 'accountant' | 'cashier' | 'collection_agent'

export interface BranchStaffRole {
  id: string
  userId: string
  branchId: string
  roleInBranch: BranchRole
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface GuarantorBranch {
  id: string
  guarantorId: string
  branchId: string
  isActive: boolean
  createdAt: string
}

export interface OrgHierarchyResponse {
  organizationAdmin: {
    userId: string
    name: string
    email: string
    role: 'Admin'
    avatarUrl?: string
    cardNumber?: string
  } | null
  branches: Array<{
    branchId: string
    name: string
    status: string
    counts: {
      manager: number
      accountants: number
      cashiers: number
      collectionAgents: number
      guarantors: number
    }
    staff: Array<{
      userId: string
      username: string
      name: string
      roleInBranch: BranchRole
      permissions: string[]
      isActive: boolean
    }>
    guarantors: Array<{
      guarantorId: string
      name: string
      code: string
      phone: string
      commissionEarned: number
    }>
  }>
}
