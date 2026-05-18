// app/session/layout.tsx
import type { ReactNode } from 'react'
import { Sidebar } from '@/app/components/Sidebar'

export default function SessionLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-ink-50 dark:bg-ink-900">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
        {children}
      </div>
    </div>
  )
}
