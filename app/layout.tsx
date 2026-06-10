// app/layout.tsx
import type { Metadata } from 'next'
import { DM_Sans, DM_Mono } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { Sidebar } from '@/app/components/Sidebar'

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
})

const dmMono = DM_Mono({
  subsets: ['latin'],
  variable: '--font-dm-mono',
  weight: ['300', '400', '500'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'QA Assist',
  description: 'AI-powered QA tool for banking teams',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${dmSans.variable} ${dmMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            try {
              var t = localStorage.getItem('theme');
              var prefer = window.matchMedia('(prefers-color-scheme: dark)').matches;
              if (t === 'dark' || (!t && prefer)) {
                document.documentElement.classList.add('dark');
              }
            } catch(e) {}
          })();
        ` }} />
      </head>
      <body>
        <Providers>
          <div className="flex min-h-screen bg-ink-50 dark:bg-ink-900">
            <Sidebar />
            {/* md:pl-[48px]: offset for fixed 48px icon rail on tablet
                lg:pl-0: desktop sidebar is static (in flow), no offset needed
                pt-12 md:pt-0: push content below fixed mobile hamburger button */}
            <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden md:pl-[48px] lg:pl-0 pt-12 md:pt-0">
              {children}
            </div>
          </div>
        </Providers>
      </body>
    </html>
  )
}
