import { NextRequest } from 'next/server'
import { appendRow, nowIso, makeId } from './supabase-db'

export interface AuditLogEntry {
  userId: string
  username: string
  role: string
  action: string
  entityType: string
  entityId: string
  details?: Record<string, any>
  ipAddress?: string
  userAgent?: string
  success: boolean
  errorMessage?: string
}

export async function logAudit(entry: AuditLogEntry): Promise<void> {
  try {
    await appendRow('Logs', {
      'Log ID': makeId('LOG'),
      'User ID': entry.userId,
      'Username': entry.username,
      'Role': entry.role,
      'Action': entry.action,
      'Entity Type': entry.entityType,
      'Entity ID': entry.entityId,
      'Metadata JSON': JSON.stringify(entry.details || {}),
      'Created At': nowIso(),
    })
  } catch (error) {
    console.error('Failed to write audit log:', error)
  }
}

export function extractClientInfo(req: NextRequest): { ipAddress: string; userAgent: string } {
  const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                    req.headers.get('x-real-ip') ||
                    'unknown'
  const userAgent = req.headers.get('user-agent') || 'unknown'
  return { ipAddress, userAgent }
}

export function createAuditLogger(req: NextRequest, session: { userId: string; username: string; role: string }) {
  const { ipAddress, userAgent } = extractClientInfo(req)

  return {
    log: async (action: string, entityType: string, entityId: string, details?: Record<string, any>, success = true, errorMessage?: string) => {
      await logAudit({
        userId: session.userId,
        username: session.username,
        role: session.role,
        action,
        entityType,
        entityId,
        details,
        ipAddress,
        userAgent,
        success,
        errorMessage,
      })
    },
    success: async (action: string, entityType: string, entityId: string, details?: Record<string, any>) => {
      await logAudit({
        userId: session.userId,
        username: session.username,
        role: session.role,
        action,
        entityType,
        entityId,
        details,
        ipAddress,
        userAgent,
        success: true,
      })
    },
    failure: async (action: string, entityType: string, entityId: string, details?: Record<string, any>, errorMessage?: string) => {
      await logAudit({
        userId: session.userId,
        username: session.username,
        role: session.role,
        action,
        entityType,
        entityId,
        details,
        ipAddress,
        userAgent,
        success: false,
        errorMessage,
      })
    },
  }
}

export const AUDIT_ACTIONS = {
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  LOGIN_FAILED: 'LOGIN_FAILED',
  QR_VERIFY: 'QR_VERIFY',
  QR_VERIFY_FAILED: 'QR_VERIFY_FAILED',
  PASSWORD_RESET_REQUEST: 'PASSWORD_RESET_REQUEST',
  PASSWORD_RESET: 'PASSWORD_RESET',
  PASSWORD_RESET_FAILED: 'PASSWORD_RESET_FAILED',
  PASSWORD_RESET_OTP_ISSUED: 'PASSWORD_RESET_OTP_ISSUED',
  PASSWORD_RESET_EMAIL_SENT: 'PASSWORD_RESET_EMAIL_SENT',
  PASSWORD_RESET_EMAIL_FAILED: 'PASSWORD_RESET_EMAIL_FAILED',
  PASSWORD_RESET_OTP_VERIFIED: 'PASSWORD_RESET_OTP_VERIFIED',
  PASSWORD_RESET_OTP_FAILED: 'PASSWORD_RESET_OTP_FAILED',
  DEV_USER_PASSWORD_RESET: 'DEV_USER_PASSWORD_RESET',
  LEAD_CREATE: 'LEAD_CREATE',
  LEAD_UPDATE: 'LEAD_UPDATE',
  LEAD_DELETE: 'LEAD_DELETE',
  LEAD_APPROVE: 'LEAD_APPROVE',
  LEAD_REJECT: 'LEAD_REJECT',
  LEAD_ASSIGN_AGENT: 'LEAD_ASSIGN_AGENT',
  VERIFICATION_SUBMIT: 'VERIFICATION_SUBMIT',
  ATTENDANCE_MARK: 'ATTENDANCE_MARK',
  TRIP_LOG: 'TRIP_LOG',
  LOAN_APPROVE: 'LOAN_APPROVE',
  CUSTOMER_CREATE: 'CUSTOMER_CREATE',
  USER_CREATE: 'USER_CREATE',
  USER_UPDATE: 'USER_UPDATE',
  USER_DELETE: 'USER_DELETE',
  SETTINGS_CHANGE: 'SETTINGS_CHANGE',
  DATA_EXPORT: 'DATA_EXPORT',
  DATA_DELETE: 'DATA_DELETE',
} as const