// The NGF Score chip (our own 0-850 score, built from payments and staff reviews). Not a CIBIL score.
const TONE: Record<string, string> = {
  Excellent: 'bg-green-100 text-green-800', Good: 'bg-lime-100 text-lime-800', Fair: 'bg-amber-100 text-amber-800',
  Building: 'bg-orange-100 text-orange-800', New: 'bg-mist text-soft',
}
export default function NgfScoreBadge({ value, band, reviews, average, size = 'sm' }: { value?: number; band?: string; reviews?: number; average?: number | null; size?: 'sm' | 'lg' }) {
  const b = band || 'New'
  const tip = `NGF Score ${value ?? 0} of 850 (${b})${reviews ? ` · ${reviews} review${reviews > 1 ? 's' : ''}, average ${average ?? '-'}/5` : ' · no reviews yet'}`
  return (
    <span title={tip} className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 font-bold ${size === 'lg' ? 'text-xs' : 'text-[10px]'} ${TONE[b] || TONE.New}`}>
      NGF {b === 'New' ? 'New' : value}<span className="font-medium opacity-75">{b === 'New' ? '' : `· ${b}`}</span>
    </span>
  )
}
