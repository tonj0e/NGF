import { NextRequest } from 'next/server'
import { apiHandler, requireRole, ok, err } from '@/lib/api'
import { getSupabase, invalidateCache } from '@/lib/supabase-db'
import { hashPassword, verifyPassword } from '@/lib/auth'

export const POST = apiHandler(async (req: NextRequest) => {
  await requireRole(req, ['Admin'])
  const body = await req.json()
  const { action, username, password, defaultPassword } = body

  const supabase = getSupabase()

  if (action === 'fix-all') {
    // Fix all users that don't have bcrypt hashes
    const { data: users, error } = await supabase.from('users').select('user_id, username, password_hash')
    if (error) return err(`Failed to fetch users: ${error.message}`)

    let fixed = 0
    const errors: string[] = []

    for (const user of users || []) {
      const hash = user.password_hash
      // Check if already bcrypt (starts with $2b$, $2a$, $2y$)
      if (hash && /^\$2[aby]\$/.test(hash)) {
        continue // Already bcrypt
      }

      // For users without bcrypt hash, set a default password
      // In production, you'd want to use a secure default or send reset emails
      const newPassword = defaultPassword || 'password123'
      const newHash = await hashPassword(newPassword)

      const { error: updateError } = await supabase
        .from('users')
        .update({ password_hash: newHash, updated_at: new Date().toISOString() })
        .eq('user_id', user.user_id)

      if (updateError) {
        errors.push(`${user.username}: ${updateError.message}`)
      } else {
        fixed++
        console.log(`Fixed password for ${user.username}`)
      }
    }

    invalidateCache('Users')
    return ok({ fixed, errors, message: `Fixed ${fixed} user passwords. Default password: ${defaultPassword || 'password123'}` })
  }

  if (action === 'reset-one') {
    if (!username || !password) return err('username and password required')

    const newHash = await hashPassword(password)
    const { error } = await supabase
      .from('users')
      .update({ password_hash: newHash, updated_at: new Date().toISOString() })
      .eq('username', username)

    if (error) return err(`Failed to update: ${error.message}`)

    invalidateCache('Users')
    return ok({ message: `Password reset for ${username}` })
  }

  if (action === 'verify-hash') {
    if (!username || !password) return err('username and password required')

    const { data: user } = await supabase
      .from('users')
      .select('username, password_hash')
      .eq('username', username)
      .single()

    if (!user) return err('User not found')

    const isValid = await verifyPassword(password, user.password_hash)
    const isBcrypt = user.password_hash && /^\$2[aby]\$/.test(user.password_hash)

    return ok({
      username: user.username,
      hashPrefix: user.password_hash?.substring(0, 20),
      isBcrypt,
      passwordValid: isValid
    })
  }

  return err('Invalid action. Use: fix-all, reset-one, or verify-hash')
})