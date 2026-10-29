'use client'
import { useEffect, useRef, useState } from 'react'
import { Session } from '@/types'
import { useNetworkLight } from './NetworkLight'
import { pendingDrafts } from '@/lib/verificationDraft'
import { nativeTracker } from '@/lib/agentTracker'

// Verifications the agent chose to "Submit later" (red light) wait on the phone. When the network turns orange or green, this asks
// the agent to send them: a pop-up inside the app and, when the app is in the background, a notification
// (the Android app's own service sends that one: see TrackerService).
export default function PendingSubmitPrompt({ session, onOpen }: { session: Session; onOpen: (leadId: string) => void }) {
  const net = useNetworkLight()
  const [list, setList] = useState<{ leadId: string; name: string }[]>([])
  const [open, setOpen] = useState(false)
  const asked = useRef(0)   // when the pop-up was last shown or dismissed

  useEffect(() => {
    const read = () => pendingDrafts(session.userId).then(setList)
    read()
    window.addEventListener('ngf:drafts', read)
    window.addEventListener('focus', read)
    return () => { window.removeEventListener('ngf:drafts', read); window.removeEventListener('focus', read) }
  }, [session.userId])

  // tell the Android service how many are waiting, so it can notify when the phone has good network
  useEffect(() => { nativeTracker()?.setPending({ count: list.length }).catch(() => {}) }, [list.length])

  const good = net.level === 'good' || net.level === 'average'
  useEffect(() => {
    if (!list.length || !good || open) return
    if (Date.now() - asked.current < 10 * 60_000) return
    asked.current = Date.now()
    setOpen(true)
    // a normal browser (not the Android app): a notification when the page is in the background
    if (!nativeTracker() && document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      navigator.serviceWorker?.ready.then(r => r.showNotification('Network is good now', { body: `Submit your saved verification${list.length > 1 ? 's' : ''} (${list.length}).`, tag: 'ngf-pending' })).catch(() => {})
    }
  }, [list.length, good, open])   // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !list.length) return null
  const close = () => { asked.current = Date.now(); setOpen(false) }
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-[1.75rem] bg-white p-5 shadow-panel">
        <p className="text-base font-semibold text-emerald-700">Network is good now</p>
        <p className="mt-1 text-sm text-soft">{list.length === 1 ? 'You have a saved verification waiting to be submitted.' : `You have ${list.length} saved verifications waiting to be submitted.`}</p>
        <div className="mt-3 grid gap-2">
          {list.map(d => (
            <button key={d.leadId} onClick={() => { close(); onOpen(d.leadId) }} className="flex items-center justify-between rounded-2xl bg-ink px-4 py-3 text-left text-sm font-semibold text-white">
              <span className="truncate">{d.name}</span><span className="ml-3 shrink-0 text-xs font-medium opacity-80">Submit now</span>
            </button>
          ))}
        </div>
        <button onClick={close} className="mt-3 w-full rounded-2xl border border-line px-4 py-3 text-sm font-semibold">Later</button>
      </div>
    </div>
  )
}
