'use client'
import { useEffect, useState } from 'react'
import { Session } from '@/types'
import QRCode from 'qrcode'
import { buildIdCardHtml, idCardPayload, IdCardUser } from '@/lib/idCard'

// Resize an uploaded image to a small JPEG data URL so it fits in a sheet cell
function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const max = 260
        const scale = Math.min(1, max / Math.max(img.width, img.height))
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.7))
      }
      img.onerror = reject
      img.src = reader.result as string
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function MyIdCardPage({ session }: { session: Session }) {
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [photo, setPhoto] = useState('')
  const [bloodGroup, setBloodGroup] = useState('')
  const [emergencyContact, setEmergencyContact] = useState('')
  const [place, setPlace] = useState('')
  const [toast, setToast] = useState('')

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(''), 3000) }

  async function load() {
    const res = await fetch('/api/profile', { headers: { Authorization: `Bearer ${session.token}` } })
    const j = await res.json()
    if (j.success) {
      setProfile(j.data)
      setPhoto(j.data.photo || '')
      setBloodGroup(j.data.bloodGroup || '')
      setEmergencyContact(j.data.emergencyContact || '')
      setPlace(j.data.place || '')
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function onPhoto(file: File | null) {
    if (!file) return
    try { setPhoto(await resizeImage(file)) } catch { showToast('Could not read image.') }
  }

  async function save() {
    setSaving(true)
    try {
      const res = await fetch('/api/profile', {
        method: 'POST', headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo, bloodGroup, emergencyContact, place }),
      })
      const j = await res.json()
      if (j.success) { showToast('Saved.'); load() } else showToast(j.error || 'Failed')
    } finally { setSaving(false) }
  }

  async function printCard() {
    if (!profile) return
    const user: IdCardUser = {
      userId: profile.userId, username: profile.username, name: profile.name, role: profile.role,
      code: profile.guarantorCode, guarantorId: profile.guarantorId, cardNumber: profile.cardNumber,
      createdAt: profile.createdAt, photoDataUrl: photo, bloodGroup, emergencyContact, place,
    }
    const qr = await QRCode.toDataURL(idCardPayload(user), { width: 240, margin: 1, color: { dark: '#111111', light: '#ffffff' } })
    const w = window.open('', '_blank')
    if (!w) { showToast('Allow pop-ups to print the ID card.'); return }
    w.document.write(buildIdCardHtml(user, qr, window.location.origin + '/ngflogo.png')); w.document.close()
  }

  if (loading) return <div className="flex h-40 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-[#1a1a2e] border-t-transparent" /></div>

  return (
    <div className="space-y-5 max-w-2xl">
      {toast && <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-2xl bg-[#1a1a2e] px-5 py-3 text-sm font-medium text-white shadow-lg">{toast}</div>}

      <div className="rounded-[1.75rem] border border-white/70 bg-white p-6 shadow-panel space-y-5">
        <div>
          <p className="text-sm font-semibold">My ID Card</p>
          <p className="mt-1 text-xs text-[#697586]">Upload your photo and fill these details. They print on your ID card.</p>
        </div>

        <div className="flex items-center gap-5">
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-full border-2 border-[#e5e7eb] bg-[#f4f5f7] flex items-center justify-center">
            {photo
              ? <img src={photo} alt="profile" className="h-full w-full object-cover" />
              : <span className="text-3xl font-bold text-[#697586]">{(profile?.name || '?').charAt(0)}</span>}
          </div>
          <div>
            <p className="font-semibold">{profile?.name}</p>
            <p className="text-xs text-[#697586]">{profile?.guarantorId} · ID {profile?.cardNumber}</p>
            <label className="mt-2 inline-block cursor-pointer rounded-xl border border-[#e5e7eb] bg-white px-3 py-1.5 text-xs font-semibold hover:bg-[#f4f5f7] transition">
              Upload Photo
              <input type="file" accept="image/*" className="hidden" onChange={e => onPhoto(e.target.files?.[0] || null)} />
            </label>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[#697586]">Blood Group</span>
            <input value={bloodGroup} onChange={e => setBloodGroup(e.target.value)} placeholder="e.g. O+"
              className="w-full rounded-2xl border border-[#e5e7eb] bg-[#f4f5f7] px-4 py-3 text-sm outline-none focus:border-[#1a1a2e] focus:bg-white" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[#697586]">Emergency Contact</span>
            <input value={emergencyContact} onChange={e => setEmergencyContact(e.target.value)} data-no-upper placeholder="Phone number"
              className="w-full rounded-2xl border border-[#e5e7eb] bg-[#f4f5f7] px-4 py-3 text-sm outline-none focus:border-[#1a1a2e] focus:bg-white" />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[#697586]">Place</span>
            <input value={place} onChange={e => setPlace(e.target.value)} placeholder="Place / locality"
              className="w-full rounded-2xl border border-[#e5e7eb] bg-[#f4f5f7] px-4 py-3 text-sm outline-none focus:border-[#1a1a2e] focus:bg-white" />
          </label>
        </div>

        <div className="flex gap-3">
          <button onClick={save} disabled={saving}
            className="rounded-2xl bg-[#1a1a2e] px-6 py-3 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Details'}
          </button>
          <button onClick={printCard}
            className="rounded-2xl border border-[#e5e7eb] px-6 py-3 text-sm font-semibold hover:bg-[#f4f5f7] transition">
            Print ID Card
          </button>
        </div>
      </div>
    </div>
  )
}
