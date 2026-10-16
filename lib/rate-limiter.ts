import { NextRequest, NextResponse } from 'next/server'

interface RateLimitEntry {
  count: number
  resetTime: number
}

const store = new Map<string, RateLimitEntry>()

function getKey(req: NextRequest, prefix: string): string {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
             req.headers.get('x-real-ip') ||
             'unknown'
  return `${prefix}:${ip}`
}

export function rateLimit(
  req: NextRequest,
  options: {
    prefix: string
    limit: number
    windowMs: number
  }
): { success: boolean; response?: NextResponse; remaining: number; resetTime: number } {
  const { prefix, limit, windowMs } = options
  const key = getKey(req, prefix)
  const now = Date.now()

  const entry = store.get(key)

  if (!entry || now > entry.resetTime) {
    store.set(key, { count: 1, resetTime: now + windowMs })
    return { success: true, remaining: limit - 1, resetTime: now + windowMs }
  }

  if (entry.count >= limit) {
    const response = NextResponse.json(
      { success: false, error: 'Too many requests. Please try again later.' },
      { status: 429 }
    )
    response.headers.set('Retry-After', Math.ceil((entry.resetTime - now) / 1000).toString())
    return { success: false, response, remaining: 0, resetTime: entry.resetTime }
  }

  entry.count++
  return { success: true, remaining: limit - entry.count, resetTime: entry.resetTime }
}

export const authRateLimit = (req: NextRequest) =>
  rateLimit(req, { prefix: 'auth', limit: 10, windowMs: 60 * 1000 })

export const apiRateLimit = (req: NextRequest) =>
  rateLimit(req, { prefix: 'api', limit: 100, windowMs: 60 * 1000 })

export const strictRateLimit = (req: NextRequest) =>
  rateLimit(req, { prefix: 'strict', limit: 5, windowMs: 60 * 1000 })

// Limit by an arbitrary key (e.g. a normalized email address) rather than client IP.
// Used so limits apply identically to registered and unregistered emails (no account disclosure).
export function rateLimitKey(key: string, limit: number, windowMs: number): { success: boolean; retryAfterSec: number } {
  const now = Date.now()
  const entry = store.get(key)
  if (!entry || now > entry.resetTime) {
    store.set(key, { count: 1, resetTime: now + windowMs })
    return { success: true, retryAfterSec: 0 }
  }
  if (entry.count >= limit) return { success: false, retryAfterSec: Math.ceil((entry.resetTime - now) / 1000) }
  entry.count++
  return { success: true, retryAfterSec: 0 }
}
