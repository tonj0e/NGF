'use client'
import { useEffect, useRef, useState } from 'react'
import { Session } from '@/types'
import jsQR from 'jsqr'

export default function Login({ onLogin }: { onLogin: (s: Session) => void }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState<'login' | 'qr'>('login')
  const [preAuth, setPreAuth] = useState('')
  const [name, setName] = useState('')
  const [remember, setRemember] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const f = e.currentTarget
    const username = (f.elements.namedItem('username') as HTMLInputElement).value
    const password = (f.elements.namedItem('password') as HTMLInputElement).value
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, trust: localStorage.getItem('ngf_qrtrust') || '' }),
      })
      const json = await res.json()
      if (!json.success) { setError(json.error || 'Login failed'); return }
      if (json.data.needQr) {
        setPreAuth(json.data.preAuth)
        setName(json.data.name || '')
        setStep('qr')
      } else {
        onLogin({ ...json.data.user, token: json.data.token })
      }
    } catch { setError('Network error') } finally { setLoading(false) }
  }

  function finishLogin(json: any) {
    if (json.data.trust) localStorage.setItem('ngf_qrtrust', json.data.trust)
    onLogin({ ...json.data.user, token: json.data.token })
  }

  if (step === 'qr') {
    return <QrStep name={name} preAuth={preAuth} remember={remember} setRemember={setRemember}
      onVerified={finishLogin} onBack={() => { setStep('login'); setError('') }} />
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f5f7] px-4">
      <div className="w-full max-w-md rounded-[2rem] border border-white/70 bg-white p-8 shadow-panel">
        <div className="text-center">
          <div className="inline-flex rounded-full bg-[#f4f5f7] px-4 py-2 text-xs font-semibold uppercase tracking-widest text-[#697586]">
            NGF FINCORP
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-2 text-sm text-[#697586]">Finance operations platform</p>
        </div>
        <form onSubmit={handleSubmit} className="mt-8 space-y-4 no-upper-form" data-no-upper-form>
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Username</span>
            <input name="username" required autoCapitalize="none" autoCorrect="off" autoComplete="username" data-no-upper
              className="w-full rounded-2xl border border-[#e5e7eb] bg-[#f4f5f7] px-4 py-3 text-sm outline-none focus:border-[#1a1a2e] focus:bg-white transition" />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Password</span>
            <input name="password" type="password" required autoComplete="current-password" data-no-upper
              className="w-full rounded-2xl border border-[#e5e7eb] bg-[#f4f5f7] px-4 py-3 text-sm outline-none focus:border-[#1a1a2e] focus:bg-white transition" />
          </label>
          {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full rounded-2xl bg-[#1a1a2e] px-4 py-3 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-60">
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
          <div className="mt-4 text-center text-sm">
            <a href="/auth/forgot-password" className="font-medium text-[#1a1a2e] hover:underline">
              Forgot Password?
            </a>
          </div>
        </form>
      </div>
    </div>
  )
}

function QrStep({ name, preAuth, remember, setRemember, onVerified, onBack }: {
  name: string; preAuth: string; remember: boolean; setRemember: (b: boolean) => void
  onVerified: (json: any) => void; onBack: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number>(0)
  const busyRef = useRef(false)
  const [error, setError] = useState('')
  const [verifying, setVerifying] = useState(false)
  // keep latest "remember" without restarting the camera
  const rememberRef = useRef(remember)
  rememberRef.current = remember

  function stopCamera() {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  async function verify(uid: string) {
    if (busyRef.current) return
    busyRef.current = true
    setVerifying(true)
    setError('')
    try {
      const res = await fetch('/api/auth/verify-qr', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preAuth, uid, remember: rememberRef.current }),
      })
      const json = await res.json()
      if (json.success) { stopCamera(); onVerified(json) }
      else { setError(json.error || 'Verification failed'); busyRef.current = false; setVerifying(false) }
    } catch { setError('Network error'); busyRef.current = false; setVerifying(false) }
  }

  function tick() {
    const video = videoRef.current, canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2 || video.videoWidth === 0) { rafRef.current = requestAnimationFrame(tick); return }
    canvas.width = video.videoWidth; canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) { rafRef.current = requestAnimationFrame(tick); return }
    ctx.drawImage(video, 0, 0)
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const code = jsQR(img.data, img.width, img.height)
    if (code?.data && !busyRef.current) {
      try {
        const d = JSON.parse(code.data)
        if (d.t === 'NGF_ID' && d.uid) { verify(d.uid); return }
      } catch {}
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  useEffect(() => {
    let cancelled = false
    const start = async () => {
      const constraints = [{ video: { facingMode: { exact: 'environment' } } }, { video: { facingMode: 'environment' } }, { video: true }]
      let stream: MediaStream | null = null
      for (const c of constraints) { try { stream = await navigator.mediaDevices.getUserMedia(c); break } catch {} }
      if (cancelled) { stream?.getTracks().forEach(t => t.stop()); return }
      if (!stream) { setError('Camera unavailable. Check permissions.'); return }
      streamRef.current = stream
      const video = videoRef.current
      if (!video) return
      video.srcObject = stream; video.muted = true; video.playsInline = true
      try { await video.play() } catch {}
      rafRef.current = requestAnimationFrame(tick)
    }
    const t = setTimeout(start, 80)
    return () => { cancelled = true; clearTimeout(t); stopCamera() }
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f5f7] px-4">
      <div className="w-full max-w-md rounded-[2rem] border border-white/70 bg-white p-8 shadow-panel">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Scan your ID card</h1>
          <p className="mt-2 text-sm text-[#697586]">{name ? `Hi ${name}, ` : ''}point the QR on your ID card at the camera to finish signing in.</p>
        </div>

        <div className="mt-6 relative aspect-square overflow-hidden rounded-2xl bg-black">
          <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" playsInline autoPlay muted />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-44 w-44 rounded-2xl border-2 border-white/70" />
          </div>
          {verifying && <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-sm font-medium text-white">Verifying…</div>}
          <canvas ref={canvasRef} className="hidden" />
        </div>

        {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

        <label className="mt-4 flex items-center gap-2 text-sm text-[#1a1a2e]">
          <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} className="h-4 w-4 accent-[#1a1a2e]" />
          Remember this device (skip QR until I log out)
        </label>

        <button onClick={onBack}
          className="mt-4 w-full rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm font-semibold text-[#697586] hover:bg-[#f4f5f7] transition">
          Back
        </button>
      </div>
    </div>
  )
}
