import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import BottomNav from '@/components/BottomNav'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Joschi',
  description: 'Gesundheitstracker für Joschi',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Joschi',
  },
  icons: {
    icon: '/joschi.jpg',
    apple: '/joschi.jpg',
  },
}

export const viewport: Viewport = {
  themeColor: '#f59e0b',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="de">
      <body className={inter.className} style={{ paddingBottom: 'calc(56px + env(safe-area-inset-bottom))' }}>
        {children}
        <BottomNav />
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
              navigator.serviceWorker.register('/sw.js').catch(() => {});
            });
          }
        `}} />
      </body>
    </html>
  )
}
