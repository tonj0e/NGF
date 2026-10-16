'use client'
import { useEffect, useState } from 'react'
import { Session } from '@/types'

export default function NotificationsPage({ session }: { session: Session }) {
  const [notifs, setNotifs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    const res = await fetch('/api/notifications', { headers: { Authorization: `Bearer ${session.token}` } })
    const json = await res.json()
    if (json.success) setNotifs(json.data.rows)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function markRead(notificationId: string) {
    await fetch('/api/notifications', {
      method: 'PATCH', headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationId }),
    })
    load()
  }

  if (loading) return <div className="flex h-40 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-[#1a1a2e] border-t-transparent" /></div>

  return (
    <div className="space-y-3">
      {notifs.length === 0 && <p className="rounded-2xl border border-dashed border-[#e5e7eb] bg-white p-8 text-center text-sm text-[#697586]">No notifications.</p>}
      {notifs.map(n => (
        <div key={n.notificationId} className={`rounded-[1.6rem] border bg-white p-5 shadow-panel ${n.isRead === 'true' ? 'border-white/70 opacity-60' : 'border-[#1a1a2e]/20'}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold">{n.title}</p>
              <p className="mt-1 text-sm text-[#697586]">{n.message}</p>
              <p className="mt-2 text-xs text-[#697586]">{n.createdAt?.slice(0, 16).replace('T', ' ')}</p>
            </div>
            {n.isRead !== 'true' && (
              <button onClick={() => markRead(n.notificationId)} className="shrink-0 rounded-xl bg-[#f4f5f7] px-3 py-1.5 text-xs font-semibold">Mark read</button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
