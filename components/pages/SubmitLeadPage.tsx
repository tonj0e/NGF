'use client'
import { useState } from 'react'
import { Session } from '@/types'
import { apiSend } from '@/lib/clientApi'
import { APP_CONFIG } from '@/lib/config'
const MAX_BYTES = 1 * 1024 * 1024

async function compressImage(file: File): Promise<File> {
  if (file.size <= MAX_BYTES) return file
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      let { width, height } = img
      const MAX_DIM = 1920
      if (width > MAX_DIM || height > MAX_DIM) {
        const ratio = Math.min(MAX_DIM / width, MAX_DIM / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }
      canvas.width = width; canvas.height = height
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
      let lo = 0.1, hi = 0.92, best = ''
      for (let i = 0; i < 8; i++) {
        const mid = (lo + hi) / 2
        const data = canvas.toDataURL('image/jpeg', mid)
        const bytes = Math.round((data.length - 22) * 3 / 4)
        if (bytes <= MAX_BYTES) { best = data; lo = mid } else { hi = mid }
      }
      if (!best) best = canvas.toDataURL('image/jpeg', 0.1)
      const arr = best.split(',')
      const bstr = atob(arr[1]); const n = bstr.length; const u8 = new Uint8Array(n)
      for (let i = 0; i < n; i++) u8[i] = bstr.charCodeAt(i)
      resolve(new File([u8], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }))
    }
    img.src = url
  })
}

async function fileToPayload(file: File) {
  const processed = await compressImage(file)
  return new Promise<string>((resolve) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.readAsDataURL(processed)
  })
}

// the days a lead can be filed under: today and the weekdays (Monday to Friday) up to the end of next week,
// so a lead taken on Friday, Saturday or Sunday can be put on next week's Monday, Tuesday...
function leadDays() {
  const out: { value: string; label: string }[] = []
  const now = new Date()
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const endOfNextWeek = new Date(base); endOfNextWeek.setDate(base.getDate() + ((7 - base.getDay()) % 7) + 7 - 2)   // next week's Friday
  for (const d = new Date(base); d <= endOfNextWeek; d.setDate(d.getDate() + 1)) {
    const isToday = d.getTime() === base.getTime()
    if (!isToday && (d.getDay() === 0 || d.getDay() === 6)) continue
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const text = d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })
    out.push({ value, label: isToday ? `Today, ${text}` : text })
  }
  return out
}

export default function SubmitLeadPage({ session, onDone }: { session: Session; onDone: () => void }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [dayOptions] = useState(() => leadDays())

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(''); setLoading(true)
    const f = e.currentTarget
    const g = (name: string) => (f.elements.namedItem(name) as HTMLInputElement)?.value || ''
    const gf = (name: string) => (f.elements.namedItem(name) as HTMLInputElement)?.files?.[0]

    try {
      const payload: any = {
        customerName: g('customerName'), phone: g('phone'), place: g('place'),
        aadhaarNo: g('aadhaarNo'), address: g('address'),
        loanProduct: g('loanProduct'),
        submittedDate: g('submittedDate') || undefined,
      }
      const photoFields = ['customerPhoto','aadhaarFront']
      for (const key of photoFields) {
        const file = gf(key)
        if (file) payload[key] = await fileToPayload(file)
      }
      const res = await apiSend(session.token, 'POST', '/api/leads', payload)
      if (!res.ok) { setError(res.error || 'Failed'); return }
      onDone()
    } catch (e: any) { setError(e.message || 'Failed') } finally { setLoading(false) }
  }

  return (
    <div className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel">
      <div className="border-b border-black/5 px-6 py-5">
        <p className="text-sm font-semibold">New Customer Lead</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-5 p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[['customerName','Full Name *'],['phone','Phone *'],['aadhaarNo','Aadhaar (12 digits)'],['address','Address'],['place','Place *']].map(([k,l]) => (
            <label key={k} className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-soft">{l}</span>
              <input name={k} required={l.endsWith('*')} className="w-full rounded-2xl border border-line bg-mist px-4 py-3 text-sm outline-none focus:border-ink focus:bg-white transition" />
            </label>
          ))}
        </div>

        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-soft">Photos (optional)</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[['customerPhoto','Customer Photo'],['aadhaarFront','Aadhaar Front']].map(([k,l]) => (
              <label key={k} className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-soft">{l}</span>
                <input name={k} type="file" accept="image/*" className="w-full rounded-2xl border border-line px-3 py-2 text-sm" />
              </label>
            ))}
          </div>
        </div>

        {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-soft">Lead day</span>
            <select name="submittedDate" defaultValue={(dayOptions.find(d => !/^Today, (Saturday|Sunday)/.test(d.label)) || dayOptions[0]).value}
              className="w-full rounded-2xl border border-line bg-mist px-4 py-3 text-sm outline-none focus:border-ink focus:bg-white transition">
              {dayOptions.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-soft">Loan Product *</span>
            <select name="loanProduct" required
              className="w-full rounded-2xl border border-line bg-mist px-4 py-3 text-sm outline-none focus:border-ink focus:bg-white transition">
              <option value="">Select loan product</option>
              {APP_CONFIG.LOAN_PRODUCTS.map(p => (
                <option key={p.key} value={p.key}>
                  {p.label} (₹{p.principal.toLocaleString()} / {p.durationWeeks} weeks)
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onDone} className="flex-1 rounded-2xl border border-line px-4 py-3 text-sm font-semibold">Cancel</button>
          <button type="submit" disabled={loading} className="flex-1 rounded-2xl bg-[#f0b429] px-4 py-3 text-sm font-semibold text-[#1a1400] disabled:opacity-60">
            {loading ? 'Submitting...' : 'Submit Lead'}
          </button>
        </div>
      </form>
    </div>
  )
}
