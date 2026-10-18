const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function toNum(n: number | string | null | undefined): number {
  if (n === null || n === undefined || n === '') return 0
  const v = typeof n === 'number' ? n : Number(String(n).replace(/,/g, ''))
  return Number.isFinite(v) ? v : 0
}

export function formatINR(n: number | string | null | undefined): string {
  const v = toNum(n)
  const abs = Math.abs(v)
  const s = abs.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: Number.isInteger(abs) ? 0 : 2 })
  return `${v < 0 && abs !== 0 ? '-' : ''}₹${s}`
}

export function formatINRShort(n: number | string | null | undefined): string {
  const v = toNum(n)
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  const trim = (x: number) => String(parseFloat(x.toFixed(2)))
  if (abs >= 1e7) return `${sign}₹${trim(abs / 1e7)}Cr`
  if (abs >= 1e5) return `${sign}₹${trim(abs / 1e5)}L`
  return formatINR(v)
}

export function formatDateIN(d: string | Date | null | undefined): string {
  if (!d) return '—'
  let day: number, month: number, year: number
  if (typeof d === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.trim())
    if (m) {
      year = +m[1]; month = +m[2] - 1; day = +m[3]
      if (month < 0 || month > 11) return '—'
      return `${day} ${MONTHS[month]} ${year}`
    }
  }
  const dt = d instanceof Date ? d : new Date(d)
  if (isNaN(dt.getTime())) return '—'
  return `${dt.getDate()} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`
}
