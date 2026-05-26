// app/session/layout.tsx
'use client'

import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useSession as useQASession } from '@/lib/session-context'

function SessionExpiryGuard({ children }: { children: ReactNode }) {
  const { status } = useSession()
  const router = useRouter()
  const qaSession = useQASession()
  const [showExpiredModal, setShowExpiredModal] = useState(false)
  const wasAuthenticated = useRef(false)
  const autoSaveInterval = useRef<ReturnType<typeof setInterval> | null>(null)

  // Ref always holds the latest session state — avoids stale closure in interval
  const latestSession = useRef(qaSession)
  useEffect(() => { latestSession.current = qaSession })

  async function saveToDb() {
    const { requirement, jiraKey, standardTCs, e2eTCs, apiTCs } = latestSession.current
    try {
      const sessionData = {
        requirement,
        jiraKey,
        standardTCs,
        e2eTCs,
        apiTCs,
        savedPage: typeof window !== 'undefined' ? window.location.pathname : null,
      }
      await fetch('/api/session-saved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketKey: jiraKey || undefined, sessionData }),
      })
    } catch { /* ignore — best effort */ }
  }

  useEffect(() => {
    if (status === 'authenticated') {
      wasAuthenticated.current = true
      // Auto-save every 5 minutes using latest state via ref
      autoSaveInterval.current = setInterval(saveToDb, 5 * 60 * 1000)
    }

    if (status === 'unauthenticated' && wasAuthenticated.current) {
      if (autoSaveInterval.current) clearInterval(autoSaveInterval.current)
      setShowExpiredModal(true)
    }

    return () => {
      if (autoSaveInterval.current) clearInterval(autoSaveInterval.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  if (showExpiredModal) {
    return (
      <div className="min-h-screen bg-[#F4F4F6] flex items-center justify-center p-4">
        <div
          className="bg-white rounded-[12px] border border-ink-200 w-full max-w-sm p-8 text-center"
          style={{ boxShadow: '0 8px 32px rgba(13,13,14,0.12)' }}
        >
          <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto mb-4">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="text-amber-500">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
              <path d="M12 7v5M12 16v1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <h2 className="text-base font-semibold text-ink-900 mb-2">Session expired</h2>
          <p className="text-sm text-ink-500 mb-6">
            Your session timed out after 30 minutes of inactivity. Your work has been saved.
          </p>
          <button
            onClick={() => router.push('/login?expired=1')}
            className="btn-primary w-full"
          >
            Sign in to resume
          </button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

export default function SessionLayout({ children }: { children: ReactNode }) {
  return (
    <SessionExpiryGuard>
      {children}
    </SessionExpiryGuard>
  )
}
