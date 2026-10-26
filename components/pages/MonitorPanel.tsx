'use client'
// Dev > Error tracking: paste the Sentry key, send a test error, and how to get the phone alert.
import { useState } from 'react'
import * as Sentry from '@sentry/nextjs'
import { Session } from '@/types'
import { apiSend } from '@/lib/clientApi'
import IntegrationFields from './IntegrationFields'

export default function MonitorPanel({ session }: { session: Session }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function test() {
    setBusy(true); setMsg(null)
    const r = await apiSend<{ sent: boolean }>(session.token, 'POST', '/api/monitor-test', {})
    // and one from this browser, so both kinds of report are checked
    try { Sentry.captureException(new Error('Test error from the NGF Dev panel (browser). Safe to ignore.')); await Sentry.flush(3000) } catch { /* browser side not started yet */ }
    setBusy(false)
    setMsg(r.ok ? { ok: true, text: 'Two test errors were sent (one from the server, one from this browser). Open Sentry > Issues: they appear within a minute.' } : { ok: false, text: r.error || 'Could not send the test' })
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[1.75rem] border border-white/70 bg-white p-6 shadow-panel space-y-3">
        <div>
          <p className="text-sm font-semibold">Error tracking (Sentry)</p>
          <p className="text-xs text-[#697586]">Tells you the moment something breaks: which page, which browser, which line, and which user. Paste the key once. It is saved encrypted and used straight away, with no rebuild. Passwords, OTPs, tokens and bank or ID numbers are never sent.</p>
        </div>
        <IntegrationFields session={session} group="monitor" />
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={test} disabled={busy} className="rounded-2xl bg-[#1a1a2e] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Sending…' : 'Send test error'}</button>
          {msg && <span className={`text-xs ${msg.ok ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</span>}
        </div>
      </div>
      <div className="rounded-[1.75rem] border border-white/70 bg-white p-6 shadow-panel space-y-2 text-sm">
        <p className="font-semibold">Get the alert on your phone (one time, in Sentry)</p>
        <ol className="list-decimal space-y-1 pl-5 text-xs text-[#697586]">
          <li>Sentry &gt; <b>Alerts</b> &gt; <b>Create Alert</b>. Choose <b>Issues</b>, then the condition <b>A new issue is created</b>. Send it to your email.</li>
          <li>Create a second alert: <b>number of errors in 1 hour is above 10</b>, to your email.</li>
          <li>On your phone, turn on notifications for that email (or install the Sentry app).</li>
        </ol>
        <p className="text-xs text-[#697586]">Each error from the server also carries a short <b>request id</b>. If a user reports a problem, search that id in Sentry or in the Hostinger log.</p>
      </div>
    </div>
  )
}
