import { NextRequest } from 'next/server'
import { apiHandler, getSession, requireRole, ok, err } from '@/lib/api'
import { requireFeature } from '@/lib/access'
import { readTable, appendRow, updateById, nowIso, invalidateCache } from '@/lib/supabase-db'
import { APP_CONFIG } from '@/lib/config'
import { saveFileSupabase } from '@/lib/drive'
import { getBranchAccess, canSeeBranch, branchesOfUser } from '@/lib/branchAccess'

// Admin: any user. Staff: only people of their own branches (agents, guarantors, branch staff).
async function mayOpenProfile(session: { userId: string; role: string }, target: string): Promise<boolean> {
  if (session.role === 'Admin') return true
  const access = await getBranchAccess(session as any)
  return Array.from(await branchesOfUser(target)).some(b => canSeeBranch(access, b))
}

function makeCardNumber(prefix: string, used: Set<string>): string {
  let num = ''
  do { num = String(1000 + Math.floor(Math.random() * 9000)) } while (used.has(`${prefix}-${num}`))
  return `${prefix}-${num}`
}

// GET                → caller's own ID-card profile
// GET ?userId=<id>   → (Admin) a specific user's profile, for printing their card
export const GET = apiHandler(async (req: NextRequest) => {
  const session = await getSession(req)
  const { searchParams } = new URL(req.url)
  const target = searchParams.get('userId')
  let userId = session.userId
  if (target && target !== session.userId) {
    await requireFeature(req, [])
    if (!(await mayOpenProfile(session, target))) return err('This user belongs to another branch', 403)
    userId = target
  }

  const [profiles, users, guarantors] = await Promise.all([
    readTable('Profiles'), readTable('Users'), readTable('Guarantors'),
  ])
  const user = users.find(u => u['User ID'] === userId)
  const guar = guarantors.find(g => g['User ID'] === userId)
  const prefix = guar?.['Code'] || APP_CONFIG.COMPANY_PREFIX
  const prof = profiles.find(p => p['User ID'] === userId)

  // Ensure a stable card number exists (guarantor code / NGF + unique 4-digit)
  let cardNumber = prof?.['Card Number'] || ''
  if (!cardNumber) {
    const used = new Set(profiles.map(p => p['Card Number']).filter(Boolean))
    cardNumber = makeCardNumber(prefix, used)
    if (prof) {
      await updateById('Profiles', userId, { 'Card Number': cardNumber, 'Updated At': nowIso() })
      invalidateCache('Profiles')
    } else {
      await appendRow('Profiles', { 'User ID': userId, 'Photo': '', 'Blood Group': '', 'Emergency Contact': '', 'Place': '', 'Card Number': cardNumber, 'Updated At': nowIso() })
    }
  }

  return ok({
    userId,
    name: user?.['Name'] || '', role: user?.['Role'] || '', username: user?.['Username'] || '',
    createdAt: user?.['Created At'] || '',
    guarantorId: guar?.['Guarantor ID'] || '', guarantorCode: guar?.['Code'] || '',
    photo: prof?.['Photo'] || '',
    bloodGroup: prof?.['Blood Group'] || '',
    emergencyContact: prof?.['Emergency Contact'] || '',
    place: prof?.['Place'] || '',
    cardNumber,
  })
})

// POST → update a profile (own, or any user's when Admin/Staff pass userId)
export const POST = apiHandler(async (req: NextRequest) => {
  const session = await getSession(req)
  const body = await req.json()
  let userId = session.userId
  if (body.userId && body.userId !== session.userId) {
    await requireFeature(req, [])
    if (!(await mayOpenProfile(session, body.userId))) return err('This user belongs to another branch', 403)
    userId = body.userId
  }

  const [profiles, guarantors] = await Promise.all([readTable('Profiles'), readTable('Guarantors')])
  const guar = guarantors.find(g => g['User ID'] === userId)
  const prefix = guar?.['Code'] || APP_CONFIG.COMPANY_PREFIX
  const prof = profiles.find(p => p['User ID'] === userId)

  let cardNumber = prof?.['Card Number'] || ''
  if (!cardNumber) {
    const used = new Set(profiles.map(p => p['Card Number']).filter(Boolean))
    cardNumber = makeCardNumber(prefix, used)
  }

  // Handle profile photo upload to Supabase
  // The photo is either empty, an embedded image, or a link to a stored profile picture. Nothing else is kept.
  const okPhoto = (v: unknown) => typeof v === 'string' && (v === '' || /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(v) || /^\/api\/drive\/supabase:profiles\/[\w./-]+$/.test(v))
  if (body.photo !== undefined && !okPhoto(body.photo)) return err('Photo must be an image')
  let photoUrl = body.photo !== undefined ? body.photo : (prof?.['Photo'] || '')
  if (body.photo && body.photoFile) {
    const ext: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }
    const type = String(body.photoFileType || 'image/jpeg')
    if (!ext[type]) return err('Photo must be a JPEG, PNG, WebP or GIF image')
    photoUrl = await saveFileSupabase('profiles', `${userId}/profile.${ext[type]}`, type, body.photoFile)
  }

  const data = {
    'User ID': userId,
    'Photo': photoUrl,
    'Blood Group': body.bloodGroup ?? prof?.['Blood Group'] ?? '',
    'Emergency Contact': body.emergencyContact ?? prof?.['Emergency Contact'] ?? '',
    'Place': body.place ?? prof?.['Place'] ?? '',
    'Card Number': cardNumber,
    'Updated At': nowIso(),
  }
  if (prof) {
    await updateById('Profiles', userId, data)
  } else {
    await appendRow('Profiles', data)
  }
  invalidateCache('Profiles')
  return ok({ success: true, cardNumber })
})
