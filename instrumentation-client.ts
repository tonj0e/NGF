// Browser errors (which page, which browser). The key comes from the server at start-up, so saving it in Dev is enough (no rebuild).
// started a few seconds after the page is up, so it never competes with the first screen. The Sentry code itself
// (the biggest piece of the sign-in page's JavaScript) is downloaded only then, and only when a key is saved.
type SentryModule = typeof import('@sentry/nextjs')
let sentry: SentryModule | null = null

setTimeout(() => {
  fetch('/api/monitor-config').then(r => r.json()).then(async j => {
    const dsn = j?.data?.dsn as string | undefined
    if (!dsn) return
    const [mod, { scrubEvent }] = await Promise.all([import('@sentry/nextjs'), import('./lib/sentryScrub')])
    mod.init({ dsn, tracesSampleRate: 0, beforeSend: scrubEvent })
    sentry = mod
  }).catch(() => { /* no tracking: nothing else changes */ })
}, 4000)

// App Router page changes (the app itself moves between pages by #hash, which this does not see). Before Sentry is
// loaded this does nothing, exactly as before it was started.
export function onRouterTransitionStart(href: string, navigationType: 'push' | 'replace' | 'traverse') {
  sentry?.captureRouterTransitionStart(href, navigationType)
}
