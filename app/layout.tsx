import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { ToastProvider } from '@/components/shared/Toast'
import { PersonaSwitcher } from '@/components/shared/PersonaSwitcher'
import { ThemeProvider } from '@/components/shared/ThemeProvider'

// Set data-theme and data-skin before first paint to avoid a flash of the
// wrong theme/skin.
const themeScript = `(function(){try{var m=localStorage.getItem('verdikt_theme')||'dark';var d=m==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):m;document.documentElement.dataset.theme=d;var s=localStorage.getItem('verdikt_skin')||'classic';document.documentElement.dataset.skin=s;}catch(e){document.documentElement.dataset.theme='dark';document.documentElement.dataset.skin='classic';}})();`

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
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`} data-theme="dark" data-skin="classic">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="antialiased" style={{ fontFamily: 'var(--font-inter), sans-serif' }}>
        <ThemeProvider>
          <ToastProvider>
            <PersonaSwitcher />
            {children}
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
