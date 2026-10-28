'use client'
import { useEffect, useState } from 'react'
import { MapPin, LogOut } from 'lucide-react'
import { Session } from '@/types'
import { startAgentTracker, stopAgentTracker, punchOut, restartTracking, useAgentTracker, nativeTracker, nativeNeeds } from '@/lib/agentTracker'

// Starts live location sharing for an agent for as long as they are signed in and punched in, whatever page they are on.
// A small pill at the bottom shows the state and lets the agent punch out at the end of the day.
export default function AgentTracker({ session }: { session: Session }) {
  const t = useAgentTracker()
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [, tick] = useState(0)
  useEffect(() => { const id = setInterval(() => tick(n => n + 1), 3000); return () => clearInterval(id) }, [])   // keeps the "sent x seconds ago" text current

  useEffect(() => { startAgentTracker(session.token); return () => stopAgentTracker() }, [session.token])

  if (t.phase !== 'tracking') return null
  const sentAgo = t.lastSent ? Math.round((Date.now() - t.lastSent) / 1000) : null
  const stalled = sentAgo === null ? false : sentAgo > 45        // nothing has reached the office for 45 s
  const bad = !!t.error || t.permission === 'denied' || stalled
  const label = t.permission === 'denied' ? 'Allow location' : stalled ? 'Not sending' : t.error ? 'Location problem' : sentAgo === null ? 'Starting…' : 'Sending live'

  async function confirmOut() {
    setBusy(true); setMsg('')
    const e = await punchOut()
    setBusy(false)
    if (e) setMsg(e); else setAsking(false)
  }

  return (
    <>
      <button onClick={() => setAsking(true)} className={`fixed bottom-4 left-4 z-40 flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold shadow-lg ring-1 backdrop-blur ${bad ? 'bg-red-50/95 text-red-700 ring-red-200' : 'bg-white/95 text-ink ring-black/10'}`} aria-label="Location tracking is on. Tap to punch out.">
        <span className="relative flex h-2.5 w-2.5">
          {!bad && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />}
          <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${bad ? 'bg-red-500' : 'bg-emerald-500'}`} />
        </span>
        {label}{sentAgo !== null && !bad ? <span className="font-normal text-soft"> · {sentAgo < 5 ? 'just now' : `${sentAgo}s ago`}</span> : null}
      </button>

      {nativeTracker() && !nativeNeeds.battery && !bad && (
        <button onClick={() => nativeTracker()?.openBatterySettings()} className="fixed bottom-16 left-4 z-40 rounded-full bg-amber-100 px-3.5 py-2 text-xs font-semibold text-amber-900 shadow-lg">Allow running in background</button>
      )}
      {bad && (t.permission !== 'denied' || !!nativeTracker()) && (
        <button onClick={() => restartTracking()} className="fixed bottom-4 left-40 z-40 rounded-full bg-ink px-3.5 py-2 text-xs font-semibold text-white shadow-lg">Restart sending</button>
      )}

      {asking && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" onClick={() => !busy && setAsking(false)}>
          <div className="w-full max-w-sm rounded-[1.75rem] bg-white p-5 shadow-panel" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-50 text-emerald-600"><MapPin className="h-5 w-5" /></span>
              <div>
                <p className="text-base font-semibold">Punch out for today?</p>
                <p className="text-xs text-soft">Your location sharing will stop.</p>
              </div>
            </div>
            {t.error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{t.error}</p>}
            {msg && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{msg}</p>}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button disabled={busy} onClick={() => setAsking(false)} className="rounded-2xl border border-line px-4 py-3 text-sm font-semibold disabled:opacity-50">Keep tracking</button>
              <button disabled={busy} onClick={confirmOut} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-ink px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"><LogOut className="h-4 w-4" />{busy ? 'Saving…' : 'Punch out'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
