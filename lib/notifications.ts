import { appendRow, makeId, nowIso } from './supabase-db'

export async function notifyUser(userId: string, role: string, title: string, message: string, entityType: string, entityId: string) {
  await appendRow('Notifications', {
    'Notification ID': makeId('NTF'),
    'User ID': userId,
    'Role': role,
    'Title': title,
    'Message': message,
    'Entity Type': entityType,
    'Entity ID': entityId,
    'Is Read': 'false',
    'Created At': nowIso(),
  })
}

export async function notifyRole(role: string, title: string, message: string, entityType: string, entityId: string) {
  await appendRow('Notifications', {
    'Notification ID': makeId('NTF'),
    'User ID': null as any,
    'Role': role,
    'Title': title,
    'Message': message,
    'Entity Type': entityType,
    'Entity ID': entityId,
    'Is Read': 'false',
    'Created At': nowIso(),
  })
}
