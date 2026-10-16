import { NextResponse } from 'next/server'
import { google } from 'googleapis'

export async function GET() {
  const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID!,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
    `${origin}/api/drive/callback`
  )

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive'],
    prompt: 'consent',
  })

  return NextResponse.redirect(url)
}
