'use client'
import { useState } from 'react'
import { Session } from '@/types'
import { apiSend } from '@/lib/clientApi'
import { APP_CONFIG } from '@/lib/config'
import { ALT_PHONE_LABELS } from '@/lib/phone'
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
  // First a pop-up asks how to fill the lead: scan the Aadhaar card with AI, or type everything.
  const [step, setStep] = useState<'choose' | 'scan' | 'form'>('choose')
  const [scanned, setScanned] = useState(false)
  const [front, setFront] = useState<File | null>(null), [back, setBack] = useState<File | null>(null)
  const [reading, setReading] = useState(false), [scanError, setScanError] = useState('')
  const [aadhaarPics, setAadhaarPics] = useState<{ front?: string; back?: string }>({})
  const [vals, setVals] = useState({ customerName: '', phone: '', aadhaarNo: '', address: '', place: '' })
  const setVal = (k: string, v: string) => setVals(p => ({ ...p, [k]: v }))

  async function readCard() {
    if (!front && !back) { setScanError('Add the Aadhaar front and back photos'); return }
    setScanError(''); setReading(true)
    try {
      const [f, b] = await Promise.all([front ? fileToPayload(front) : '', back ? fileToPayload(back) : ''])
      const res = await apiSend(session.token, 'POST', '/api/aadhaar-read', { front: f || undefined, back: b || undefined })
      if (!res.ok) { setScanError(res.error || 'Could not read the card'); return }
      const d = (res as any).data || {}
      setVals(p => ({
        ...p,
        customerName: d.fullName || p.customerName, aadhaarNo: d.aadhaarNo || p.aadhaarNo, address: d.address || p.address,
        place: 'KODAMTHURUTH',   // every guarantor works from this place; editable on the form
      }))
      setAadhaarPics({ front: f || undefined, back: b || undefined })
      setScanned(true)
      setStep('form')
    } catch (e: any) { setScanError(e.message || 'Could not read the card') } finally { setReading(false) }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(''); setLoading(true)
    const f = e.currentTarget
    const g = (name: string) => (f.elements.namedItem(name) as HTMLInputElement)?.value || ''
    const gf = (name: string) => (f.elements.namedItem(name) as HTMLInputElement)?.files?.[0]

    try {
      const payload: any = {
        customerName: g('customerName'), phone: g('phone'), place: g('place'),
        altPhone: g('altPhone') || undefined, altPhoneLabel: g('altPhone') ? g('altPhoneLabel') : undefined,
        aadhaarNo: g('aadhaarNo'), address: g('address'),
        loanProduct: g('loanProduct'),
        submittedDate: g('submittedDate') || undefined,
      }
      const photoFields = ['customerPhoto','aadhaarFront']
      for (const key of photoFields) {
        const file = gf(key)
        if (file) payload[key] = await fileToPayload(file)
      }
      if (aadhaarPics.front) payload.aadhaarFront = aadhaarPics.front   // the photos used for scanning are saved with the lead
      if (aadhaarPics.back) payload.aadhaarBack = aadhaarPics.back
      const res = await apiSend(session.token, 'POST', '/api/leads', payload)
      if (!res.ok) { setError(res.error || 'Failed'); return }
      onDone()
    } catch (e: any) { setError(e.message || 'Failed') } finally { setLoading(false) }
  }

  const pick = 'block w-full rounded-2xl border border-line px-3 py-2 text-sm'
  if (step !== 'form') return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-[1.75rem] bg-white p-6 shadow-panel">
        {step === 'choose' ? (
          <>
            <p className="text-base font-semibold">New customer lead</p>
            <p className="mt-1 text-sm text-soft">How do you want to fill the details?</p>
            <div className="mt-5 grid gap-3">
              <button onClick={() => setStep('scan')} className="rounded-2xl bg-gold px-4 py-4 text-left text-[#1a1400]">
                <span className="block text-sm font-semibold">Scan Aadhaar</span>
                <span className="block text-xs">Take the front and back photos. The name, Aadhaar number and address are read for you.</span>
              </button>
              <button onClick={() => setStep('form')} className="rounded-2xl border border-line px-4 py-4 text-left">
                <span className="block text-sm font-semibold">Manual entry</span>
                <span className="block text-xs text-soft">Type all the details yourself.</span>
              </button>
              <button onClick={onDone} className="rounded-2xl px-4 py-2 text-sm font-semibold text-soft">Cancel</button>
            </div>
          </>
        ) : (
          <>
            <p className="text-base font-semibold">Scan Aadhaar</p>
            <p className="mt-1 text-sm text-soft">Take both sides in good light, with the whole card in the picture.</p>
            <div className="mt-4 space-y-3">
              <label className="block"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-soft">Aadhaar front</span>
                <input type="file" accept="image/*" capture="environment" onChange={e => setFront(e.target.files?.[0] || null)} className={pick} /></label>
              <label className="block"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-soft">Aadhaar back</span>
                <input type="file" accept="image/*" capture="environment" onChange={e => setBack(e.target.files?.[0] || null)} className={pick} /></label>
            </div>
            {scanError && <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{scanError}</p>}
            <div className="mt-5 flex gap-3">
              <button onClick={() => { setStep('choose'); setScanError('') }} disabled={reading} className="flex-1 rounded-2xl border border-line px-4 py-3 text-sm font-semibold disabled:opacity-60">Back</button>
              <button onClick={readCard} disabled={reading || (!front && !back)} className="flex-1 rounded-2xl bg-gold px-4 py-3 text-sm font-semibold text-[#1a1400] disabled:opacity-60">{reading ? 'Reading…' : 'Read Aadhaar'}</button>
            </div>
            <button onClick={() => setStep('form')} disabled={reading} className="mt-3 w-full text-center text-xs font-semibold text-soft underline">Skip and type the details</button>
          </>
        )}
      </div>
    </div>
  )

  return (
    <div className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel">
      <div className="border-b border-black/5 px-6 py-5">
        <p className="text-sm font-semibold">New Customer Lead</p>
        {scanned && <p className="mt-1 text-xs text-soft">Read from the Aadhaar card. Check the name, number and address, then add the mobile numbers.</p>}
      </div>
      <form onSubmit={handleSubmit} className="space-y-5 p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[['customerName','Full Name *'],['phone',scanned ? "Customer's mobile number *" : 'Phone *'],['aadhaarNo','Aadhaar (12 digits)'],['address','Address'],['place','Place *']].map(([k,l]) => (
            <label key={k} className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-soft">{l}</span>
              <input name={k} required={l.endsWith('*')} value={(vals as Record<string, string>)[k]} onChange={e => setVal(k, e.target.value)} inputMode={k === 'phone' ? 'tel' : k === 'aadhaarNo' ? 'numeric' : undefined} className="w-full rounded-2xl border border-line bg-mist px-4 py-3 text-sm outline-none focus:border-ink focus:bg-white transition" />
            </label>
          ))}
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-soft">{scanned ? 'Another contact number: mother, father, son, daughter, husband, wife or other' : 'Another contact number (optional)'}</p>
          <p className="mb-3 text-xs text-soft">If the customer cannot be reached, the branch and the agent can call this number: husband, wife, a family member or the nominee.</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-soft">Whose number is it?</span>
              <select name="altPhoneLabel" defaultValue="Husband" className="w-full rounded-2xl border border-line bg-mist px-4 py-3 text-sm outline-none focus:border-ink focus:bg-white transition">
                {ALT_PHONE_LABELS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-soft">Phone number</span>
              <input name="altPhone" inputMode="tel" placeholder="10-digit mobile number" className="w-full rounded-2xl border border-line bg-mist px-4 py-3 text-sm outline-none focus:border-ink focus:bg-white transition" />
            </label>
          </div>
        </div>

        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-soft">Photos (optional)</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[['customerPhoto','Customer Photo'], ...(scanned ? [] : [['aadhaarFront','Aadhaar Front']])].map(([k,l]) => (
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
          <button type="submit" disabled={loading} className="flex-1 rounded-2xl bg-gold px-4 py-3 text-sm font-semibold text-[#1a1400] disabled:opacity-60">
            {loading ? 'Submitting...' : 'Submit Lead'}
          </button>
        </div>
      </form>
    </div>
  )
}
