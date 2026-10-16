import { z } from 'zod'
import { NextRequest, NextResponse } from 'next/server'

export function validateBody<T>(schema: z.ZodSchema<T>) {
  return async (req: NextRequest): Promise<{ success: true; data: T } | { success: false; response: NextResponse }> => {
    try {
      const body = await req.json()
      const result = schema.safeParse(body)
      if (!result.success) {
        const errors = result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join('; ')
        return { success: false, response: NextResponse.json({ success: false, error: errors }, { status: 400 }) }
      }
      return { success: true, data: result.data }
    } catch {
      return { success: false, response: NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 }) }
    }
  }
}

export const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
  trust: z.string().optional(),
})

export const verifyQrSchema = z.object({
  preAuth: z.string().min(1, 'Pre-auth token is required'),
  uid: z.string().min(1, 'UID is required'),
  remember: z.boolean().optional(),
})

export const forgotPasswordSchema = z.object({
  email: z.string().trim().max(254).email('Invalid email address'),
})

export const verifyOtpSchema = z.object({
  email: z.string().trim().max(254).email('Invalid email address'),
  otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
})

export const resetPasswordSchema = z.object({
  resetToken: z.string().min(1, 'Reset token is required'),
  password: z.string().min(1, 'Password is required').max(128),
})

export const devUserPasswordResetSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  newPassword: z.string().min(1, 'New password is required').max(128),
  confirm: z.string().min(1, 'Confirmation is required'),
})

export const createLeadSchema = z.object({
  customerName: z.string().min(1, 'Customer name is required'),
  phone: z.string().min(10, 'Valid phone number required'),
  aadhaarNo: z.string().length(12, 'Aadhaar must be 12 digits').optional().or(z.literal('')),
  address: z.string().optional(),
  houseName: z.string().optional(),
  place: z.string().optional(),
  landmark: z.string().optional(),
  nomineeName: z.string().optional(),
  nomineePhone: z.string().optional(),
  occupation: z.string().optional(),
  panNo: z.string().optional(),
  chequeNumber: z.string().optional(),
  loanProduct: z.string().min(1, 'Loan product is required'),
  riskLevel: z.enum(['Low', 'Medium', 'High']).optional(),
  accountNumber: z.string().optional(),
  ifscCode: z.string().optional(),
  notes: z.string().optional(),
  guarantorId: z.string().optional(),
  pinnedLocation: z.string().optional(),
  customerPhoto: z.string().optional(),
  aadhaarFront: z.string().optional(),
  aadhaarBack: z.string().optional(),
  housePhoto: z.string().optional(),
  landmarkPhoto: z.string().optional(),
  chequePhoto: z.string().optional(),
})

export const submitVerificationSchema = z.object({
  recommendationStatus: z.enum(['Verified', 'Suspicious', 'Rejected Recommendation']),
  riskLevel: z.enum(['Low', 'Medium', 'High']),
  riskNotes: z.string().optional(),
  gpsCoordinates: z.string().optional(),
  mapsLink: z.string().url().optional().or(z.literal('')),
  customerName: z.string().min(1),
  phone: z.string().min(10),
  aadhaarNo: z.string().length(12).optional().or(z.literal('')),
  address: z.string().optional(),
  place: z.string().optional(),
  houseName: z.string().optional(),
  landmark: z.string().optional(),
  accountNumber: z.string().optional(),
  ifscCode: z.string().optional(),
  nomineeName: z.string().optional(),
  nomineePhone: z.string().optional(),
  occupation: z.string().optional(),
  panNo: z.string().optional(),
  chequeNumber: z.string().optional(),
  customerPhoto: z.string().optional(),
  aadhaarFront: z.string().optional(),
  aadhaarBack: z.string().optional(),
  housePhoto: z.string().optional(),
  landmarkPhoto: z.string().optional(),
  chequePhoto: z.string().optional(),
})

export const adminReviewSchema = z.object({
  action: z.literal('adminReview'),
  decision: z.enum(['Approve Loan', 'Reject Lead', 'Request Reverification']),
  notes: z.string().optional(),
  loanProduct: z.string().optional(),
})

export const assignAgentSchema = z.object({
  action: z.literal('assignAgent'),
  agentId: z.string().min(1, 'Agent ID is required'),
})

export const updateLeadSchema = z.object({
  action: z.literal('update'),
  customerName: z.string().optional(),
  phone: z.string().optional(),
  aadhaarNo: z.string().length(12).optional(),
  address: z.string().optional(),
  houseName: z.string().optional(),
  place: z.string().optional(),
  landmark: z.string().optional(),
  nomineeName: z.string().optional(),
  nomineePhone: z.string().optional(),
  occupation: z.string().optional(),
  panNo: z.string().optional(),
  chequeNumber: z.string().optional(),
  loanProduct: z.string().optional(),
  riskLevel: z.enum(['Low', 'Medium', 'High']).optional(),
  notes: z.string().optional(),
})

export const tripSchema = z.object({
  startLatitude: z.number().min(-90).max(90),
  startLongitude: z.number().min(-180).max(180),
  endLatitude: z.number().min(-90).max(90),
  endLongitude: z.number().min(-180).max(180),
  leadId: z.string().optional(),
  manualDistance: z.number().positive().optional(),
})

export const attendanceSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().positive().optional(),
})