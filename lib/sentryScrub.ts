// Keeps secrets out of error reports and logs sent to Sentry: passwords, OTPs, tokens, keys, cookies, card/bank/ID numbers, whole request bodies.
const SECRET = /pass(word)?|token|secret|authorization|cookie|otp|card|cvv|aadhaar|\bpan\b|pan_?no|account_?n|ifsc|api_?key|auth_?key|signature|jwt|session/i

function clean(v: unknown, depth = 0): unknown {
  if (depth > 6 || v == null) return v
  if (Array.isArray(v)) return v.map(x => clean(x, depth + 1))
  if (typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = SECRET.test(k) ? '[removed]' : clean(val, depth + 1)
    return out
  }
  return v
}

/** Sentry beforeSend: no request bodies, cookies or auth headers; secret-looking keys blanked everywhere. */
export function scrubEvent<T extends Record<string, any>>(event: T): T {
  const e: any = event
  if (e.request) { delete e.request.data; delete e.request.cookies; if (e.request.headers) e.request.headers = clean(e.request.headers); if (e.request.query_string) e.request.query_string = '[removed]' }
  if (e.user) e.user = { id: e.user.id }
  if (e.extra) e.extra = clean(e.extra)
  if (e.contexts) e.contexts = clean(e.contexts)
  if (e.breadcrumbs) e.breadcrumbs = e.breadcrumbs.map((b: any) => ({ ...b, data: b.data ? clean(b.data) : b.data }))
  return e
}

/** Sentry beforeSendLog: blank secret-looking attributes. */
export function scrubLog<T extends Record<string, any>>(log: T): T {
  const l: any = log
  if (l.attributes) l.attributes = clean(l.attributes)
  return l
}
