// The doorkeeper for every file the CRM stores (Google Drive and Supabase Storage).
// 1 SIZE: checked here on the server, on the real bytes.
// 2 TYPE: decided from the file's first bytes (its signature), never from the name or the type the browser claims.
// 3 NAME: callers use `randomFileId()` + the extension this check returns, never the user's file name.
// 4 WHO SEES IT: not here. Files are private and only opened through /api/drive/[fileId] (lib/fileAccess.ts).
// No imports on purpose, so it can be tested on its own.

export type UploadKind = 'image' | 'document'   // image = photo or screenshot, document = may also be a PDF

export type CheckedUpload = { buffer: Buffer; mime: string; ext: string }

const MB = 1024 * 1024
// Defaults match what the app already accepted. Callers may pass a smaller limit (Payment Chat uses 3 MB).
export const LIMITS = { image: 12 * MB, pdf: 8 * MB } as const

const HEIC_BRANDS = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1']

/** What the bytes really are: one of the allowed types, or null. */
export function detectType(b: Buffer): { mime: string; ext: string } | null {
  if (b.length < 12) return null
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' }
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { mime: 'image/png', ext: 'png' }
  if (b.toString('latin1', 0, 4) === 'GIF8') return { mime: 'image/gif', ext: 'gif' }
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' }
  if (b.toString('latin1', 0, 1024).includes('%PDF-')) return { mime: 'application/pdf', ext: 'pdf' }
  if (b.toString('latin1', 4, 8) === 'ftyp') {
    const brand = b.toString('latin1', 8, 12)
    if (HEIC_BRANDS.includes(brand)) return { mime: brand === 'mif1' || brand === 'msf1' ? 'image/heif' : 'image/heic', ext: brand === 'mif1' || brand === 'msf1' ? 'heif' : 'heic' }
  }
  return null
}

/**
 * Decode, size-check and type-check an upload. Throws an Error with a plain message that is safe to show.
 * `maxBytes` overrides the image limit (and the PDF limit if it is smaller). `allow` narrows the accepted types.
 */
export function checkUpload(base64Data: string, opts: { maxBytes?: number; allow?: string[] } = {}): CheckedUpload {
  const raw = String(base64Data || '').replace(/^data:[^;,]+;base64,/, '')
  // Refuse on the text size first, so a huge body is never decoded
  const cap = opts.maxBytes ?? LIMITS.image
  if (raw.length > Math.ceil(cap * 4 / 3) + 8) throw new Error(`The file is too big (limit ${Math.round(cap / MB)} MB)`)
  const buffer = Buffer.from(raw, 'base64')
  if (!buffer.length) throw new Error('The file is empty')
  const type = detectType(buffer)
  if (!type) throw new Error('Only photos (JPG, PNG, WebP, HEIC) and PDF files are allowed')
  if (opts.allow && !opts.allow.includes(type.mime)) throw new Error(`This file type is not allowed here (${type.ext.toUpperCase()})`)
  const limit = type.mime === 'application/pdf' ? Math.min(cap, LIMITS.pdf) : cap
  if (buffer.length > limit) throw new Error(`The file is too big (limit ${Math.round(limit / MB)} MB)`)
  return { buffer, mime: type.mime, ext: type.ext }
}

/** A name that is ours: f_ + 16 random hex characters. Add the verified extension yourself. */
export function randomFileId(): string {
  const a = new Uint8Array(8)
  crypto.getRandomValues(a)
  return 'f_' + Array.from(a, x => x.toString(16).padStart(2, '0')).join('')
}
