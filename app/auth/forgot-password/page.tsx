'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

type Step = 'email' | 'otp' | 'password' | 'done'

const POLICY_HINT = 'At least 10 characters, with at least three of: lowercase, uppercase, number, symbol.'
const inputCls =
  'w-full rounded-2xl border border-[#e5e7eb] bg-[#f4f5f7] px-4 py-3 text-sm outline-none focus:border-[#1a1a2e] focus:bg-white transition'
const primaryBtn =
  'w-full rounded-2xl bg-[#1a1a2e] px-4 py-3 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-60'

function fmt(sec: number) {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
}

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [resetToken, setResetToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [failedTries, setFailedTries] = useState(0)
  // Development only: the server answers 404 in production, so this stays null there
  const [devEmailConfigured, setDevEmailConfigured] = useState<boolean | null>(null)

  // Resend cooldown and code expiry come from the server response and are tracked as absolute timestamps,
  // so the countdown stays accurate even when the browser throttles timers in a background tab.
  const [cooldownUntil, setCooldownUntil] = useState(0)
  const [expiresAt, setExpiresAt] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const cooldown = Math.max(0, Math.ceil((cooldownUntil - now) / 1000))
  const expiresIn = Math.max(0, Math.ceil((expiresAt - now) / 1000))

  useEffect(() => {
    fetch('/api/auth/email-config')
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (j?.success) setDevEmailConfigured(!!j.data.emailConfigured) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    timer.current = setInterval(() => setNow(Date.now()), 1000)
    // Browsers throttle timers in background tabs: refresh immediately when the user comes back
    const refresh = () => setNow(Date.now())
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      if (timer.current) clearInterval(timer.current)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [])

  async function post(url: string, body: unknown) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const json = await res.json().catch(() => ({}))
    return { res, json }
  }

  async function requestCode(isResend = false) {
    setError(''); setNotice('')
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError('Enter a valid email address'); return }
    setLoading(true)
    try {
      const { res, json } = await post('/api/auth/forgot', { email: email.trim() })
      if (res.status === 429) { setError(json.error || 'Too many requests. Please wait a minute and try again.'); return }
      if (!res.ok || !json.success) { setError(json.error || 'Something went wrong. Please try again.'); return }
      const t = Date.now()
      setNow(t)
      setCooldownUntil(t + (json.data.cooldownSeconds ?? 60) * 1000)
      setExpiresAt(t + (json.data.expiresInMinutes ?? 10) * 60_000)
      setOtp(''); setFailedTries(0)
      setNotice(json.data.message)
      setStep('otp')
      if (isResend) setNotice(`A new code was requested. ${json.data.message}`)
    } catch {
      setError('Network error. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  async function submitOtp(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setNotice('')
    if (!/^\d{6}$/.test(otp)) { setError('Enter the 6-digit code'); return }
    if (expiresIn === 0) { setError('This code has expired. Request a new one.'); return }
    setLoading(true)
    try {
      const { res, json } = await post('/api/auth/verify-otp', { email: email.trim(), otp })
      if (res.status === 429) { setError(json.error || 'Too many attempts. Please wait a minute and try again.'); return }
      if (!res.ok || !json.success) {
        const n = failedTries + 1
        setFailedTries(n)
        setError(n >= 5 ? 'Too many incorrect attempts. Request a new code.' : (json.error || 'Incorrect code'))
        return
      }
      setResetToken(json.data.resetToken)
      setStep('password')
    } catch {
      setError('Network error. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 10) { setError('Password must be at least 10 characters long'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setLoading(true)
    try {
      const { res, json } = await post('/api/auth/reset', { resetToken, password })
      if (!res.ok || !json.success) {
        setError(json.error || 'Could not update the password')
        if (/start again|expired/i.test(json.error || '')) { setStep('email'); setResetToken('') }
        return
      }
      setPassword(''); setConfirm(''); setResetToken('')
      setStep('done')
    } catch {
      setError('Network error. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  const titles: Record<Step, { h: string; p: string }> = {
    email: { h: 'Forgot Password', p: 'Enter the email address registered to your account and we will send a verification code.' },
    otp: { h: 'Enter Verification Code', p: 'Enter the 6-digit code from the email. It can be used once.' },
    password: { h: 'Set New Password', p: POLICY_HINT },
    done: { h: 'Password Updated', p: 'Your password has been changed. Any other signed-in sessions have been signed out.' },
  }
  const stepNo = { email: 1, otp: 2, password: 3, done: 4 }[step]

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f5f7] px-4 py-8">
      <div className="w-full max-w-md rounded-[2rem] border border-white/70 bg-white p-6 shadow-panel sm:p-8">
        <div className="text-center">
          <div className="inline-flex rounded-full bg-[#f4f5f7] px-4 py-2 text-xs font-semibold uppercase tracking-widest text-[#697586]">
            NGF FINCORP
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">{titles[step].h}</h1>
          <p className="mt-2 text-sm text-[#697586]">{titles[step].p}</p>
          <div className="mt-4 flex justify-center gap-1.5" aria-label={`Step ${stepNo} of 4`}>
            {[1, 2, 3, 4].map(n => (
              <span key={n} className={`h-1.5 w-8 rounded-full ${n <= stepNo ? 'bg-[#1a1a2e]' : 'bg-[#e5e7eb]'}`} />
            ))}
          </div>
        </div>

        {devEmailConfigured === false && (
          <div role="status" data-testid="dev-email-banner"
            className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            <strong>Development:</strong> email delivery is not configured (RESEND_API_KEY / EMAIL_FROM), so no
            verification email will be sent. This notice is not shown in production.
          </div>
        )}

        {notice && step !== 'done' && (
          <div role="status" className="mt-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{notice}</div>
        )}
        {error && (
          <div role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
        )}

        {step === 'email' && (
          <form onSubmit={e => { e.preventDefault(); requestCode() }} className="mt-6 space-y-4" noValidate>
            <label className="block">
              <span className="mb-2 block text-sm font-medium">Email Address</span>
              <input name="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required
                autoComplete="email" autoCapitalize="none" autoCorrect="off" inputMode="email" data-no-upper
                className={inputCls} />
            </label>
            <button type="submit" disabled={loading} className={primaryBtn}>
              {loading ? 'Requesting…' : 'Send Verification Code'}
            </button>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={submitOtp} className="mt-6 space-y-4" noValidate>
            <p className="text-center text-xs text-[#697586]">Code requested for <span className="font-medium text-[#1a1a2e]">{email.trim()}</span></p>
            <label className="block">
              <span className="mb-2 block text-sm font-medium">Verification Code</span>
              <input name="otp" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} data-no-upper autoFocus
                placeholder="000000"
                className={`${inputCls} text-center font-mono text-2xl tracking-[0.5em]`} />
            </label>
            <p className={`text-center text-xs ${expiresIn === 0 ? 'font-medium text-red-600' : 'text-[#697586]'}`}>
              {expiresIn === 0 ? 'This code has expired. Request a new one.' : `Code expires in ${fmt(expiresIn)}`}
            </p>
            <button type="submit" disabled={loading || otp.length !== 6 || expiresIn === 0} className={primaryBtn}>
              {loading ? 'Verifying…' : 'Verify Code'}
            </button>
            <div className="flex items-center justify-between text-sm">
              <button type="button" onClick={() => { setStep('email'); setError(''); setNotice('') }}
                className="text-[#697586] hover:underline">Change email</button>
              <button type="button" onClick={() => requestCode(true)} disabled={loading || cooldown > 0}
                className="font-medium text-[#1a1a2e] hover:underline disabled:cursor-not-allowed disabled:text-[#9aa3af] disabled:no-underline">
                {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
              </button>
            </div>
          </form>
        )}

        {step === 'password' && (
          <form onSubmit={submitPassword} className="mt-6 space-y-4" noValidate>
            <label className="block">
              <span className="mb-2 block text-sm font-medium">New Password</span>
              <input name="newPassword" type={showPw ? 'text' : 'password'} value={password}
                onChange={e => setPassword(e.target.value)} autoComplete="new-password" data-no-upper autoFocus
                className={inputCls} />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium">Confirm New Password</span>
              <input name="confirmPassword" type={showPw ? 'text' : 'password'} value={confirm}
                onChange={e => setConfirm(e.target.value)} autoComplete="new-password" data-no-upper
                className={inputCls} />
            </label>
            <label className="flex items-center gap-2 text-xs text-[#697586]">
              <input type="checkbox" checked={showPw} onChange={e => setShowPw(e.target.checked)} className="h-3.5 w-3.5" />
              Show passwords
            </label>
            <button type="submit" disabled={loading} className={primaryBtn}>
              {loading ? 'Updating…' : 'Update Password'}
            </button>
          </form>
        )}

        {step === 'done' && (
          <div className="mt-6 space-y-4">
            <div role="status" className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">
              Password updated successfully.
            </div>
            <Link href="/" className={`${primaryBtn} block text-center`}>Go to Sign in</Link>
          </div>
        )}

        {step !== 'done' && (
          <div className="mt-6 text-center text-sm">
            <p className="text-[#697586]">
              Remember your password?{' '}
              <Link href="/" className="font-medium text-[#1a1a2e] hover:underline">Sign in</Link>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
