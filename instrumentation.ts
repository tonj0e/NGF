import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
    const { ensureSentry } = await import('./lib/monitor')
    await ensureSentry()
  }
  if (process.env.NEXT_RUNTIME === 'edge') await import('./sentry.edge.config')
}

// errors from pages and server actions that Next.js catches itself
export const onRequestError: typeof Sentry.captureRequestError = async (...args) => {
  if (process.env.NEXT_RUNTIME === 'nodejs') { const { ensureSentry } = await import('./lib/monitor'); await ensureSentry() }
  return Sentry.captureRequestError(...args)
}
