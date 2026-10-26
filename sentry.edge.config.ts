import * as Sentry from '@sentry/nextjs'
import { scrubEvent, scrubLog } from './lib/sentryScrub'

// Error tracking and logs. Does nothing until SENTRY_DSN (or NEXT_PUBLIC_SENTRY_DSN) is set on the server.
const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN
Sentry.init({
  dsn, enabled: !!dsn, environment: process.env.NODE_ENV,
  tracesSampleRate: 0,
  beforeSend: scrubEvent, beforeSendLog: scrubLog,
})
