import type { MetadataRoute } from 'next'

// Lets phones, tablets and computers install NGF FINCORP like an app (Add to Home Screen / Install app).
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'NGF FINCORP',
    short_name: 'NGF',
    description: 'NGF FINCORP finance operations: customers, collection, payments and reports.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#f2f5f9',
    theme_color: '#14213d',
    categories: ['finance', 'business'],
    lang: 'en-IN',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
