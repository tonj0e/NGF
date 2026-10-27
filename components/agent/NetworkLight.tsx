'use client'
import { useEffect, useState } from 'react'

// Green / orange / red light for field agents: can this phone send a verification (details + photos) right now?
// It times a tiny request and a small upload to our own server every few seconds, so it reflects the real
// connection to NGF, not just "the phone says it has signal".
export type NetLevel = 'good' | 'average' | 'poor' | 'offline' | 'checking'
export type NetStatus = { level: NetLevel; latencyMs: number | null; upKbps: number | null }

const PROBE_BYTES = 24 * 1024
const GOOD_RTT = 900, AVERAGE_RTT = 2500       // round trip, ms
const GOOD_UP = 800, AVERAGE_UP = 250          // upload speed, kilobits per second

function classify(rtt: number | null, upKbps: number | null): NetLevel {
  if (rtt === null) return 'poor'
  const conn = (navigator as unknown as { connection?: { effectiveType?: string; saveData?: boolean } }).connection
  const slowType = conn?.effectiveType === 'slow-2g' || conn?.effectiveType === '2g'
  if (rtt > AVERAGE_RTT || slowType || (upKbps !== null && upKbps < AVERAGE_UP)) return 'poor'
  if (rtt > GOOD_RTT || conn?.effectiveType === '3g' || (upKbps !== null && upKbps < GOOD_UP)) return 'average'
  return 'good'
}

async function timed(url: string, init: RequestInit, timeoutMs: number): Promise<number | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  const t0 = performance.now()
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal, cache: 'no-store' })
    if (!r.ok) return null
    await r.arrayBuffer()
    return performance.now() - t0
  } catch { return null } finally { clearTimeout(timer) }
}

// One shared check for the whole app: the header light and the verification form read the same answer, and the
// phone is tested once per interval however many lights are on screen.
type Listener = () => void
const listeners = new Set<Listener>()
let current: NetStatus = { level: 'checking', latencyMs: null, upKbps: null }
let timer: ReturnType<typeof setInterval> | null = null
let busy = false
let body: Blob | null = null

function publish(st: NetStatus) { current = st; listeners.forEach(l => l()) }

export async function recheckNetwork() {
  if (busy) return
  busy = true
  try {
    if (!navigator.onLine) { publish({ level: 'offline', latencyMs: null, upKbps: null }); return }
    const rtt = await timed('/api/ping', {}, 6000)
    if (rtt === null) { publish({ level: navigator.onLine ? 'poor' : 'offline', latencyMs: null, upKbps: null }); return }
    let up: number | null = null
    // upload test only when the connection is not already obviously bad (it would just waste a bad connection)
    if (rtt < AVERAGE_RTT) {
      if (!body) body = new Blob([new Uint8Array(PROBE_BYTES)])
      const ms = await timed('/api/ping', { method: 'POST', body, headers: { 'Content-Type': 'application/octet-stream' } }, 8000)
      up = ms === null ? 0 : Math.round((PROBE_BYTES * 8) / 1000 / Math.max(0.05, (ms - rtt * 0.5) / 1000))
    }
    publish({ level: classify(rtt, up), latencyMs: Math.round(rtt), upKbps: up })
  } finally { busy = false }
}

const onOnline = () => { recheckNetwork() }
const onOffline = () => publish({ level: 'offline', latencyMs: null, upKbps: null })

function subscribe(l: Listener) {
  listeners.add(l)
  if (listeners.size === 1) {
    recheckNetwork()
    timer = setInterval(recheckNetwork, 8000)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
  }
  return () => {
    listeners.delete(l)
    if (listeners.size === 0) {
      if (timer) clearInterval(timer)
      timer = null
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }
}

export function useNetworkLight(): NetStatus & { recheck: () => void } {
  const [st, setSt] = useState<NetStatus>(current)
  useEffect(() => { setSt(current); return subscribe(() => setSt(current)) }, [])
  return { ...st, recheck: recheckNetwork }
}

// The light as it sits in the page header (always visible for field agents)
export function HeaderNetworkLight() {
  const net = useNetworkLight()
  return <NetworkLight status={net} compact />
}

const LOOK: Record<NetLevel, { dot: string; text: string; label: string; hint: string }> = {
  good:     { dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'Network good',    hint: 'Safe to submit.' },
  average:  { dot: 'bg-amber-500',   text: 'text-amber-700',   label: 'Network average', hint: 'Submit may be slow. Keep this screen open.' },
  poor:     { dot: 'bg-red-500',     text: 'text-red-700',     label: 'Network too weak', hint: 'Submit may fail. Move to a place with better signal, then submit.' },
  offline:  { dot: 'bg-red-500',     text: 'text-red-700',     label: 'No network',      hint: 'Fill in the details now. Submit when the light turns green or orange.' },
  checking: { dot: 'bg-gray-400',    text: 'text-soft',        label: 'Checking network…', hint: '' },
}

export function NetworkLight({ status, compact = false }: { status: NetStatus & { recheck: () => void }; compact?: boolean }) {
  const look = LOOK[status.level]
  const detail = status.latencyMs !== null ? `${status.latencyMs} ms${status.upKbps ? ` · up ${Math.round(status.upKbps)} kbps` : ''}` : ''
  return (
    <button type="button" onClick={status.recheck} title={`${look.hint} Tap to check again.${detail ? ' ' + detail : ''}`} aria-live="polite"
      className={`inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold ${look.text}`}>
      <span className="relative flex h-3 w-3">
        {status.level !== 'checking' && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-40 ${look.dot}`} />}
        <span className={`relative inline-flex h-3 w-3 rounded-full ${look.dot}`} />
      </span>
      {look.label}{!compact && look.hint ? <span className="hidden font-normal text-soft sm:inline"> — {look.hint}</span> : null}
    </button>
  )
}
