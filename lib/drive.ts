import { getOAuthDriveClient } from './google'
import { APP_CONFIG } from './config'
import { Readable } from 'stream'
import { FilePayload } from '@/types'
import {
  BUCKETS,
  uploadToSupabase,
  buildSupabaseProxyUrl,
  getOrCreateFolderSupabase as getOrCreateFolderSupabaseImpl,
  uploadLeadPhotoSupabase as uploadLeadPhotoSupabaseImpl,
} from './supabase'

export async function getOrCreateFolder(parentId: string, name: string): Promise<string> {
  const drive = getOAuthDriveClient()
  const res = await drive.files.list({
    q: `'${parentId}' in parents and name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })
  if (res.data.files && res.data.files.length > 0) return res.data.files[0].id!
  const created = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id',
    supportsAllDrives: true,
  })
  return created.data.id!
}

export async function saveFile(folderId: string, fileName: string, mimeType: string, base64Data: string): Promise<string> {
  const drive = getOAuthDriveClient()
  const b64 = base64Data.replace(/^data:[^;]+;base64,/, '')
  const buffer = Buffer.from(b64, 'base64')
  const stream = Readable.from(buffer)
  const res = await drive.files.create({
    requestBody: { name: fileName, parents: [folderId] },
    media: { mimeType, body: stream },
    fields: 'id',
    supportsAllDrives: true,
  })
  return res.data.id!
}

export async function getFileBase64(fileId: string): Promise<{ data: string; mime: string }> {
  const drive = getOAuthDriveClient()
  const meta = await drive.files.get({ fileId, fields: 'mimeType', supportsAllDrives: true })
  const mime = meta.data.mimeType || 'image/jpeg'
  const res = await drive.files.get({ fileId, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' })
  const data = Buffer.from(res.data as ArrayBuffer).toString('base64')
  return { data, mime }
}

export async function listFolderFiles(folderId: string) {
  const drive = getOAuthDriveClient()
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false`,
    fields: 'files(id,name,mimeType)',
    orderBy: 'createdTime',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })
  return res.data.files || []
}

export function driveUrl(fileId: string): string {
  return `https://drive.google.com/open?id=${fileId}`
}

export async function getLeadDocFolder(guarantorCode: string, customerName: string): Promise<string> {
  const root = APP_CONFIG.PHOTO_ROOT_FOLDER_ID
  const gcodeFolder = await getOrCreateFolder(root, `NGF-${guarantorCode}`)
  return getOrCreateFolder(gcodeFolder, customerName)
}

export async function uploadLeadPhoto(folderId: string, prefix: string, file: FilePayload): Promise<string> {
  const fileId = await saveFile(folderId, `${prefix}_${file.fileName}`, file.mimeType, file.base64Data)
  return driveUrl(fileId)
}

/* ==================== NEW: Supabase Storage Functions ==================== */

export function getOrCreateFolderSupabase(guarantorCode: string, customerName: string, type: 'customer-docs' | 'payment-proofs' | 'profiles'): string {
  return getOrCreateFolderSupabaseImpl(guarantorCode, customerName, type)
}

export async function saveFileSupabase(
  bucket: 'customer-docs' | 'payment-proofs' | 'profiles',
  path: string,
  mimeType: string,
  base64Data: string
): Promise<string> {
  await uploadToSupabase(bucket, path, base64Data, mimeType)
  return buildSupabaseProxyUrl(bucket, path)
}

export async function uploadLeadPhotoSupabase(
  guarantorCode: string,
  customerName: string,
  prefix: string,
  file: FilePayload
): Promise<string> {
  return uploadLeadPhotoSupabaseImpl(guarantorCode, customerName, prefix, file)
}