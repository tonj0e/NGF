'use client'
import { useEffect, useState } from 'react'
import { MapPin, LogOut } from 'lucide-react'
import { Session } from '@/types'
import { startAgentTracker, stopAgentTracker, punchOut, useAgentTracker } from '@/lib/agentTracker'

// Starts live location sharing for an agent for as long as they are signed in and punched in, whatever page they are on.
// A small pill at the bottom shows the state and lets the agent punch out at the end of the day.
export default function AgentTracker({ session }: { session: Session }) {
  const t = useAgentTracker()
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => { startAgentTracker(session.token); return () => stopAgentTracker() }, [session.token])

  if (t.phase !== 'tracking') return null
  const bad = !!t.error || t.permission === 'denied'

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
        {bad ? (t.permission === 'denied' ? 'Allow location' : 'Location problem') : 'Tracking on'}
      </button>

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
