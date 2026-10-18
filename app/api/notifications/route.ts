import { NextRequest } from 'next/server'
import { apiHandler, getSession, ok } from '@/lib/api'
import { readTable, updateById, paginate, invalidateCache } from '@/lib/supabase-db'

export const GET = apiHandler(async (req: NextRequest) => {
  const session = await getSession(req)
  const { searchParams } = new URL(req.url)
  const page = Number(searchParams.get('page') || 1)
  const pageSize = Number(searchParams.get('pageSize') || 20)
  const notifs = await readTable('Notifications', { forceFresh: true })
  const mine = notifs.filter(n => n['User ID'] === session.userId || (!n['User ID'] && n['Role'] === session.role))
    .sort((a, b) => b['Created At'].localeCompare(a['Created At']))
  const mapped = mine.map(n => ({
    notificationId: n['Notification ID'], userId: n['User ID'], role: n['Role'],
    title: n['Title'], message: n['Message'], entityType: n['Entity Type'],
    entityId: n['Entity ID'], isRead: n['Is Read'], createdAt: n['Created At'],
  }))
  return ok(paginate(mapped, page, pageSize))
})

export const PATCH = apiHandler(async (req: NextRequest) => {
  const session = await getSession(req)
  const { notificationId } = await req.json()
  const notifs = await readTable('Notifications', { forceFresh: true })
  const n = notifs.find(x => x['Notification ID'] === notificationId)
  if (!n) return ok({ success: false })
  // Only the recipient may mark it read: their own row, or a broadcast to their role
  if (!(n['User ID'] === session.userId || (!n['User ID'] && n['Role'] === session.role))) return ok({ success: false })
  await updateById('Notifications', notificationId, { 'Is Read': 'true' })
  invalidateCache('Notifications')
  return ok({ success: true })
})
