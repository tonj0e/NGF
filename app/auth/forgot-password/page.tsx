'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

type Step = 'user' | 'otp' | 'password' | 'done'

const POLICY_HINT = 'At least 10 characters, with at least three of: lowercase, uppercase, number, symbol.'
const inputCls =
  'w-full rounded-2xl border border-black/10 bg-white/70 px-4 py-3 text-sm text-black outline-none focus:border-black focus:bg-white transition'
const primaryBtn =
  'w-full rounded-2xl bg-black px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#1f1f1f] disabled:opacity-60'

function fmt(sec: number) {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
}

const CSS = `
.fp-band{position:absolute;border-radius:9999px;background:linear-gradient(120deg,rgba(0,0,0,.10),rgba(0,0,0,.02));filter:blur(2px);transform:rotate(-24deg)}
.fp-band-a{width:140%;height:90px;left:-20%;top:12%;animation:fp-drift 14s ease-in-out infinite alternate}
.fp-band-b{width:130%;height:150px;left:-10%;top:48%;background:linear-gradient(120deg,rgba(0,0,0,.07),rgba(0,0,0,.015));animation:fp-drift 18s ease-in-out infinite alternate-reverse}
.fp-band-c{width:120%;height:60px;left:-10%;top:78%;animation:fp-drift 11s ease-in-out infinite alternate}
@keyframes fp-drift{from{transform:translateX(-4%) rotate(-24deg)}to{transform:translateX(5%) rotate(-24deg)}}
.fp-card{animation:fp-rise .6s cubic-bezier(.2,.8,.2,1) both}
@keyframes fp-rise{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}
.fp-key{animation:fp-rise .7s .1s cubic-bezier(.2,.8,.2,1) both}
.fp-stage{display:block}
.fp-box{position:absolute;left:50%;top:50%;width:40px;height:52px;margin:-26px 0 0 -20px;transform:translateX(var(--x));animation:fp-in .5s var(--d) cubic-bezier(.2,.8,.2,1) both}
@keyframes fp-in{from{opacity:0;transform:translateX(var(--x)) translateY(14px)}to{opacity:1;transform:translateX(var(--x))}}
.fp-digit{width:100%;height:100%;border-radius:12px;border:1.5px solid rgba(0,0,0,.18);background:rgba(255,255,255,.8);text-align:center;font-size:22px;font-weight:700;color:#000;outline:none;box-shadow:0 4px 14px rgba(0,0,0,.08);transition:border-color .2s,box-shadow .2s,transform .2s}
.fp-digit:focus{border-color:#000;box-shadow:0 0 0 4px rgba(0,0,0,.08),0 6px 18px rgba(0,0,0,.12);transform:translateY(-2px)}
.fp-filled{border-color:#000;background:#fff}
.fp-tick{position:absolute;left:50%;top:50%;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:16px;border:2px solid #059669;background:#ecfdf5;color:#059669;display:flex;align-items:center;justify-content:center;opacity:0;transform:scale(.3) rotate(-30deg);pointer-events:none}
.fp-tick-path{stroke-dasharray:24;stroke-dashoffset:24}
.fp-stage[data-state=verifying] .fp-box{animation:fp-gather .5s ease-out both,fp-orbit 1.5s .5s linear infinite}
.fp-stage[data-state=verifying] .fp-box:nth-child(even){animation-direction:normal,reverse}
.fp-stage[data-state=verifying] .fp-digit{transform:none;border-color:#000;background:#fff}
@keyframes fp-gather{to{transform:rotate(var(--a)) translateX(56px) rotate(calc(var(--a) * -1))}}
@keyframes fp-orbit{from{transform:rotate(var(--a)) translateX(56px) rotate(calc(var(--a) * -1))}to{transform:rotate(calc(var(--a) + 360deg)) translateX(56px) rotate(calc(var(--a) * -1 - 720deg))}}
.fp-stage[data-state=success] .fp-box{animation:fp-merge .55s ease-in both}
@keyframes fp-merge{from{transform:rotate(var(--a)) translateX(56px) rotate(calc(var(--a) * -1));opacity:1}to{transform:rotate(var(--a)) translateX(0) rotate(calc(var(--a) * -1)) scale(.2);opacity:0}}
.fp-stage[data-state=success] .fp-tick{animation:fp-pop .6s .45s cubic-bezier(.2,1.4,.4,1) forwards}
.fp-stage[data-state=success] .fp-tick-path{animation:fp-draw .45s .9s ease-out forwards}
@keyframes fp-pop{to{opacity:1;transform:scale(1) rotate(0);box-shadow:0 0 0 10px rgba(5,150,105,.12),0 0 40px rgba(5,150,105,.3)}}
@keyframes fp-draw{to{stroke-dashoffset:0}}
.fp-shake{animation:fp-shake .45s}
@keyframes fp-shake{20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}
@media (prefers-reduced-motion:reduce){.fp-band,.fp-card,.fp-key,.fp-box{animation:none!important}.fp-stage[data-state=verifying] .fp-box{animation:none!important}}
`

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>('user')
  const [username, setUsername] = useState('')
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [resetToken, setResetToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [failedTries, setFailedTries] = useState(0)
  // OTP screen animation: boxes orbit while the code is checked, then a green tick confirms it
  const [vstate, setVstate] = useState<'idle' | 'verifying' | 'success'>('idle')
  const [shake, setShake] = useState(0)
  const boxes = useRef<(HTMLInputElement | null)[]>([])
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
    if (!username.trim()) { setError('Enter your user ID'); return }
    setLoading(true)
    try {
      const { res, json } = await post('/api/auth/forgot', { username: username.trim() })
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

  async function submitOtp(e?: React.FormEvent) {
    e?.preventDefault()
    if (vstate !== 'idle') return
    setError(''); setNotice('')
    if (!/^\d{6}$/.test(otp)) { setError('Enter the 6-digit code'); return }
    if (expiresIn === 0) { setError('This code has expired. Request a new one.'); return }
    setLoading(true); setVstate('verifying')
    try {
      // keep the orbit animation on screen for a moment even when the server answers instantly
      const [{ res, json }] = await Promise.all([post('/api/auth/verify-otp', { username: username.trim(), otp }), new Promise(r => setTimeout(r, 1500))])
      if (res.status === 429) { setVstate('idle'); setShake(n => n + 1); setError(json.error || 'Too many attempts. Please wait a minute and try again.'); return }
      if (!res.ok || !json.success) {
        const n = failedTries + 1
        setFailedTries(n); setVstate('idle'); setShake(k => k + 1)
        setError(n >= 5 ? 'Too many incorrect attempts. Request a new code.' : (json.error || 'Incorrect code'))
        return
      }
      setResetToken(json.data.resetToken)
      setVstate('success')
      await new Promise(r => setTimeout(r, 1400))
      setStep('password'); setVstate('idle')
    } catch {
      setVstate('idle')
      setError('Network error. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  function setDigit(i: number, v: string) {
    const d = v.replace(/\D/g, '')
    if (!d) { setOtp(o => (o.slice(0, i) + o.slice(i + 1)).slice(0, 6)); return }
    const chars = otp.padEnd(6, ' ').split('')
    d.slice(0, 6 - i).split('').forEach((c, k) => { chars[i + k] = c })
    const next = chars.join('').replace(/ /g, '').slice(0, 6)
    setOtp(next)
    boxes.current[Math.min(i + d.length, 5)]?.focus()
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
        if (/start again|expired/i.test(json.error || '')) { setStep('user'); setResetToken('') }
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
    user: { h: 'Forgot Password', p: 'Enter your user ID. We will send a verification code to the email saved on your account.' },
    otp: { h: 'Enter Verification Code', p: 'Enter the 6-digit code from the email sent for this user ID. It can be used once.' },
    password: { h: 'Set New Password', p: POLICY_HINT },
    done: { h: 'Password Updated', p: 'Your password has been changed. Any other signed-in sessions have been signed out.' },
  }
  const stepNo = { user: 1, otp: 2, password: 3, done: 4 }[step]

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-white px-4 py-8">
      <style>{CSS}</style>
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="fp-band fp-band-a" /><div className="fp-band fp-band-b" /><div className="fp-band fp-band-c" />
      </div>
      <div className="fp-card relative w-full max-w-md rounded-[2rem] border border-white/80 bg-white/55 p-6 text-[#0a0a0a] shadow-[0_24px_70px_rgba(0,0,0,0.14)] ring-1 ring-black/5 backdrop-blur-2xl sm:p-8">
        <span aria-hidden className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent" />
        <div className="text-center">
          <div className="inline-flex rounded-full bg-mist px-4 py-2 text-xs font-semibold uppercase tracking-widest text-soft">
            NGF FINCORP
          </div>
          {step === 'otp' && (
            <div className={`fp-key mx-auto mt-4 flex h-11 w-11 items-center justify-center rounded-2xl border ${vstate === 'success' ? 'border-emerald-500/40 bg-emerald-50 text-emerald-600' : 'border-black/10 bg-white/70 text-black'}`}>
              {vstate === 'success'
                ? <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3z" /><path d="M9 12l2 2 4-4" /></svg>
                : <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="15" r="4" /><path d="M10.8 12.2L20 3M16 7l3 3M14 9l2 2" /></svg>}
            </div>
          )}
          <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
            {step === 'otp' ? (vstate === 'success' ? <>Verified <span className="text-emerald-600">Successfully</span></> : 'Verify OTP') : titles[step].h}
          </h1>
          <p className="mt-2 text-sm text-gray-600">{step === 'otp' && vstate === 'success' ? 'Your security code has been confirmed.' : titles[step].p}</p>
          <div className="mt-4 flex justify-center gap-1.5" aria-label={`Step ${stepNo} of 4`}>
            {[1, 2, 3, 4].map(n => (
              <span key={n} className={`h-1.5 w-8 rounded-full ${n <= stepNo ? 'bg-ink' : 'bg-line'}`} />
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

        {step === 'user' && (
          <form onSubmit={e => { e.preventDefault(); requestCode() }} className="mt-6 space-y-4" noValidate>
            <label className="block">
              <span className="mb-2 block text-sm font-medium">User ID</span>
              <input name="username" type="text" value={username} onChange={e => setUsername(e.target.value)} required
                autoComplete="username" autoCapitalize="none" autoCorrect="off" data-no-upper autoFocus
                className={inputCls} />
            </label>
            <button type="submit" disabled={loading} className={primaryBtn}>
              {loading ? 'Requesting…' : 'Send Verification Code'}
            </button>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={submitOtp} className="mt-6 space-y-4" noValidate>
            <p className="text-center text-xs text-gray-600">Code requested for user ID <span className="font-semibold text-black">{username.trim()}</span></p>
            <div key={shake} className={`fp-stage relative mx-auto h-[150px] w-full max-w-[300px] ${shake ? 'fp-shake' : ''}`} data-state={vstate}>
              {[0, 1, 2, 3, 4, 5].map(i => (
                <div key={i} className="fp-box" style={{ ['--x' as string]: `${(i - 2.5) * 46}px`, ['--a' as string]: `${i * 60}deg`, ['--d' as string]: `${i * 70}ms` }}>
                  <input
                    ref={el => { boxes.current[i] = el }}
                    value={otp[i] || ''} inputMode="numeric" pattern="\d*" maxLength={6} data-no-upper
                    autoComplete={i === 0 ? 'one-time-code' : 'off'} autoFocus={i === 0} disabled={vstate !== 'idle'}
                    aria-label={`Digit ${i + 1} of 6`}
                    onChange={e => setDigit(i, e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Backspace' && !otp[i] && i > 0) { boxes.current[i - 1]?.focus() }
                      if (e.key === 'ArrowLeft' && i > 0) boxes.current[i - 1]?.focus()
                      if (e.key === 'ArrowRight' && i < 5) boxes.current[i + 1]?.focus()
                    }}
                    onFocus={e => e.target.select()}
                    className={`fp-digit ${otp[i] ? 'fp-filled' : ''}`} />
                </div>
              ))}
              <div className="fp-tick" aria-hidden>
                <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path className="fp-tick-path" d="M5 12.5l4.5 4.5L19 7.5" /></svg>
              </div>
            </div>
            <p className={`text-center text-xs ${expiresIn === 0 ? 'font-medium text-red-600' : 'text-gray-600'}`}>
              {expiresIn === 0 ? 'This code has expired. Request a new one.' : `Code expires in ${fmt(expiresIn)}`}
            </p>
            <p className="text-center text-xs text-gray-600">
              Didn&apos;t receive the code?{' '}
              <button type="button" onClick={() => requestCode(true)} disabled={loading || cooldown > 0 || vstate !== 'idle'}
                className="font-semibold text-black hover:underline disabled:cursor-not-allowed disabled:text-gray-400 disabled:no-underline">
                {cooldown > 0 ? `Resend in ${fmt(cooldown)}` : 'Resend code'}
              </button>
            </p>
            <button type="submit" disabled={vstate === 'verifying' || (vstate === 'idle' && (otp.length !== 6 || expiresIn === 0))}
              className={`${primaryBtn} flex items-center justify-center gap-2 transition-colors duration-500 disabled:opacity-100 ${vstate === 'success' ? '!bg-emerald-600' : ''}`}>
              {vstate === 'verifying' && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
              {vstate === 'success' && <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
              {vstate === 'verifying' ? 'Verifying Code…' : vstate === 'success' ? 'Verified & Secured' : 'Verify & Proceed'}
            </button>
            <div className="text-center text-sm">
              <button type="button" disabled={vstate !== 'idle'} onClick={() => { setStep('user'); setError(''); setNotice(''); setOtp('') }}
                className="text-gray-600 hover:underline disabled:opacity-50">Change user ID</button>
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
            <label className="flex items-center gap-2 text-xs text-soft">
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
            <p className="text-soft">
              Remember your password?{' '}
              <Link href="/" className="font-medium text-ink hover:underline">Sign in</Link>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
