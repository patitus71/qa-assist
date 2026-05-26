'use client'

import { SessionProvider as NextAuthProvider } from 'next-auth/react'
import { SessionProvider as QASessionProvider } from '@/lib/session-context'
import type { ReactNode } from 'react'

export function Providers({ children }: { children: ReactNode }) {
  return (
    <NextAuthProvider>
      <QASessionProvider>{children}</QASessionProvider>
    </NextAuthProvider>
  )
}
