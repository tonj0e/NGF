import { createClient, SupabaseClient } from '@supabase/supabase-js'

export const BUCKETS = {
  CUSTOMER_DOCS: 'customer-docs',
  PAYMENT_PROOFS: 'payment-proofs',
  PROFILES: 'profiles',
} as const

export type BucketName = typeof BUCKETS[keyof typeof BUCKETS]

let _supabase: SupabaseClient | null = null

function getSupabase(): SupabaseClient {
  if (_supabase) return _supabase
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  }
  _supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  })
  return _supabase
}

export async function downloadFromSupabase(bucket: BucketName, path: string): Promise<{ data: string; mime: string }> {
  const { data, error } = await getSupabase().storage.from(bucket).download(path)
  if (error || !data) {
    throw new Error(`Supabase download failed: ${error?.message || 'No data'}`)
  }
  const arrayBuffer = await data.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString('base64')
  const mime = data.type || 'image/jpeg'
  return { data: base64, mime }
}

export async function uploadToSupabase(
  bucket: BucketName,
  path: string,
  base64Data: string,
  mimeType: string
): Promise<void> {
  const buffer = Buffer.from(base64Data.replace(/^data:[^;]+;base64,/, ''), 'base64')
  const { error } = await getSupabase().storage.from(bucket).upload(path, buffer, {
    contentType: mimeType,
    upsert: true,
  })
  if (error) {
    throw new Error(`Supabase upload failed: ${error.message}`)
  }
}

export async function getSignedUrl(bucket: BucketName, path: string, expiresIn = 3600): Promise<string> {
  const { data, error } = await getSupabase().storage.from(bucket).createSignedUrl(path, expiresIn)
  if (error || !data) {
    throw new Error(`Supabase signed URL failed: ${error?.message || 'No data'}`)
  }
  return data.signedUrl
}

export function buildSupabaseProxyUrl(bucket: BucketName, path: string): string {
  return `/api/drive/supabase:${bucket}/${path}`
}

export function parseSupabaseProxyUrl(identifier: string): { bucket: BucketName; path: string } | null {
  if (!identifier.startsWith('supabase:')) return null
  const rest = identifier.slice('supabase:'.length)
  const [bucket, ...pathParts] = rest.split('/')
  if (!bucket || pathParts.length === 0) return null
  if (!Object.values(BUCKETS).includes(bucket as BucketName)) return null
  return { bucket: bucket as BucketName, path: pathParts.join('/') }
}

export function getOrCreateFolderSupabase(
  guarantorCode: string,
  customerName: string,
  type: 'customer-docs' | 'payment-proofs' | 'profiles'
): string {
  const safeGuarantor = guarantorCode.replace(/[^a-zA-Z0-9-]/g, '_')
  const safeCustomer = customerName.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '_')
  const typePath = type === 'customer-docs' ? `NGF-${safeGuarantor}/${safeCustomer}` : type
  return typePath
}

export async function uploadLeadPhotoSupabase(
  guarantorCode: string,
  customerName: string,
  prefix: string,
  file: { fileName: string; mimeType: string; base64Data: string }
): Promise<string> {
  const folderPath = getOrCreateFolderSupabase(guarantorCode, customerName, 'customer-docs')
  const ext = file.fileName.split('.').pop() || 'jpg'
  const path = `${folderPath}/${prefix}.${ext}`
  await uploadToSupabase('customer-docs', path, file.base64Data, file.mimeType)
  return buildSupabaseProxyUrl('customer-docs', path)
}