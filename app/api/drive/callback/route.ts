import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  if (!code) return NextResponse.json({ error: 'No code' }, { status: 400 })

  const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID!,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
    `${origin}/api/drive/callback`
  )

  const { tokens } = await oauth2Client.getToken(code)
  const refreshToken = tokens.refresh_token || ''

  const html = `<!DOCTYPE html>
<html>
<head><title>Authentication Complete</title>
<style>
  body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f9fafb; }
  .box { background: white; border-radius: 1rem; padding: 2rem; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,0.08); max-width: 400px; }
  h2 { margin: 0 0 0.5rem; font-size: 1.1rem; color: #1a1a2e; }
  p { color: #697586; font-size: 0.875rem; margin: 0; }
  .spinner { width: 2rem; height: 2rem; border: 3px solid #e5e7eb; border-top-color: #1a1a2e; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 1rem; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>
<div class="box">
  <div class="spinner"></div>
  <h2>Authentication Complete</h2>
  <p>Sending token back to the app...</p>
</div>
<script>
  try {
    if (window.opener) {
      window.opener.postMessage({ type: 'oauth_token', refresh_token: ${JSON.stringify(refreshToken)} }, '*');
      setTimeout(() => window.close(), 800);
    } else {
      document.querySelector('p').textContent = 'Token: ${refreshToken.slice(0, 20)}... — Please close this tab.';
    }
  } catch(e) {
    document.querySelector('p').textContent = 'Done. You can close this window.';
  }
</script>
</body>
</html>`

  return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } })
}
