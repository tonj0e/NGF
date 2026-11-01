'use client'
import { useEffect, useState } from 'react'
import { Session } from '@/types'
import PaymentChatPage, { ChatSettings } from './PaymentChatPage'
import PaymentMatchingPage from './PaymentMatchingPage'

type Tab = 'chat' | 'history' | 'mark' | 'bank' | 'settings'
type Access = { canMark: boolean; canChat: boolean; canHistory: boolean; canBank: boolean; canOverride: boolean; isGuarantor: boolean; isAdmin: boolean }

// The Payments module: one menu item, several parts. Which parts a person sees is decided by the permissions an Admin
// ticks for them (guarantor or staff). The server checks every request again.
export default function PaymentsPage({ session }: { session: Session }) {
  const [access, setAccess] = useState<Access | null>(null)
  const [tab, setTab] = useState<Tab>('chat')
  const [error, setError] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)

  useEffect(() => {
    fetch('/api/payments?view=me', { headers: { Authorization: `Bearer ${session.token}` } })
      .then(r => r.json())
      .then(j => {
        if (!j.success) throw new Error(j.error || 'Could not load')
        const a: Access = j.data.access
        setAccess(a)
        setTab(a.canChat ? 'chat' : a.canHistory ? 'history' : a.canMark ? 'mark' : a.canBank ? 'bank' : 'chat')
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Could not load'))
  }, [session])

  if (error) return <div className="rounded-2xl bg-white p-6 text-sm text-red-600">{error}</div>
  if (!access) return <div className="p-8 text-center text-sm text-soft">Loading…</div>

  const tabs: [Tab, string][] = [
    ...(access.canChat ? [['chat', 'Chat'] as [Tab, string]] : []),
    ...(access.canHistory || access.canMark ? [['history', 'Payment history'] as [Tab, string]] : []),
    ...(access.canMark ? [['mark', 'Mark manually'] as [Tab, string]] : []),
    ...(access.canBank ? [['bank', 'Bank check'] as [Tab, string]] : []),
    ...(access.isAdmin ? [['settings', 'Settings'] as [Tab, string]] : []),
  ]
  if (!tabs.length) return <div className="rounded-2xl bg-white p-6 text-sm text-soft">Payments is not switched on for you yet. Ask an Admin.</div>
  const current = tabs.some(([k]) => k === tab) ? tab : tabs[0][0]

  // A guarantor sees one chat screen, no tabs. Payment history opens on top of it and has a back arrow.
  if (access.isGuarantor && access.canChat && !access.canMark && !access.canBank && !access.isAdmin) {
    const canHistory = access.canHistory || access.canMark
    return (
      <>
        <PaymentChatPage session={session} onOpenHistory={canHistory ? () => setHistoryOpen(true) : undefined} />
        {historyOpen && (
          <div className="fixed inset-0 z-[55] flex flex-col bg-[#f0f2f5]">
            <div className="flex items-center gap-3 bg-[#075e54] px-3 py-3 text-white">
              <button onClick={() => setHistoryOpen(false)} aria-label="Back to chat" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/15">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
              </button>
              <p className="text-base font-semibold">Payment history</p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3"><PaymentMatchingPage session={session} fixedTab="records" /></div>
          </div>
        )}
      </>
    )
  }

  return (
    <div className="space-y-4">
      {tabs.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {tabs.map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${current === k ? 'bg-ink text-white' : 'bg-white text-gray-600 ring-1 ring-black/5'}`}>{label}</button>
          ))}
        </div>
      )}
      {current === 'chat' && <PaymentChatPage session={session} onOpenHistory={access.canHistory || access.canMark ? () => setTab('history') : undefined} />}
      {current === 'history' && <PaymentMatchingPage session={session} fixedTab="records" />}
      {current === 'mark' && <PaymentMatchingPage session={session} fixedTab="collect" />}
      {current === 'bank' && <PaymentMatchingPage session={session} fixedTab="bank" />}
      {current === 'settings' && <ChatSettings session={session} />}
    </div>
  )
}
