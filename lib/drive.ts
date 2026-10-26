import { getOAuthDriveClient } from './google'
import { APP_CONFIG } from './config'
import { Readable } from 'stream'
import { FilePayload } from '@/types'
import { reportError } from './monitor'
import {
  BUCKETS,
  uploadToSupabase,
  buildSupabaseProxyUrl,
  getOrCreateFolderSupabase as getOrCreateFolderSupabaseImpl,
  uploadLeadPhotoSupabase as uploadLeadPhotoSupabaseImpl,
} from './supabase'

export async function getOrCreateFolder(parentId: string, name: string): Promise<string> {
  const drive = getOAuthDriveClient()
  // Escape the customer name so it cannot end the quoted value and add its own conditions
  const q = (v: string) => String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  const res = await drive.files.list({
    q: `'${q(parentId)}' in parents and name='${q(name)}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
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
  if (!/^(image\/(jpe?g|png|webp|gif|heic|heif)|application\/pdf)$/.test(mimeType)) throw new Error('Only images and PDF files are allowed')
  if (base64Data.length > 11_000_000) throw new Error('File is too large (limit 8 MB)')
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

// Folder and file names carry the customer's name plus a unique code, so two customers with the same name never share
// a folder: the lead ID while the lead is open, the 4-digit loan code (GBN-7425 -> 7425) once the loan exists.
export function docLabel(customerName: string, code: string): string {
  const name = String(customerName || 'Customer').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() || 'Customer'
  return code ? `${name} - ${code}` : name
}

export async function getLeadDocFolder(guarantorCode: string, customerName: string, code = ''): Promise<string> {
  const root = APP_CONFIG.PHOTO_ROOT_FOLDER_ID
  const gcodeFolder = await getOrCreateFolder(root, `NGF-${guarantorCode}`)
  return getOrCreateFolder(gcodeFolder, docLabel(customerName, code))
}

const DOC_TYPES = ['aadhaar_front', 'aadhaar_back', 'customer', 'house', 'landmark', 'cheque']

// When the loan code is known, rename the customer's folder and its files from "<name> - <lead id>" to "<name> - <code>".
// A rename keeps each file's ID, so the links saved on the lead keep working. Best effort: never blocks an approval.
export async function renameLeadDocs(folderId: string, customerName: string, code: string): Promise<void> {
  if (!folderId || !code) return
  try {
    const drive = getOAuthDriveClient()
    const label = docLabel(customerName, code)
    await drive.files.update({ fileId: folderId, requestBody: { name: label }, fields: 'id', supportsAllDrives: true })
    // listFolderFiles is oldest first, so for a type uploaded twice only the newest file is renamed; older copies keep their name
    const newest = new Map<string, { id?: string | null; name?: string | null }>()
    for (const f of await listFolderFiles(folderId)) {
      const base = (f.name || '').split(' - ').pop() || ''
      const type = DOC_TYPES.find(t => base.includes(t))
      if (type) newest.set(type, f)
    }
    for (const [type, f] of newest) {
      const ext = /(\.[A-Za-z0-9]+)$/.exec(f.name || '')?.[1] || ''
      const next = `${label} - ${type}${ext}`
      if (next !== f.name) await drive.files.update({ fileId: f.id!, requestBody: { name: next }, fields: 'id', supportsAllDrives: true })
    }
  } catch (e) { reportError('Could not rename customer documents', e) }
}

const ONE_MB = 1024 * 1024
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic', 'image/heif': 'heif', 'application/pdf': 'pdf' }

// Safety net behind the phone's own compression: keep the picture as sharp as possible but under 1 MB.
// Tries the biggest size and best quality first and steps down only until it fits.
async function fitUnderOneMb(buf: Buffer, mime: string): Promise<{ buf: Buffer; mime: string }> {
  if (buf.length <= ONE_MB || !/^image\/(jpe?g|png|webp)$/.test(mime)) return { buf, mime }
  try {
    const sharp = (await import('sharp')).default
    for (const dim of [2560, 2048, 1920, 1600, 1280]) {
      for (const quality of [92, 88, 84, 80, 75, 70, 65]) {
        const out = await sharp(buf).rotate().resize({ width: dim, height: dim, fit: 'inside', withoutEnlargement: true }).jpeg({ quality, mozjpeg: true }).toBuffer()
        if (out.length <= ONE_MB) return { buf: out, mime: 'image/jpeg' }
      }
    }
  } catch (e) { reportError('Image shrink failed, storing the original', e) }
  return { buf, mime }
}

// One file per document type in the customer's folder (aadhaar_front.jpg, house.jpg ...). A new upload of the same
// type replaces the old one in place, so the link already saved on the lead keeps working.
export async function uploadLeadPhoto(folderId: string, prefix: string, file: FilePayload, label = ''): Promise<string> {
  if (!/^(image\/(jpe?g|png|webp|gif|heic|heif)|application\/pdf)$/.test(file.mimeType)) throw new Error('Only images and PDF files are allowed')
  if (file.base64Data.length > 11_000_000 * 3) throw new Error('File is too large')
  const raw = Buffer.from(file.base64Data.replace(/^data:[^;]+;base64,/, ''), 'base64')
  const { buf, mime } = await fitUnderOneMb(raw, file.mimeType)
  const type = prefix.replace(/[^a-zA-Z0-9_-]/g, '_')
  const name = `${label ? `${label} - ` : ''}${type}.${EXT[mime] || 'jpg'}`

  const drive = getOAuthDriveClient()
  const safeName = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  const existing = await drive.files.list({
    q: `'${folderId.replace(/'/g, "\\'")}' in parents and name='${safeName}' and trashed=false`,
    fields: 'files(id)', supportsAllDrives: true, includeItemsFromAllDrives: true,
  })
  const found = existing.data.files?.[0]?.id
  if (found) {
    await drive.files.update({ fileId: found, media: { mimeType: mime, body: Readable.from(buf) }, fields: 'id', supportsAllDrives: true })
    return driveUrl(found)
  }
  const created = await drive.files.create({
    requestBody: { name, parents: [folderId] },
    media: { mimeType: mime, body: Readable.from(buf) },
    fields: 'id', supportsAllDrives: true,
  })
  return driveUrl(created.data.id!)
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