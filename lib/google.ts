import { google } from 'googleapis'
import { JWT } from 'google-auth-library'

let _auth: JWT | null = null

function getAuth(): JWT {
  if (_auth) return _auth
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!key) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY env var not set')
  let jsonStr = key.trim()
  // If base64 encoded, decode it first
  if (!jsonStr.startsWith('{')) {
    jsonStr = Buffer.from(jsonStr, 'base64').toString('utf8').trim()
  }
  const creds = JSON.parse(jsonStr)
  _auth = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/documents',
    ],
  })
  return _auth
}

export function getSheetsClient() {
  return google.sheets({ version: 'v4', auth: getAuth() })
}

export function getDriveClient() {
  return google.drive({ version: 'v3', auth: getAuth() })
}

export function getDocsClient() {
  return google.docs({ version: 'v1', auth: getAuth() })
}

let _oauthClient: any = null

function getOAuthClient() {
  if (_oauthClient) return _oauthClient
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID!,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
    process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL}/api/drive/callback` : 'http://localhost:3000/api/drive/callback'
  )
  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN!,
  })
  _oauthClient = oauth2Client
  return _oauthClient
}

export function getOAuthDriveClient() {
  return google.drive({ version: 'v3', auth: getOAuthClient() })
}
