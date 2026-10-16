import { NextRequest, NextResponse } from 'next/server'
import { getFileBase64 } from '@/lib/drive'
import { downloadFromSupabase, parseSupabaseProxyUrl } from '@/lib/supabase'
import { getSession } from '@/lib/api'

export async function GET(req: NextRequest, { params }: any) {
  try {
    await getSession(req)
    const { fileId } = await params

    // Check if this is a Supabase storage identifier
    const supabaseInfo = parseSupabaseProxyUrl(fileId)
    if (supabaseInfo) {
      const { data, mime } = await downloadFromSupabase(supabaseInfo.bucket, supabaseInfo.path)
      const buf = Buffer.from(data, 'base64')
      return new NextResponse(buf, {
        headers: {
          'Content-Type': mime,
          'Cache-Control': 'private, max-age=3600',
        },
      })
    }

    // Otherwise treat as Google Drive file ID (existing behavior)
    const { data, mime } = await getFileBase64(fileId)
    const buf = Buffer.from(data, 'base64')
    return new NextResponse(buf, {
      headers: {
        'Content-Type': mime,
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (e: any) {
    return new NextResponse(null, { status: 404 })
  }
}