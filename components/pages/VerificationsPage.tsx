'use client'
import { useEffect, useState } from 'react'
import OtpPanel, { OtpState } from './OtpPanel'
import { Session, Lead, AgentTrip } from '@/types'

const MAX_BYTES = 1 * 1024 * 1024 // 1 MB

function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

async function compressImage(file: File): Promise<File> {
  if (file.size <= MAX_BYTES) return file
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      let { width, height } = img
      // Scale down if image is very large
      const MAX_DIM = 1920
      if (width > MAX_DIM || height > MAX_DIM) {
        const ratio = Math.min(MAX_DIM / width, MAX_DIM / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
      // Binary search for highest quality that fits under 1MB
      let lo = 0.1, hi = 0.92, best = ''
      for (let i = 0; i < 8; i++) {
        const mid = (lo + hi) / 2
        const data = canvas.toDataURL('image/jpeg', mid)
        const bytes = Math.round((data.length - 22) * 3 / 4)
        if (bytes <= MAX_BYTES) { best = data; lo = mid } else { hi = mid }
      }
      if (!best) best = canvas.toDataURL('image/jpeg', 0.1)
      // Convert base64 back to File
      const arr = best.split(','), mime = 'image/jpeg'
      const bstr = atob(arr[1])
      const n = bstr.length
      const u8 = new Uint8Array(n)
      for (let i = 0; i < n; i++) u8[i] = bstr.charCodeAt(i)
      const compressed = new File([u8], file.name.replace(/\.[^.]+$/, '.jpg'), { type: mime })
      resolve(compressed)
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

const PHOTO_FIELDS = [
  { key: 'customerPhoto', label: 'Customer Photo' },
  { key: 'aadhaarFront', label: 'Aadhaar Front' },
  { key: 'aadhaarBack', label: 'Aadhaar Back' },
  { key: 'housePhoto', label: 'House Photo' },
  { key: 'landmarkPhoto', label: 'Landmark Photo' },
  { key: 'chequePhoto', label: 'Cheque Photo' },
] as const

type PhotoKey = typeof PHOTO_FIELDS[number]['key']

function UploadBox({ photoKey, preview, onChange }: { photoKey: PhotoKey; preview: string | null; onChange: (key: PhotoKey, file: File) => void }) {
  const label = PHOTO_FIELDS.find(f => f.key === photoKey)!.label
  return (
    <div className="block">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#697586]">{label}</p>
      <label className="relative flex h-44 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#d1d5db] bg-[#f9fafb] transition hover:border-[#1a1a2e] hover:bg-[#f4f5f7] overflow-hidden">
        {preview ? (
          <img src={preview} alt={label} className="h-full w-full object-cover rounded-2xl" />
        ) : (
          <span className="text-sm text-[#697586]">+ Upload {label}</span>
        )}
        <input type="file" accept="image/*" className="absolute inset-0 cursor-pointer opacity-0" onChange={e => { const f = e.target.files?.[0]; if (f) onChange(photoKey, f) }} />
      </label>
    </div>
  )
}

export default function VerificationsPage({ session }: { session: Session }) {
  const [leads, setLeads] = useState<Lead[]>([])
  const [stops, setStops] = useState<Record<string, number>>({})
  const [active, setActive] = useState<Lead | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState('')
  const [previews, setPreviews] = useState<Partial<Record<PhotoKey, string>>>({})
  const [photoFiles, setPhotoFiles] = useState<Partial<Record<PhotoKey, File>>>({})
  const [showLocationModal, setShowLocationModal] = useState(false)
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [lastLocation, setLastLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [calculatedDistance, setCalculatedDistance] = useState<number | null>(null)
  const [manualDistance, setManualDistance] = useState<number>(0)
  const [savingTrip, setSavingTrip] = useState(false)
  const [visitPhone, setVisitPhone] = useState('')
  const [otpState, setOtpState] = useState<OtpState>({ verified: false, overridden: false })
  useEffect(() => { setVisitPhone(active?.phone || ''); setOtpState({ verified: false, overridden: false }) }, [active?.leadId]) // eslint-disable-line react-hooks/exhaustive-deps

  function handlePhoto(key: PhotoKey, file: File) {
    setPhotoFiles(p => ({ ...p, [key]: file }))
    const url = URL.createObjectURL(file)
    setPreviews(p => ({ ...p, [key]: url }))
  }

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(''), 3000) }

  async function loadLastLocation() {
    // First try localStorage
    const stored = localStorage.getItem('ngf_last_location')
    if (stored) {
      try {
        const loc = JSON.parse(stored)
        setLastLocation(loc)
        return
      } catch {}
    }
    // Fallback: fetch today's attendance location from API
    try {
      const res = await fetch('/api/agent/attendance', { headers: { Authorization: `Bearer ${session.token}` } })
      const json = await res.json()
      if (json.success && json.data.records?.length > 0) {
        const today = new Date().toISOString().slice(0, 10)
        const todayRecord = json.data.records.find((r: any) => r['Date'] === today)
        if (todayRecord && todayRecord['Latitude'] && todayRecord['Longitude']) {
          const loc = { lat: Number(todayRecord['Latitude']), lng: Number(todayRecord['Longitude']) }
          setLastLocation(loc)
          localStorage.setItem('ngf_last_location', JSON.stringify(loc))
        }
      }
    } catch {}
  }

  useEffect(() => { loadLastLocation() }, [session.token])

  async function saveTrip(leadId: string) {
    if (!currentLocation || !lastLocation) return
    setSavingTrip(true)
    try {
      const distanceKm = manualDistance > 0 ? manualDistance : (calculatedDistance || 0)
      const res = await fetch('/api/agent/trips', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startLatitude: lastLocation.lat,
          startLongitude: lastLocation.lng,
          endLatitude: currentLocation.lat,
          endLongitude: currentLocation.lng,
          leadId,
          manualDistance: distanceKm,
        }),
      })
      const json = await res.json()
      if (json.success) {
        showToast(`Trip saved: ${distanceKm.toFixed(2)} km`)
        localStorage.setItem('ngf_last_location', JSON.stringify(currentLocation))
        setLastLocation(currentLocation)
      } else {
        showToast(json.error || 'Failed to save trip')
      }
    } finally {
      setSavingTrip(false)
      setShowLocationModal(false)
      setCurrentLocation(null)
      setCalculatedDistance(null)
      setManualDistance(0)
    }
  }

  function getCurrentLocation() {
    navigator.geolocation.getCurrentPosition(
      pos => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setCurrentLocation(loc)
        if (lastLocation) {
          const dist = getDistanceKm(lastLocation.lat, lastLocation.lng, loc.lat, loc.lng)
          setCalculatedDistance(dist)
        }
      },
      () => { alert('Location access denied.') },
      { enableHighAccuracy: true }
    )
  }

  async function load() {
    const headers = { Authorization: `Bearer ${session.token}` }
    const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)
    const [res, routeRes] = await Promise.all([
      fetch('/api/leads?status=Agent+Assigned', { headers }),
      fetch(`/api/routes?view=mine&date=${today}`, { headers }).catch(() => null),
    ])
    const json = await res.json()
    // Today's route decides the order: stop 1 first. Leads that are not on today's route follow, in their old order.
    const stopNo: Record<string, number> = {}
    try {
      const rj = routeRes ? await routeRes.json() : null
      if (rj?.success) (rj.data.stops as { leadId: string }[]).forEach((st, i) => { stopNo[st.leadId] = i + 1 })
    } catch { /* route planning off or unavailable: keep the plain order */ }
    setStops(stopNo)
    if (json.success) {
      const rows: Lead[] = json.data.rows
      setLeads(rows.map((l, i) => ({ l, i })).sort((a, b) => (stopNo[a.l.leadId] ?? 1e6) - (stopNo[b.l.leadId] ?? 1e6) || a.i - b.i).map(x => x.l))
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function submit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitting(true)
    const f = e.currentTarget
    const g = (k: string) => (f.elements.namedItem(k) as HTMLInputElement)?.value || ''
    const payload: any = {
      action: 'submitVerification',
      recommendationStatus: g('recommendationStatus'),
      riskLevel: g('riskLevel'),
      riskNotes: g('riskNotes'),
      gpsCoordinates: g('gpsCoordinates'),
      mapsLink: g('mapsLink'),
      customerName: g('customerName'),
      phone: g('phone'),
      aadhaarNo: g('aadhaarNo'),
      address: g('address'),
      place: g('place'),
      houseName: g('houseName'),
      landmark: g('landmark'),
      accountNumber: g('accountNumber'),
      ifscCode: g('ifscCode'),
      nomineeName: g('nomineeName'),
      nomineePhone: g('nomineePhone'),
      occupation: g('occupation'),
      panNo: g('panNo'),
      chequeNumber: g('chequeNumber'),
    }
    for (const k of PHOTO_FIELDS.map(f => f.key)) {
      const file = photoFiles[k]
      if (file) payload[k] = await fileToPayload(file)
    }
    try {
      const res = await fetch(`/api/leads/${active!.leadId}`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (json.success) {
        showToast('Verification submitted.')
        const leadId = active!.leadId
        setActive(null)
        setPreviews({})
        setPhotoFiles({})
        load()
        // Show location modal after successful verification
        setTimeout(() => {
          getCurrentLocation()
          setShowLocationModal(true)
        }, 500)
      } else showToast(json.error || 'Failed')
    } finally { setSubmitting(false) }
  }

  if (loading) return <div className="flex h-40 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-[#1a1a2e] border-t-transparent" /></div>

  return (
    <div className="space-y-4">
      {toast && <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-2xl bg-[#1a1a2e] px-5 py-3 text-sm font-medium text-white shadow-lg">{toast}</div>}
      {!active ? (
        <div className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel">
          <div className="border-b border-black/5 px-6 py-4">
            <p className="text-sm font-semibold">Verification Queue</p>
            <p className="mt-1 text-sm text-[#697586]">Leads assigned to you for field verification, in the order of today&apos;s route.</p>
          </div>
          <div className="divide-y divide-black/5">
            {leads.map(l => (
              <div key={l.leadId} className="flex items-center justify-between gap-4 px-6 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  {stops[l.leadId] && <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1a1a2e] text-sm font-bold text-white" title="Stop number on today's route">{stops[l.leadId]}</span>}
                  <div className="min-w-0">
                    <p className="font-medium">{l.customerName}</p>
                    <p className="text-sm text-[#697586]">{l.phone} &bull; {l.place}</p>
                  </div>
                </div>
                <button onClick={() => setActive(l)} className="rounded-2xl bg-[#1a1a2e] px-4 py-2 text-sm font-semibold text-white">
                  Start Verification
                </button>
              </div>
            ))}
            {leads.length === 0 && <p className="p-8 text-center text-sm text-[#697586]">No leads assigned for verification.</p>}
          </div>
        </div>
      ) : (
        <div className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel">
          <div className="border-b border-black/5 px-6 py-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xl font-semibold">{active.customerName}</p>
                <p className="mt-1 text-sm text-[#697586]">{active.phone} &bull; {active.leadId}</p>
              </div>
              <button onClick={() => { setActive(null); setPreviews({}); setPhotoFiles({}) }} className="rounded-2xl border border-[#e5e7eb] px-4 py-2 text-sm font-semibold">Back</button>
            </div>
          </div>
          <form onSubmit={submit} className="space-y-8 p-6">
            <section>
              <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-[#697586]">Borrower Details</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  ['customerName', 'Full Name *', active.customerName],
                  ['phone', 'Phone *', active.phone],
                  ['aadhaarNo', 'Aadhaar No', active.aadhaarNo],
                  ['address', 'Address', active.address],
                  ['houseName', 'House Name', active.houseName],
                  ['place', 'Place', active.place],
                  ['landmark', 'Landmark', active.landmark],
                  ['accountNumber', 'Account Number', (active as any).accountNumber],
                  ['ifscCode', 'IFSC Code', (active as any).ifscCode],
                  ['panNo', 'PAN No', active.panNo],
                  ['chequeNumber', 'Cheque Number', (active as any).chequeNumber],
                  ['nomineeName', 'Nominee Name', active.nomineeName],
                ].map(([k, l, v]) => (
                  <label key={String(k)} className="block">
                    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#697586]">{String(l)}</span>
                    <input name={String(k)} defaultValue={String(v || '')} required={String(l).endsWith('*')} onChange={k === 'phone' ? (e => setVisitPhone(e.target.value)) : undefined} className="w-full rounded-2xl border border-[#e5e7eb] bg-[#f4f5f7] px-4 py-3 text-sm outline-none focus:border-[#1a1a2e] focus:bg-white transition" />
                  </label>
                ))}
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#697586]">Nominee Phone</span>
                  <input name="nomineePhone" defaultValue={String(active.nomineePhone || '')} className="w-full rounded-2xl border border-[#e5e7eb] bg-[#f4f5f7] px-4 py-3 text-sm outline-none focus:border-[#1a1a2e] focus:bg-white transition" />
                </label>
                <div>
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#697586]">Google Maps Link</span>
                  <div className="flex gap-2">
                    <input name="mapsLink" id="mapsLink" placeholder="Paste Google Maps link here" data-no-upper className="flex-1 min-w-0 rounded-2xl border border-[#e5e7eb] bg-[#f4f5f7] px-4 py-3 text-sm outline-none focus:border-[#1a1a2e] focus:bg-white transition" />
                    <input name="gpsCoordinates" id="gpsCoordinates" type="hidden" />
                    <button type="button" onClick={() => {
                      const btn = document.getElementById('gpsBtn') as HTMLButtonElement
                      btn.disabled = true; btn.textContent = '...'
                      navigator.geolocation.getCurrentPosition(
                        pos => {
                          const coords = `${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`
                          const mapsLink = `https://maps.google.com/?q=${pos.coords.latitude},${pos.coords.longitude}`;
                          (document.getElementById('gpsCoordinates') as HTMLInputElement).value = coords;
                          (document.getElementById('mapsLink') as HTMLInputElement).value = mapsLink
                          btn.disabled = false; btn.textContent = '📍 Locate'
                        },
                        () => { alert('Location access denied.'); btn.disabled = false; btn.textContent = '📍 Locate' },
                        { enableHighAccuracy: true }
                      )
                    }} id="gpsBtn" className="rounded-2xl border border-[#e5e7eb] bg-white px-3 py-3 text-sm font-medium whitespace-nowrap">📍 Locate</button>
                  </div>
                </div>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#697586]">Occupation</span>
                  <select name="occupation" defaultValue={String(active.occupation || '')} className="w-full rounded-2xl border border-[#e5e7eb] bg-[#f4f5f7] px-4 py-3 text-sm outline-none focus:border-[#1a1a2e] focus:bg-white transition">
                    <option value="">Select</option>
                    {['House Wife', 'Daily Wages', 'Business Running Shop', 'Employed in Private Firm'].map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#697586]">Risk Level *</span>
                  <select name="riskLevel" required className="w-full rounded-2xl border border-[#e5e7eb] bg-[#f4f5f7] px-4 py-3 text-sm outline-none focus:border-[#1a1a2e] focus:bg-white transition">
                    <option value="">Select</option>
                    <option>Low</option>
                    <option>Medium</option>
                    <option>High</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#697586]">Recommendation *</span>
                  <select name="recommendationStatus" required className="w-full rounded-2xl border border-[#e5e7eb] bg-[#f4f5f7] px-4 py-3 text-sm outline-none focus:border-[#1a1a2e] focus:bg-white transition">
                    <option value="">Select</option>
                    <option>Verified</option>
                    <option>Suspicious</option>
                    <option>Rejected Recommendation</option>
                  </select>
                </label>
              </div>
            </section>
            <section>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-[#697586]">Customer OTP (required)</p>
              <p className="mb-3 text-sm text-[#697586]">Ask the customer to confirm with the code sent to their phone. Without it the verification cannot go to the branch.</p>
              <OtpPanel token={session.token} leadId={active.leadId} purpose="lead_verification" phone={visitPhone} onChange={setOtpState} />
            </section>
            <section>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-[#697586]">Documents</p>
              <p className="mb-4 text-sm text-[#697586]">Optional — upload if available. Images are compressed automatically.</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {PHOTO_FIELDS.map(({ key }) => (
                  <UploadBox key={key} photoKey={key} preview={previews[key] ?? null} onChange={handlePhoto} />
                ))}
              </div>
            </section>
            <section>
              <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-[#697586]">Field Notes</p>
              <textarea name="riskNotes" rows={3} className="w-full rounded-2xl border border-[#e5e7eb] bg-[#f4f5f7] px-4 py-3 text-sm outline-none focus:border-[#1a1a2e]" />
            </section>
            <div className="flex items-center justify-between border-t border-black/5 pt-5">
              <p className="text-sm text-[#697586]">Lead ID {active.leadId}</p>
              <button type="submit" disabled={submitting || !(otpState.verified || otpState.overridden)} title={otpState.verified || otpState.overridden ? '' : 'Verify the customer OTP first'} className="rounded-2xl bg-[#1a1a2e] px-6 py-3 text-sm font-semibold text-white disabled:opacity-40">
                {submitting ? 'Submitting...' : otpState.verified || otpState.overridden ? 'Submit Verification' : 'Verify OTP to submit'}
              </button>
            </div>
          </form>
        </div>
      )}

      {showLocationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-[1.75rem] border border-white/70 bg-white shadow-panel p-6">
            <h3 className="text-lg font-semibold mb-4">Log Travel Distance</h3>
            <p className="text-sm text-[#697586] mb-4">Verification submitted. Please confirm your current location to calculate travel distance from your last verification.</p>
            
            <div className="space-y-3 mb-4">
              <div className="rounded-xl bg-[#f4f5f7] p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#697586]">Last Location</p>
                <p className="text-sm font-medium">{lastLocation ? `${lastLocation.lat.toFixed(6)}, ${lastLocation.lng.toFixed(6)}` : 'No previous location'}</p>
              </div>
              <div className="rounded-xl bg-[#f4f5f7] p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#697586]">Current Location</p>
                <p className="text-sm font-medium">{currentLocation ? `${currentLocation.lat.toFixed(6)}, ${currentLocation.lng.toFixed(6)}` : 'Getting location...'}</p>
              </div>
              {calculatedDistance !== null && (
                <div className="rounded-xl bg-green-50 border border-green-200 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-green-700">Auto Distance (Straight-line)</p>
                  <p className="text-xl font-bold text-green-700">{calculatedDistance.toFixed(2)} km</p>
                </div>
              )}
            </div>

            {/* Google Maps Link */}
            {lastLocation && currentLocation && (
              <div className="mb-4">
                <a
                  href={`https://www.google.com/maps/dir/${lastLocation.lat},${lastLocation.lng}/${currentLocation.lat},${currentLocation.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Open Route in Google Maps
                </a>
                <p className="mt-1 text-xs text-[#697586] text-center">Opens Google Maps with route — check road distance, then enter below</p>
              </div>
            )}

            {/* Manual Distance Input */}
            <div className="mb-4">
              <label className="block">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#697586] mb-1">Actual Road Distance (km) <span className="text-red-500">*</span></p>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={manualDistance}
                  onChange={e => setManualDistance(Number(e.target.value) || 0)}
                  placeholder={calculatedDistance ? `Auto: ${calculatedDistance.toFixed(2)} km` : 'Enter distance from Google Maps'}
                  className="w-full rounded-2xl border border-[#e5e7eb] bg-[#f4f5f7] px-4 py-3 text-sm outline-none focus:border-[#1a1a2e] focus:bg-white"
                />
              </label>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => getCurrentLocation()}
                disabled={savingTrip}
                className="flex-1 rounded-2xl border border-[#e5e7eb] bg-white px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
              >
                Refresh Location
              </button>
              <button
                onClick={() => { setShowLocationModal(false); setCurrentLocation(null); setCalculatedDistance(null); setManualDistance(0); }}
                className="flex-1 rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-600"
              >
                Skip
              </button>
            </div>
            <button
              onClick={() => saveTrip(active?.leadId || '')}
              disabled={savingTrip || !currentLocation || !lastLocation || !manualDistance}
              className="mt-3 w-full rounded-2xl bg-[#1a1a2e] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {savingTrip ? 'Saving...' : 'Save Trip'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
