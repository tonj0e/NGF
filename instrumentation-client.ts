import * as Sentry from '@sentry/nextjs'
import { scrubEvent } from './lib/sentryScrub'

// Browser errors (which page, which browser). The key comes from the server at start-up, so saving it in Dev is enough (no rebuild).
fetch('/api/monitor-config').then(r => r.json()).then(j => {
  const dsn = j?.data?.dsn as string | undefined
  if (dsn) Sentry.init({ dsn, tracesSampleRate: 0, beforeSend: scrubEvent })
}).catch(() => { /* no tracking: nothing else changes */ })

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
