import type { Metadata } from 'next'
import './globals.css'
import AutoUppercase from '@/components/AutoUppercase'

export const metadata: Metadata = {
  title: 'NGF FINCORP',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-[#f4f5f7] text-[#1a1a2e] antialiased">
        <AutoUppercase />
        {children}
      </body>
    </html>
  )
}
