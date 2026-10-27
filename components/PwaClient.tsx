'use client'
import { useEffect, useState } from 'react'
import { Download, Share, X } from 'lucide-react'
import { promptInstall, startPwa, useInstall } from '@/lib/pwa'

const DISMISS_KEY = 'ngf_pwa_dismissed'
const DISMISS_DAYS = 7

function recentlyDismissed() {
  try { const t = Number(localStorage.getItem(DISMISS_KEY) || 0); return !!t && Date.now() - t < DISMISS_DAYS * 86400_000 } catch { return false }
}

// Registers the service worker and offers "Install NGF app": a button where the browser allows it, steps on iPhone/iPad.
export default function PwaClient() {
  const { canPrompt, standalone, ios } = useInstall()
  const [hidden, setHidden] = useState(true)

  useEffect(() => { startPwa(); setHidden(recentlyDismissed()) }, [])

  if (hidden || standalone || (!canPrompt && !ios)) return null

  const close = () => { try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch {} setHidden(true) }

  return (
    <div role="dialog" aria-label="Install NGF app"
      className="fixed inset-x-3 z-[60] mx-auto max-w-md rounded-2xl border border-line bg-white p-4 shadow-xl sm:left-auto sm:right-4 sm:mx-0"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
      <button onClick={close} aria-label="Close" className="absolute right-2.5 top-2.5 rounded-full p-1.5 text-soft hover:bg-mist"><X className="h-4 w-4" /></button>
      <div className="flex items-start gap-3 pr-6">
        <img src="/icons/icon-192.png" alt="" className="h-12 w-12 shrink-0 rounded-xl border border-line" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">Install NGF FINCORP</p>
          {canPrompt ? (
            <>
              <p className="mt-0.5 text-xs text-soft">Open it like an app from your home screen or desktop, full screen and fast.</p>
              <button onClick={async () => { if (await promptInstall()) close() }}
                className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-ink px-4 py-2 text-xs font-semibold text-white">
                <Download className="h-3.5 w-3.5" /> Install app
              </button>
            </>
          ) : (
            <p className="mt-0.5 text-xs leading-relaxed text-soft">
              On iPhone or iPad: tap <Share className="mx-0.5 inline h-3.5 w-3.5 align-text-bottom" /> <b>Share</b> in Safari, then choose <b>Add to Home Screen</b>.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
