// Indian mobile numbers: accept "9074845192", "+91 90748 45192", "09074845192", "919074845192".
// Returns the 10 digits (starts 6-9) or null when it is not a valid mobile number.
export function normalizeIndianMobile(raw: string | null | undefined): string | null {
  let d = String(raw || '').replace(/\D/g, '')
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2)
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1)
  return /^[6-9]\d{9}$/.test(d) ? d : null
}

/** Who a second contact number belongs to (shown next to the number) */
export const ALT_PHONE_LABELS = ['Husband', 'Wife', 'Son', 'Daughter', 'Father', 'Mother', 'Brother', 'Sister', 'Nominee', 'Other'] as const

/** 98xxxxxx21 style, safe to show in the UI and logs */
export function maskMobile(m: string | null | undefined): string {
  const d = normalizeIndianMobile(m)
  return d ? `${d.slice(0, 2)}••••••${d.slice(-2)}` : ''
}
