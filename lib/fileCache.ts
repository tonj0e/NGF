// Small in-memory cache for files served by GET /api/drive/[fileId] (one per server process).
// It only saves the trip to Google Drive / Supabase Storage: the route checks the session and
// canReadFile() on EVERY request before it asks this cache, so a cached file is never handed to
// someone who failed the permission check.
//
// Least-recently-used, bounded by total bytes. Entries also expire after a while, because a
// Supabase path or a Drive file can be replaced in place (upsert / re-upload of the same type).

export type CachedFile = { buf: Buffer<ArrayBuffer>; mime: string }
type Entry = CachedFile & { at: number }

export const FILE_CACHE_MAX_BYTES = 60 * 1024 * 1024   // 60 MB in total
export const FILE_CACHE_MAX_ITEM = 8 * 1024 * 1024     // bigger files are served but not kept
export const FILE_CACHE_TTL_MS = 30 * 60 * 1000        // 30 minutes

const entries = new Map<string, Entry>()   // Map keeps insertion order: first = least recently used
const inflight = new Map<string, Promise<CachedFile>>()
const inflightMaybe = new Map<string, Promise<CachedFile | null>>()
let totalBytes = 0

function drop(key: string) {
  const e = entries.get(key)
  if (!e) return
  entries.delete(key)
  totalBytes -= e.buf.length
}

export function fileCacheGet(key: string, now = Date.now()): CachedFile | null {
  const e = entries.get(key)
  if (!e) return null
  if (now - e.at > FILE_CACHE_TTL_MS) { drop(key); return null }
  // move to the most-recently-used end
  entries.delete(key)
  entries.set(key, e)
  return { buf: e.buf, mime: e.mime }
}

export function fileCacheSet(key: string, file: CachedFile, now = Date.now()) {
  drop(key)
  if (file.buf.length > FILE_CACHE_MAX_ITEM) return
  entries.set(key, { ...file, at: now })
  totalBytes += file.buf.length
  for (const k of entries.keys()) {
    if (totalBytes <= FILE_CACHE_MAX_BYTES) break
    drop(k)
  }
}

// Cached file, or load it once (requests for the same key that arrive together share one download).
// Call only after the caller's permission check has passed.
export async function fileCacheLoad(key: string, load: () => Promise<CachedFile>): Promise<CachedFile> {
  const hit = fileCacheGet(key)
  if (hit) return hit
  const running = inflight.get(key)
  if (running) return running
  const p = load()
    .then(f => { fileCacheSet(key, f); return f })
    .finally(() => { inflight.delete(key) })
  inflight.set(key, p)
  return p
}

// Like fileCacheLoad, for a loader that may find nothing (null is returned and not kept).
export async function fileCacheLoadMaybe(key: string, load: () => Promise<CachedFile | null>): Promise<CachedFile | null> {
  const hit = fileCacheGet(key)
  if (hit) return hit
  const running = inflightMaybe.get(key)
  if (running) return running
  const p = load()
    .then(f => { if (f) fileCacheSet(key, f); return f })
    .finally(() => { inflightMaybe.delete(key) })
  inflightMaybe.set(key, p)
  return p
}

// ?w=<px> on /api/drive/[fileId] asks for a small version (longest side about that size).
// Snapped to a few sizes so the cache holds few variants. Missing / bad value = 0 = the original file.
export const THUMB_SIZES = [160, 320, 480, 640, 1024]
export function thumbSize(raw: string | null): number {
  const n = Number(raw)
  if (!raw || !Number.isFinite(n) || n <= 0) return 0
  return THUMB_SIZES.find(s => s >= n) ?? THUMB_SIZES[THUMB_SIZES.length - 1]
}

export function fileCacheStats() {
  return { items: entries.size, bytes: totalBytes }
}

export function fileCacheClear() {
  entries.clear()
  inflight.clear()
  inflightMaybe.clear()
  totalBytes = 0
}
