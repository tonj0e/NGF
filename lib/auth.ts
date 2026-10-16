import { SignJWT, jwtVerify } from 'jose'
import { createHash, createHmac, timingSafeEqual } from 'crypto'
import bcrypt from 'bcrypt'
import { Session } from '../types'

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be set and at least 32 characters')
  }
  return new TextEncoder().encode(secret)
}

const TTL = 86400 // 24 hours
const BCRYPT_ROUNDS = 12

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

// Keyed fingerprint of the user's current password hash, embedded in session tokens ("pv" claim).
// Changing a password changes the fingerprint, so older tokens for that user stop validating.
// The hash itself is never placed in a token.
export function passwordVersion(passwordHash: string): string {
  return createHmac('sha256', getSecret()).update(`pwv:${passwordHash}`).digest('hex').slice(0, 32)
}

export function passwordVersionMatches(claim: unknown, passwordHash: string): boolean {
  if (typeof claim !== 'string') return false
  const a = Buffer.from(claim)
  const b = Buffer.from(passwordVersion(passwordHash))
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function createToken(session: Omit<Session, 'token' | 'createdAt'>, passwordHash: string): Promise<string> {
  return new SignJWT({ ...session, pv: passwordVersion(passwordHash) })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${TTL}s`)
    .sign(getSecret())
}

export async function verifyToken(token: string): Promise<Session> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      clockTolerance: 60
    })
    return payload as unknown as Session
  } catch (error) {
    // Configuration problems stay visible; any other failure (expired, bad signature, malformed) is an invalid session
    if (error instanceof Error && error.message.includes('JWT_SECRET')) throw error
    throw new Error('Session expired')
  }
}

export function generateSalt(): string {
  return createHash('sha256').update(Math.random().toString() + Date.now()).digest('hex').slice(0, 16)
}

// Short-lived token proving the password step passed, pending QR verification
export async function createPreAuthToken(userId: string): Promise<string> {
  return new SignJWT({ t: 'preauth', uid: userId })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('10m').sign(getSecret())
}
export async function verifyPreAuthToken(token: string): Promise<string> {
  const { payload } = await jwtVerify(token, getSecret())
  if (payload.t !== 'preauth') throw new Error('Invalid pre-auth token')
  return payload.uid as string
}

// "Remember this device" token — lets a device skip the QR step until logout
export async function createTrustToken(userId: string): Promise<string> {
  return new SignJWT({ t: 'qrtrust', uid: userId })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('365d').sign(getSecret())
}
export async function verifyTrustToken(token: string): Promise<string> {
  const { payload } = await jwtVerify(token, getSecret())
  if (payload.t !== 'qrtrust') throw new Error('Invalid trust token')
  return payload.uid as string
}

// Short-lived token proving an email OTP was verified; redeemed once to set a new password
export async function createResetToken(userId: string, otpId: string): Promise<string> {
  return new SignJWT({ t: 'pwreset', uid: userId, oid: otpId })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('10m').sign(getSecret())
}
export async function verifyResetToken(token: string): Promise<{ userId: string; otpId: string }> {
  const { payload } = await jwtVerify(token, getSecret())
  if (payload.t !== 'pwreset') throw new Error('Invalid reset token')
  return { userId: payload.uid as string, otpId: payload.oid as string }
}
