import { NextRequest } from 'next/server'
import { apiHandler, requireRole, ok, err } from '@/lib/api'
import { getSupabase } from '@/lib/supabase-db'
import { hashPassword } from '@/lib/auth'

export const POST = apiHandler(async (req: NextRequest) => {
  await requireRole(req, ['Admin'])
  const body = await req.json()
  const { username, password, name, email, role = 'Admin' } = body

  if (!username || !password) return err('Username and password required')

  const supabase = getSupabase()

  // Check if any admin exists
  const { data: existing } = await supabase.from('users').select('user_id').limit(1)
  if (existing && existing.length > 0) {
    return err('Admin user already exists')
  }

  const passwordHash = await hashPassword(password)
  const userId = `USR${Date.now().toString(36).toUpperCase()}`

  const { error } = await supabase.from('users').insert({
    user_id: userId,
    username,
    password_hash: passwordHash,
    salt: '',
    role,
    status: 'Active',
    name: name || username,
    email: email || '',
    guarantor_code: '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })

  if (error) return err(`Failed to create user: ${error.message}`)

  return ok({ message: 'Admin user created', userId })
})