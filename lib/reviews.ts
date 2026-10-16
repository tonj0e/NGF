// Reviews are stored in a repayment's Notes as e.g. "Review: 4★ · Punctual".
// Pull the rating and label back out. Returns null when there is no review;
// rating is 0 for old-format reviews that have no star rating.
export function parseReview(notes: string): { rating: number; label: string } | null {
  if (!notes) return null
  const idx = notes.indexOf('Review:')
  if (idx === -1) return null
  const text = notes.slice(idx + 'Review:'.length).trim()
  const m = text.match(/^(\d)\s*★/)
  const rating = m ? Number(m[1]) : 0
  const label = m ? text.slice(m[0].length).replace(/^\s*·\s*/, '').trim() : text
  return { rating, label }
}

// Renewal eligibility from a customer's repayment history.
// Rules: outstanding dues or delayed payments → not eligible; no reviews → eligible;
// good average rating → eligible; poor average rating → not eligible.
export function evaluateRenewal(rows: any[]): {
  eligible: boolean; reasons: string[]; rating: number; reviewCount: number
} {
  const reviews = rows
    .map(r => parseReview(r['Notes'] || ''))
    .filter((rev): rev is { rating: number; label: string } => !!rev && rev.rating > 0)
  const rating = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0
  const dues = rows.filter(r => r['Status'] === 'Overdue' || r['Status'] === 'Not Paid').length
  const delayed = rows.filter(r => r['Status'] === 'Delayed').length

  const reasons: string[] = []
  let eligible = true
  if (dues > 0) { eligible = false; reasons.push(`${dues} outstanding due${dues > 1 ? 's' : ''}`) }
  if (delayed > 0) { eligible = false; reasons.push(`${delayed} delayed payment${delayed > 1 ? 's' : ''}`) }
  if (reviews.length > 0 && rating < 3) { eligible = false; reasons.push(`Low customer rating (${rating.toFixed(1)}/5)`) }

  return { eligible, reasons, rating, reviewCount: reviews.length }
}
