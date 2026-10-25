import type { Metadata, Viewport } from 'next'
import './globals.css'
import AutoUppercase from '@/components/AutoUppercase'
import PwaClient from '@/components/PwaClient'

export const metadata: Metadata = {
  title: 'NGF FINCORP',
  applicationName: 'NGF FINCORP',
  description: 'NGF FINCORP finance operations: customers, collection, payments and reports.',
  // the web app manifest is app/manifest.ts; these are for the iPhone / iPad home screen
  icons: { icon: [{ url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' }, { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }], apple: '/icons/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'NGF', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
  other: { 'apple-mobile-web-app-capable': 'yes' },   // older iPhones only honour this name
}

export const viewport: Viewport = {
  themeColor: '#1a1a2e',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',   // lets the app use the whole screen on phones with a notch (the header keeps clear of it)
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-[#f4f5f7] text-[#1a1a2e] antialiased">
        <AutoUppercase />
        {children}
        <PwaClient />
      </body>
    </html>
  )
}
