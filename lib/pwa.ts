'use client'
import { useSyncExternalStore } from 'react'

// "Install the app" support. Chrome, Edge and Android give an install prompt (`beforeinstallprompt`) that we keep and
// show on our own button; iPhone and iPad have no prompt, so we show how to use Share -> Add to Home Screen.

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let deferred: InstallEvent | null = null
let started = false
let installedNow = false
let snapshot = { canPrompt: false, standalone: false, ios: false }
const SERVER_SNAPSHOT = { canPrompt: false, standalone: false, ios: false }   // one fixed object: React needs the same value every time
const listeners = new Set<() => void>()

function standaloneNow() {
  try { return window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true } catch { return false }
}
function iosNow() {
  try { return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) } catch { return false }
}
function publish() {
  const next = { canPrompt: !!deferred && !installedNow, standalone: installedNow || standaloneNow(), ios: iosNow() }
  if (next.canPrompt !== snapshot.canPrompt || next.standalone !== snapshot.standalone || next.ios !== snapshot.ios) {
    snapshot = next
    listeners.forEach(l => l())
  }
}

/** Call once in the browser: registers the service worker and starts listening for the install prompt. */
export function startPwa() {
  if (started || typeof window === 'undefined') return
  started = true
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e as InstallEvent; publish() })
  window.addEventListener('appinstalled', () => { deferred = null; installedNow = true; publish() })
  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', publish)
  publish()
  if ('serviceWorker' in navigator) {
    // after the page has loaded, so the first screen is never slowed down (the load event may already be over)
    const register = () => { navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {}) }
    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })
  }
}

/** Opens the browser's install dialog. Returns false if there is none (iPhone: show the steps instead). */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  const ev = deferred
  await ev.prompt()
  const choice = await ev.userChoice.catch(() => null)
  if (choice?.outcome === 'accepted') { deferred = null; installedNow = true }
  publish()
  return true
}

export function useInstall() {
  return useSyncExternalStore(
    cb => { listeners.add(cb); return () => { listeners.delete(cb) } },
    () => snapshot,
    () => SERVER_SNAPSHOT,
  )
}
