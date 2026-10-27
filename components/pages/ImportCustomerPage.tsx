'use client'
import { useEffect, useState } from 'react'
import { Session } from '@/types'
import { APP_CONFIG } from '@/lib/config'

const MAX_BYTES = 1024 * 1024
async function compressImage(file: File): Promise<string> {
  return new Promise(resolve => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const MAX_DIM = 1600
      let w = img.width, h = img.height
      if (w > MAX_DIM || h > MAX_DIM) {
        if (w > h) { h = Math.round(h * MAX_DIM / w); w = MAX_DIM }
        else { w = Math.round(w * MAX_DIM / h); h = MAX_DIM }
      }
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      if (file.size <= MAX_BYTES) { resolve(canvas.toDataURL('image/jpeg', 0.92)); return }
      let lo = 0.1, hi = 0.92, best = canvas.toDataURL('image/jpeg', 0.5)
      for (let i = 0; i < 8; i++) {
        const mid = (lo + hi) / 2
        const d = canvas.toDataURL('image/jpeg', mid)
        if (d.length * 0.75 <= MAX_BYTES) { best = d; lo = mid } else { hi = mid }
      }
      resolve(best)
    }
    img.src = url
  })
}

function Label({ text }: { text: string }) {
  return <span className="mb-1 block text-[0.7rem] font-semibold uppercase tracking-wider text-soft">{text}</span>
}

function TextField({ label, name, value, onChange, required, type = 'text' }: {
  label: string; name: string; value: string; onChange: (v: string) => void
  required?: boolean; type?: string
}) {
  return (
    <label className="block">
      <Label text={label} />
      <input name={name} type={type} value={value} onChange={e => onChange(e.target.value)}
        required={required}
        className="w-full rounded-xl border border-line px-3 py-2.5 text-sm outline-none focus:border-ink" />
    </label>
  )
}

function PhotoField({ label, value, onChange }: { label: string; value: string; onChange: (b64: string) => void }) {
  return (
    <div>
      <Label text={label} />
      <label className="block cursor-pointer">
        {value ? (
          <div className="relative rounded-xl overflow-hidden border border-line">
            <img src={value} alt={label} className="w-full h-36 object-cover" />
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 hover:opacity-100 transition">
              <span className="text-white text-xs font-semibold">Change</span>
            </div>
          </div>
        ) : (
          <div className="flex h-36 w-full items-center justify-center rounded-xl border-2 border-dashed border-line bg-panel text-xs text-soft hover:border-ink transition">
            + Upload {label}
          </div>
        )}
        <input type="file" accept="image/*" data-no-upper className="hidden"
          onChange={async e => {
            const f = e.target.files?.[0]; if (!f) return
            const b64 = await compressImage(f)
            onChange(b64)
          }} />
      </label>
    </div>
  )
}

const WEEK_STATUSES = ['Pending', 'Paid', 'Delayed', 'Not Paid'] as const
type WeekStatus = typeof WEEK_STATUSES[number]

const STATUS_STYLE: Record<WeekStatus, string> = {
  Paid:      'border-green-400 bg-green-50 text-green-700',
  Pending:   'border-line bg-panel text-soft',
  Delayed:   'border-orange-300 bg-orange-50 text-orange-700',
  'Not Paid':'border-red-300 bg-red-50 text-red-700',
}
const STATUS_LABEL: Record<WeekStatus, string> = {
  Paid: '✓ Paid', Pending: 'Pending', Delayed: '⚠ Delayed', 'Not Paid': '✕ Not Paid',
}

export default function ImportCustomerPage({ session }: { session: Session }) {
  const [guarantors, setGuarantors] = useState<any[]>([])
  const [agents, setAgents] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [success, setSuccess] = useState<{ customerId: string; loanId: string } | null>(null)

  const [form, setForm] = useState({
    name: '', phone: '', aadhaarNo: '', address: '', houseName: '',
    place: '', landmark: '', accountNumber: '', ifscCode: '', panNo: '',
    mapsLink: '', occupation: '', riskLevel: '', recommendationStatus: '',
    nomineeName: '', nomineePhone: '',
    guarantorId: '', agentId: '', loanProduct: APP_CONFIG.LOAN_PRODUCTS[0].key,
    disburseDate: '', joinedDate: '',
  })

  // Photos as base64
  const [photos, setPhotos] = useState({
    customerPhoto: '', aadhaarFront: '', aadhaarBack: '',
    housePhoto: '', landmarkPhoto: '', chequePhoto: '',
  })

  // Per-week status map: week number (1-based) -> status
  const [weekStatuses, setWeekStatuses] = useState<Record<number, WeekStatus>>({})

  function setField(k: string) { return (v: string) => setForm(f => ({ ...f, [k]: v })) }
  function setPhoto(k: string) { return (v: string) => setPhotos(p => ({ ...p, [k]: v })) }
  function setWeekStatus(week: number, status: WeekStatus) {
    setWeekStatuses(prev => ({ ...prev, [week]: status }))
  }
  function cycleWeek(week: number) {
    const cur = weekStatuses[week] || 'Pending'
    const next = cur === 'Pending' ? 'Paid' : cur === 'Paid' ? 'Delayed' : cur === 'Delayed' ? 'Not Paid' : 'Pending'
    setWeekStatus(week, next)
  }

  useEffect(() => {
    fetch('/api/staff', { headers: { Authorization: `Bearer ${session.token}` } })
      .then(r => r.json()).then(s => {
        if (s.success) { setGuarantors(s.data.guarantors); setAgents(s.data.agents) }
      })
  }, [])

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(''), 4000) }

  function getSchedule() {
    if (!form.disburseDate || !form.loanProduct) return []
    const product = APP_CONFIG.LOAN_PRODUCTS.find(p => p.key === form.loanProduct)
    if (!product) return []
    const istOffset = 5.5 * 60 * 60 * 1000
    const d = new Date(new Date(form.disburseDate).getTime() + istOffset)
    const day = d.getUTCDay()
    d.setUTCDate(d.getUTCDate() + (day === 6 ? 0 : 6 - day))
    return Array.from({ length: product.durationWeeks }, (_, w) => {
      const due = new Date(d); due.setUTCDate(d.getUTCDate() + w * 7)
      return { week: w + 1, date: due.toISOString().slice(0, 10) }
    })
  }

  const schedule = getSchedule()
  const paidCount = schedule.filter(w => (weekStatuses[w.week] || 'Pending') === 'Paid').length
  const delayedCount = schedule.filter(w => (weekStatuses[w.week] || 'Pending') === 'Delayed').length
  const notPaidCount = schedule.filter(w => (weekStatuses[w.week] || 'Pending') === 'Not Paid').length

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      // Build week statuses array for API
      const weekStatusList = schedule.map(w => ({
        week: w.week,
        date: w.date,
        status: weekStatuses[w.week] || 'Pending',
      }))
      const res = await fetch('/api/import-customer', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, ...photos, weekStatusList }),
      })
      const json = await res.json()
      if (json.success) {
        setSuccess(json.data)
        showToast('Customer imported successfully!')
        setForm({ name: '', phone: '', aadhaarNo: '', address: '', houseName: '', place: '', landmark: '', accountNumber: '', ifscCode: '', panNo: '', mapsLink: '', occupation: '', riskLevel: '', recommendationStatus: '', nomineeName: '', nomineePhone: '', guarantorId: '', agentId: '', loanProduct: APP_CONFIG.LOAN_PRODUCTS[0].key, disburseDate: '', joinedDate: '' })
        setPhotos({ customerPhoto: '', aadhaarFront: '', aadhaarBack: '', housePhoto: '', landmarkPhoto: '', chequePhoto: '' })
        setWeekStatuses({})
      } else {
        showToast(json.error || 'Failed to import')
      }
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-5 max-w-4xl">
      {toast && <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-2xl bg-ink px-5 py-3 text-sm font-medium text-white shadow-lg">{toast}</div>}

      {success && (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          ✓ Imported — Customer ID: <span className="font-mono font-bold">{success.customerId}</span> · Loan ID: <span className="font-mono font-bold">{success.loanId}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Customer Details */}
        <div className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel">
          <div className="border-b border-black/5 px-6 py-4">
            <p className="text-sm font-semibold">Customer Details</p>
          </div>
          <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3">
            <TextField label="Full Name *" name="name" value={form.name} onChange={setField('name')} required />
            <TextField label="Phone *" name="phone" value={form.phone} onChange={setField('phone')} required type="tel" />
            <TextField label="Aadhaar No" name="aadhaarNo" value={form.aadhaarNo} onChange={setField('aadhaarNo')} />
            <TextField label="Address" name="address" value={form.address} onChange={setField('address')} />
            <TextField label="House Name" name="houseName" value={form.houseName} onChange={setField('houseName')} />
            <TextField label="Place" name="place" value={form.place} onChange={setField('place')} />
            <TextField label="Landmark" name="landmark" value={form.landmark} onChange={setField('landmark')} />
            <TextField label="Account Number" name="accountNumber" value={form.accountNumber} onChange={setField('accountNumber')} />
            <TextField label="IFSC Code" name="ifscCode" value={form.ifscCode} onChange={setField('ifscCode')} />
            <TextField label="PAN No" name="panNo" value={form.panNo} onChange={setField('panNo')} />
            <TextField label="Nominee Name" name="nomineeName" value={form.nomineeName} onChange={setField('nomineeName')} />
            <TextField label="Nominee Phone" name="nomineePhone" value={form.nomineePhone} onChange={setField('nomineePhone')} type="tel" />
            <label className="block col-span-full sm:col-span-2 lg:col-span-3">
              <Label text="Google Maps Link" />
              <div className="flex gap-2 items-center">
                <input name="mapsLink" type="url" value={form.mapsLink} onChange={e => setField('mapsLink')(e.target.value)}
                  data-no-upper placeholder="Paste Google Maps link here"
                  className="w-full rounded-xl border border-line px-3 py-2.5 text-sm outline-none focus:border-ink" />
                {form.mapsLink && (
                  <a href={form.mapsLink} target="_blank" rel="noopener"
                    className="shrink-0 rounded-xl bg-mist px-3 py-2.5 text-xs font-semibold whitespace-nowrap">
                    Open Map
                  </a>
                )}
              </div>
            </label>
            <label className="block">
              <Label text="Occupation" />
              <select value={form.occupation} onChange={e => setField('occupation')(e.target.value)}
                className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-ink">
                <option value="">Select</option>
                <option>House Wife</option>
                <option>Daily Wages</option>
                <option>Business Running Shop</option>
                <option>Employed in Private Firm</option>
              </select>
            </label>
            <label className="block">
              <Label text="Risk Level" />
              <select value={form.riskLevel} onChange={e => setField('riskLevel')(e.target.value)}
                className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-ink">
                <option value="">Select</option>
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
              </select>
            </label>
            <label className="block">
              <Label text="Recommendation" />
              <select value={form.recommendationStatus} onChange={e => setField('recommendationStatus')(e.target.value)}
                className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-ink">
                <option value="">Select</option>
                <option>Verified</option>
                <option>Suspicious</option>
                <option>Rejected Recommendation</option>
              </select>
            </label>
          </div>
        </div>

        {/* Documents */}
        <div className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel">
          <div className="border-b border-black/5 px-6 py-4">
            <p className="text-sm font-semibold">Documents</p>
            <p className="text-xs text-soft mt-0.5">Optional — upload if available. Images are compressed automatically.</p>
          </div>
          <div className="grid gap-4 p-6 grid-cols-2 lg:grid-cols-3">
            <PhotoField label="Customer Photo" value={photos.customerPhoto} onChange={setPhoto('customerPhoto')} />
            <PhotoField label="Aadhaar Front" value={photos.aadhaarFront} onChange={setPhoto('aadhaarFront')} />
            <PhotoField label="Aadhaar Back" value={photos.aadhaarBack} onChange={setPhoto('aadhaarBack')} />
            <PhotoField label="House Photo" value={photos.housePhoto} onChange={setPhoto('housePhoto')} />
            <PhotoField label="Landmark Photo" value={photos.landmarkPhoto} onChange={setPhoto('landmarkPhoto')} />
            <PhotoField label="Cheque Photo" value={photos.chequePhoto} onChange={setPhoto('chequePhoto')} />
          </div>
        </div>

        {/* Loan Details */}
        <div className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel">
          <div className="border-b border-black/5 px-6 py-4">
            <p className="text-sm font-semibold">Loan Details</p>
          </div>
          <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block">
              <Label text="Guarantor *" />
              <select value={form.guarantorId} onChange={e => setField('guarantorId')(e.target.value)} required
                className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-ink">
                <option value="">Select guarantor</option>
                {guarantors.map((g: any) => <option key={g.guarantorId} value={g.guarantorId}>{g.name} ({g.code})</option>)}
              </select>
            </label>
            <label className="block">
              <Label text="NGF AGENT" />
              <select value={form.agentId} onChange={e => setField('agentId')(e.target.value)}
                className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-ink">
                <option value="">Select agent</option>
                {agents.map((a: any) => <option key={a.agentId} value={a.agentId}>{a.name}</option>)}
              </select>
            </label>
            <label className="block">
              <Label text="Loan Product *" />
              <select value={form.loanProduct} onChange={e => setField('loanProduct')(e.target.value)} required
                className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-ink">
                {APP_CONFIG.LOAN_PRODUCTS.map(p => (
                  <option key={p.key} value={p.key}>{p.label} — ₹{p.netDisbursed} disbursed, ₹{p.weeklyCollection}/wk × {p.durationWeeks}w</option>
                ))}
              </select>
            </label>
            <label className="block">
              <Label text="Joined Date" />
              <input type="date" value={form.joinedDate} onChange={e => setField('joinedDate')(e.target.value)}
                data-no-upper
                className="w-full rounded-xl border border-line px-3 py-2.5 text-sm outline-none focus:border-ink" />
            </label>
            <label className="block">
              <Label text="Disburse Date *" />
              <input type="date" value={form.disburseDate} onChange={e => setField('disburseDate')(e.target.value)} required
                data-no-upper
                className="w-full rounded-xl border border-line px-3 py-2.5 text-sm outline-none focus:border-ink" />
              {schedule.length > 0 && (
                <p className="mt-1 text-[11px] text-soft">First collection: {schedule[0].date} · Last: {schedule[schedule.length - 1].date}</p>
              )}
            </label>
          </div>
        </div>

        {/* Per-week status */}
        {schedule.length > 0 && (
          <div className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel">
            <div className="border-b border-black/5 px-6 py-4 flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="text-sm font-semibold">Repayment Status per Week</p>
                <p className="text-xs text-soft mt-0.5">Click each week to cycle: Pending → Paid → Delayed → Not Paid</p>
              </div>
              <div className="flex gap-2 flex-wrap text-xs">
                <span className="rounded-lg bg-green-50 px-2 py-1 text-green-700 font-semibold">{paidCount} Paid</span>
                <span className="rounded-lg bg-orange-50 px-2 py-1 text-orange-700 font-semibold">{delayedCount} Delayed</span>
                <span className="rounded-lg bg-red-50 px-2 py-1 text-red-700 font-semibold">{notPaidCount} Not Paid</span>
                <span className="rounded-lg bg-panel px-2 py-1 text-soft font-semibold">{schedule.length - paidCount - delayedCount - notPaidCount} Pending</span>
              </div>
            </div>
            <div className="p-6">
              {/* Quick-fill buttons */}
              <div className="mb-4 flex gap-2 flex-wrap">
                <button type="button" onClick={() => {
                  const s: Record<number, WeekStatus> = {}
                  schedule.forEach(w => { s[w.week] = 'Pending' })
                  setWeekStatuses(s)
                }} className="rounded-xl border border-line px-3 py-1.5 text-xs font-semibold">All Pending</button>
                <button type="button" onClick={() => {
                  const s: Record<number, WeekStatus> = {}
                  schedule.forEach(w => { s[w.week] = 'Paid' })
                  setWeekStatuses(s)
                }} className="rounded-xl border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700">All Paid</button>
                <button type="button" onClick={() => {
                  const today = new Date().toISOString().slice(0, 10)
                  const s: Record<number, WeekStatus> = {}
                  schedule.forEach(w => { s[w.week] = w.date <= today ? 'Paid' : 'Pending' })
                  setWeekStatuses(s)
                }} className="rounded-xl border border-ink bg-ink px-3 py-1.5 text-xs font-semibold text-white">Auto-mark Past as Paid</button>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {schedule.map(w => {
                  const status: WeekStatus = weekStatuses[w.week] || 'Pending'
                  return (
                    <button key={w.week} type="button" onClick={() => cycleWeek(w.week)}
                      className={`rounded-xl border px-3 py-2.5 text-left text-xs transition active:scale-95 ${STATUS_STYLE[status]}`}>
                      <p className="font-bold">Week {w.week}</p>
                      <p className="mt-0.5 text-[11px] opacity-80">{w.date}</p>
                      <p className="mt-1 font-semibold">{STATUS_LABEL[status]}</p>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-3 pb-4">
          <button type="submit" disabled={saving || !form.disburseDate}
            className="rounded-2xl bg-ink px-8 py-3 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? 'Importing...' : 'Import Customer'}
          </button>
        </div>
      </form>
    </div>
  )
}
