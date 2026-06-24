import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { ToastProvider } from '@/components/shared/Toast'
import { PersonaSwitcher } from '@/components/shared/PersonaSwitcher'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  weight: ['400', '500', '600', '700', '800'],
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '600', '700'],
})

export const metadata: Metadata = {
  title: 'Verdikt — Binary Prediction Markets',
  description: 'iGaming prediction market engine for African operators',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="antialiased" style={{ fontFamily: 'var(--font-inter), sans-serif' }}>
        <ToastProvider>
          <PersonaSwitcher />
          {children}
        </ToastProvider>
      </body>
    </html>
  )
}
