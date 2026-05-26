// app/session/layout.tsx
'use client'

import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import { useSession as useQASession } from '@/lib/session-context'
import { TimesheetProvider, useTimesheetContext } from '@/lib/timesheet-context'

// ── Timesheet orchestrator: auto-start/pause/stop based on route + ticket ────

function TimesheetOrchestrator() {
  const { data: authSession } = useSession()
  const { jiraKey, requirement } = useQASession()
  const { current, idleToast, start, pause, stop, resume, dismissIdleToast } = useTimesheetContext()
  const pathname = usePathname()
  const inSession = pathname.startsWith('/session/')
  const role = authSession?.user?.role

  const prevPathInSession = useRef(false)
  const prevJiraKey = useRef<string | null>(null)

  useEffect(() => {
    if (role !== 'QA_ENGINEER') return

    const wasInSession = prevPathInSession.current
    const prevKey = prevJiraKey.current

    prevPathInSession.current = inSession
    prevJiraKey.current = jiraKey ?? null

    if (!inSession) {
      // Navigated away from /session/* — pause timer
      if (wasInSession && current && current.status === 'active') {
        pause('manual')
      }
      return
    }

    if (!jiraKey) return

    if (!current || current.status === 'completed') {
      // No timer or completed — start fresh
      start(jiraKey, requirement || undefined)
    } else if (current.ticketKey !== jiraKey) {
      // Different ticket — start new (start() auto-pauses the old one)
      start(jiraKey, requirement || undefined)
    } else if (current.status === 'paused' && !wasInSession) {
      // Came back to same ticket — resume
      resume()
    } else if (!wasInSession && current.status === 'active') {
      // Re-entered session with active timer on same ticket — keep running
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inSession, jiraKey, role])

  // Stop timer on sign-out / session expiry (handled by parent)
  useEffect(() => {
    return () => {
      if (current && current.status === 'active') {
        stop()
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!idleToast) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-white border border-ink-200 rounded-[10px] px-4 py-3 shadow-lg flex items-center gap-3 max-w-xs">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-warn shrink-0">
        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 5v3M8 10v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <p className="text-xs text-ink-700 flex-1">Timer paused — no activity detected</p>
      <button
        onClick={() => { resume(); dismissIdleToast() }}
        className="text-xs text-accent font-medium hover:underline whitespace-nowrap"
      >
        Resume
      </button>
      <button onClick={dismissIdleToast} className="text-ink-400 hover:text-ink-700 text-sm leading-none ml-1">×</button>
    </div>
  )
}

// ── Session expiry guard ──────────────────────────────────────────────────────

function SessionExpiryGuard({ children }: { children: ReactNode }) {
  const { status } = useSession()
  const router = useRouter()
  const qaSession = useQASession()
  const { current: tsEntry, stop: stopTimer, elapsedSeconds } = useTimesheetContext()
  const [showExpiredModal, setShowExpiredModal] = useState(false)
  const wasAuthenticated = useRef(false)
  const autoSaveInterval = useRef<ReturnType<typeof setInterval> | null>(null)

  // Always-current ref to avoid stale closure in interval
  const latestSession = useRef(qaSession)
  useEffect(() => { latestSession.current = qaSession })

  async function saveToDb() {
    const { requirement, jiraKey, standardTCs, e2eTCs, apiTCs } = latestSession.current
    try {
      await fetch('/api/session-saved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketKey: jiraKey || undefined,
          sessionData: {
            requirement, jiraKey, standardTCs, e2eTCs, apiTCs,
            savedPage: typeof window !== 'undefined' ? window.location.pathname : null,
          },
        }),
      })
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (status === 'authenticated') {
      wasAuthenticated.current = true
      autoSaveInterval.current = setInterval(saveToDb, 5 * 60 * 1000)
    }

    if (status === 'unauthenticated' && wasAuthenticated.current) {
      if (autoSaveInterval.current) clearInterval(autoSaveInterval.current)
      stopTimer()
      setShowExpiredModal(true)
    }

    return () => { if (autoSaveInterval.current) clearInterval(autoSaveInterval.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  if (showExpiredModal) {
    const activeMinutes = tsEntry ? Math.floor(elapsedSeconds / 60) : 0
    const hh = Math.floor(activeMinutes / 60)
    const mm = activeMinutes % 60
    const timeStr = activeMinutes > 0
      ? (hh > 0 ? `${hh}h ${mm}m` : `${mm}m`)
      : null

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
          <p className="text-sm text-ink-500 mb-1">
            Your session timed out after 30 minutes of inactivity. Your work has been saved.
          </p>
          {timeStr && tsEntry && (
            <p className="text-xs text-ink-400 mb-5 font-mono">
              Active time: {timeStr} on {tsEntry.ticketKey}
            </p>
          )}
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

  return (
    <>
      {children}
      <TimesheetOrchestrator />
    </>
  )
}

// ── Layout root ───────────────────────────────────────────────────────────────

export default function SessionLayout({ children }: { children: ReactNode }) {
  return (
    <TimesheetProvider>
      <SessionExpiryGuard>
        {children}
      </SessionExpiryGuard>
    </TimesheetProvider>
  )
}
