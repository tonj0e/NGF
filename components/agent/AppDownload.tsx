'use client'
import { useEffect, useState } from 'react'
import { Smartphone } from 'lucide-react'
import { inNativeApp } from '@/lib/agentTracker'

export const APK_URL = '/downloads/ngf-agent.apk'
const KEY = 'ngf_apk_banner_until'

// True on an Android phone's browser or installed web app, but not inside the NGF Agent app itself.
export function useCanDownloadApp(): boolean {
  const [can, setCan] = useState(false)
  useEffect(() => { setCan(/android/i.test(navigator.userAgent) && !inNativeApp()) }, [])
  return can
}

// Offers the Android app to agents: it keeps sharing location with the phone locked, until punch-out.
export default function AppDownloadBanner() {
  const can = useCanDownloadApp()
  const [hidden, setHidden] = useState(true)
  useEffect(() => { try { setHidden(Number(localStorage.getItem(KEY) || 0) > Date.now()) } catch { setHidden(false) } }, [])
  if (!can || hidden) return null
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-gold/40 bg-amber-50 px-4 py-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-ink text-white"><Smartphone className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Get the NGF Agent app</p>
        <p className="text-xs text-soft">Keeps your live location on until you punch out, even with the phone locked. Download, open it, and sign in as usual.</p>
      </div>
      <a href={APK_URL} download className="rounded-2xl bg-ink px-4 py-2 text-sm font-semibold text-white">Download</a>
      <button onClick={() => { try { localStorage.setItem(KEY, String(Date.now() + 7 * 86400_000)) } catch {} setHidden(true) }} className="text-xs font-semibold text-soft">Later</button>
    </div>
  )
}
