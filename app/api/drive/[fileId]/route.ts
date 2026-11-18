import { NextRequest, NextResponse } from 'next/server'
import { getFileBuffer, getFileThumbnail } from '@/lib/drive'
import { downloadFromSupabase, parseSupabaseProxyUrl } from '@/lib/supabase'
import { getSession } from '@/lib/api'
import { canReadFile } from '@/lib/fileAccess'
import { fileCacheLoad, fileCacheLoadMaybe, thumbSize, type CachedFile } from '@/lib/fileCache'

// Drive files that had no thumbnail: skip the thumbnail lookup for them for a while (bounded, per process)
const noThumb = new Map<string, number>()
const NO_THUMB_MS = 30 * 60 * 1000

async function loadOriginal(fileId: string): Promise<CachedFile> {
  const supabaseInfo = parseSupabaseProxyUrl(fileId)
  if (supabaseInfo) {
    const { data, mime } = await downloadFromSupabase(supabaseInfo.bucket, supabaseInfo.path)
    return { buf: Buffer.from(data, 'base64'), mime }
  }
  return getFileBuffer(fileId)
}

export async function GET(req: NextRequest, { params }: any) {
  try {
    // Permission first, on every request: the cache below is only reached by someone allowed to read this file
    const session = await getSession(req)
    const { fileId } = await params
    if (!(await canReadFile(session, fileId))) return new NextResponse(null, { status: 404 })

    const w = thumbSize(req.nextUrl.searchParams.get('w'))
    let file: CachedFile | null = null
    if (w && !parseSupabaseProxyUrl(fileId) && !(Date.now() - (noThumb.get(fileId) ?? -Infinity) < NO_THUMB_MS)) {
      // Drive's own thumbnail at about w px
      file = await fileCacheLoadMaybe(`${fileId}@${w}`, () => getFileThumbnail(fileId, w))
      if (!file) {
        if (noThumb.size >= 5000) noThumb.clear()
        noThumb.set(fileId, Date.now())
      }
    }
    // The original: no ?w, a Supabase file (no thumbnail service here) or no Drive thumbnail
    if (!file) file = await fileCacheLoad(fileId, () => loadOriginal(fileId))
    return new NextResponse(file.buf, {
      headers: {
        'Content-Type': file.mime,
        'Cache-Control': 'private, no-store',   // never kept by the browser after logout (security review); the page keeps its own copy per session
      },
    })
  } catch {
    return new NextResponse(null, { status: 404 })
  }
}
