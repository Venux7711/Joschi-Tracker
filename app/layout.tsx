import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { cookies } from 'next/headers'
import './globals.css'
import BottomNav from '@/components/BottomNav'

const inter = Inter({ subsets: ['latin', 'latin-ext'] })

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
  // Theme der aktiven Katze aus dem Cookie (vom CatSwitcher gesetzt) →
  // färbt via CSS-Variablen die ganze App. Standard = Joschi (amber).
  const themeCookie = cookies().get('active_cat_theme')?.value
  const theme = themeCookie === 'silver' ? 'silver' : 'amber'

  return (
    <html lang="de" data-theme={theme}>
      <body className={inter.className}>
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
