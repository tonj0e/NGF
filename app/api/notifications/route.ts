import { NextRequest } from 'next/server'
import { apiHandler, getSession, ok } from '@/lib/api'
import { getRowById, updateById, invalidateCache } from '@/lib/supabase-db'
import { pageQuery } from '@/lib/db'

export const GET = apiHandler(async (req: NextRequest) => {
  const session = await getSession(req)
  const { searchParams } = new URL(req.url)
  // your own notifications and broadcasts to your role, newest first, one page at a time from the database
  const r = await pageQuery('Notifications', {
    filters: qb => qb.or(`user_id.eq.${session.userId},and(user_id.is.null,role.eq.${session.role})`),
    order: [{ column: 'created_at', ascending: false }, { column: 'notification_id' }],
    page: searchParams.get('page') || 1, pageSize: searchParams.get('pageSize') || 20,
  })
  const mapped = r.rows.map(n => ({
    notificationId: n['Notification ID'], userId: n['User ID'], role: n['Role'],
    title: n['Title'], message: n['Message'], entityType: n['Entity Type'],
    entityId: n['Entity ID'], isRead: n['Is Read'], createdAt: n['Created At'],
  }))
  return ok({ rows: mapped, pagination: { page: r.page, pageSize: r.pageSize, total: r.total, totalPages: Math.ceil(r.total / r.pageSize) } })
})

export const PATCH = apiHandler(async (req: NextRequest) => {
  const session = await getSession(req)
  const { notificationId } = await req.json()
  const n = await getRowById('Notifications', String(notificationId || ''))
  if (!n) return ok({ success: false })
  // Only the recipient may mark it read: their own row, or a broadcast to their role
  if (!(n['User ID'] === session.userId || (!n['User ID'] && n['Role'] === session.role))) return ok({ success: false })
  await updateById('Notifications', notificationId, { 'Is Read': 'true' })
  invalidateCache('Notifications')
  return ok({ success: true })
})
