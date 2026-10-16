// Server-side password requirements for self-service and admin password resets.
const COMMON = new Set([
  'password', 'password1', 'password123', 'admin', 'admin123', 'admin@123', 'welcome123', 'qwerty123',
  '12345678', '123456789', '1234567890', 'letmein123', 'ngf@123', 'ngf123456', 'ngffincorp', 'changeme123',
])

export const PASSWORD_MIN = 10
export const PASSWORD_MAX = 128

export const PASSWORD_RULES_TEXT =
  `At least ${PASSWORD_MIN} characters, with at least three of: lowercase, uppercase, number, symbol.`

// Returns an error message, or null when the password is acceptable.
export function validatePasswordPolicy(password: string, ctx: { username?: string; email?: string } = {}): string | null {
  if (typeof password !== 'string') return 'Password is required'
  if (password.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters long`
  if (password.length > PASSWORD_MAX) return `Password must be at most ${PASSWORD_MAX} characters long`
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(r => r.test(password)).length
  if (classes < 3) return 'Password must include at least three of: lowercase, uppercase, number, symbol'
  const lower = password.toLowerCase()
  if (COMMON.has(lower)) return 'That password is too common'
  const uname = (ctx.username || '').toLowerCase()
  if (uname.length >= 3 && lower.includes(uname)) return 'Password must not contain your username'
  const local = (ctx.email || '').split('@')[0].toLowerCase()
  if (local.length >= 4 && lower.includes(local)) return 'Password must not contain your email name'
  return null
}
