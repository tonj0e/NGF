import type { Metadata, Viewport } from 'next'
import './globals.css'
import AutoUppercase from '@/components/AutoUppercase'
import PwaClient from '@/components/PwaClient'
import CsrfFetch from '@/components/CsrfFetch'

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
  themeColor: '#14213d',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',   // lets the app use the whole screen on phones with a notch (the header keeps clear of it)
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        {/* apply the saved dark mode before the page paints, so there is no light flash (login page too) */}
        <script dangerouslySetInnerHTML={{ __html: "try{if(localStorage.getItem('ngf_dark_mode')==='1')document.documentElement.classList.add('ngf-dark')}catch(e){}" }} />
      </head>
      <body className="min-h-full bg-mist text-ink antialiased">
        <AutoUppercase />
        {children}
        <PwaClient />
        <CsrfFetch />
      </body>
    </html>
  )
}
