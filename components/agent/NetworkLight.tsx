'use client'
import { useEffect, useRef, useState } from 'react'

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

export function useNetworkLight(everyMs = 8000): NetStatus & { recheck: () => void } {
  const [st, setSt] = useState<NetStatus>({ level: 'checking', latencyMs: null, upKbps: null })
  const busy = useRef(false)
  const body = useRef<Blob | null>(null)

  async function check() {
    if (busy.current) return
    busy.current = true
    try {
      if (!navigator.onLine) { setSt({ level: 'offline', latencyMs: null, upKbps: null }); return }
      const rtt = await timed('/api/ping', {}, 6000)
      if (rtt === null) { setSt({ level: navigator.onLine ? 'poor' : 'offline', latencyMs: null, upKbps: null }); return }
      let up: number | null = null
      // upload test only when the connection is not already obviously bad (it would just waste a bad connection)
      if (rtt < AVERAGE_RTT) {
        if (!body.current) body.current = new Blob([new Uint8Array(PROBE_BYTES)])
        const ms = await timed('/api/ping', { method: 'POST', body: body.current, headers: { 'Content-Type': 'application/octet-stream' } }, 8000)
        up = ms === null ? 0 : Math.round((PROBE_BYTES * 8) / 1000 / Math.max(0.05, (ms - rtt * 0.5) / 1000))
      }
      setSt({ level: classify(rtt, up), latencyMs: Math.round(rtt), upKbps: up })
    } finally { busy.current = false }
  }

  useEffect(() => {
    check()
    const id = setInterval(check, everyMs)
    const on = () => check()
    const off = () => setSt({ level: 'offline', latencyMs: null, upKbps: null })
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { clearInterval(id); window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { ...st, recheck: check }
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
