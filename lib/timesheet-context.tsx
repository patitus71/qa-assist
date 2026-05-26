'use client'

import {
  createContext, useContext, useState, useEffect,
  useRef, useCallback, type ReactNode,
} from 'react'

export type TimerStatus = 'active' | 'paused' | 'completed'

export interface TimesheetEntry {
  id: string
  ticketKey: string
  ticketName: string | null
  status: TimerStatus
  startTime: string   // ISO — reset each resume
  duration: number    // accumulated minutes (not counting current active segment)
  createdAt: string
}

interface TimesheetContextValue {
  current: TimesheetEntry | null
  elapsedSeconds: number
  idlePaused: boolean
  idleToast: boolean
  start: (ticketKey: string, ticketName?: string) => Promise<void>
  pause: (reason?: 'idle' | 'manual') => Promise<void>
  resume: () => Promise<void>
  stop: () => Promise<void>
  dismissIdleToast: () => void
}

const TimesheetContext = createContext<TimesheetContextValue | null>(null)

export function useTimesheetContext() {
  const ctx = useContext(TimesheetContext)
  if (!ctx) throw new Error('useTimesheetContext must be inside TimesheetProvider')
  return ctx
}

// Safe hook for use outside the provider (e.g. Sidebar on landing page)
export function useTimesheetContextSafe(): TimesheetContextValue | null {
  return useContext(TimesheetContext)
}

export function TimesheetProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<TimesheetEntry | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [idlePaused, setIdlePaused] = useState(false)
  const [idleToast, setIdleToast] = useState(false)

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const idleCheckRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastActivityRef = useRef(Date.now())
  const currentRef = useRef(current)
  const idlePausedRef = useRef(idlePaused)

  useEffect(() => { currentRef.current = current }, [current])
  useEffect(() => { idlePausedRef.current = idlePaused }, [idlePaused])

  function clearTick() {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null }
  }

  function startTick(entry: TimesheetEntry) {
    clearTick()
    const base = new Date(entry.startTime).getTime()
    const acc = (entry.duration ?? 0) * 60
    tickRef.current = setInterval(() => {
      setElapsedSeconds(acc + Math.floor((Date.now() - base) / 1000))
    }, 1000)
  }

  const start = useCallback(async (ticketKey: string, ticketName?: string) => {
    try {
      const res = await fetch('/api/timesheet/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketKey, ticketName }),
      })
      if (!res.ok) return
      const entry: TimesheetEntry = await res.json()
      setCurrent(entry)
      setIdlePaused(false)
      setIdleToast(false)
      startTick(entry)
    } catch { /* ignore */ }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const pause = useCallback(async (reason: 'idle' | 'manual' = 'manual') => {
    const ts = currentRef.current
    if (!ts || ts.status !== 'active') return
    try {
      const res = await fetch('/api/timesheet/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timesheetId: ts.id }),
      })
      if (!res.ok) return
      const updated: TimesheetEntry = await res.json()
      clearTick()
      setCurrent(updated)
      setElapsedSeconds((updated.duration ?? 0) * 60)
      if (reason === 'idle') {
        setIdlePaused(true)
        setIdleToast(true)
      }
    } catch { /* ignore */ }
  }, [])

  const resume = useCallback(async () => {
    const ts = currentRef.current
    if (!ts || ts.status !== 'paused') return
    try {
      const res = await fetch('/api/timesheet/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timesheetId: ts.id }),
      })
      if (!res.ok) return
      const updated: TimesheetEntry = await res.json()
      setCurrent(updated)
      setIdlePaused(false)
      setIdleToast(false)
      startTick(updated)
    } catch { /* ignore */ }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const stop = useCallback(async () => {
    const ts = currentRef.current
    if (!ts || ts.status === 'completed') return
    try {
      clearTick()
      const res = await fetch('/api/timesheet/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timesheetId: ts.id }),
      })
      if (!res.ok) return
      const updated: TimesheetEntry = await res.json()
      setCurrent(updated)
      setElapsedSeconds((updated.duration ?? 0) * 60)
      setIdlePaused(false)
      setIdleToast(false)
    } catch { /* ignore */ }
  }, [])

  const dismissIdleToast = useCallback(() => setIdleToast(false), [])

  // ── Idle detection ─────────────────────────────────────────────────────────
  useEffect(() => {
    function resetIdle() {
      lastActivityRef.current = Date.now()
      // Auto-resume if was idle-paused
      if (idlePausedRef.current && currentRef.current?.status === 'paused') {
        resume()
      }
    }

    window.addEventListener('mousemove', resetIdle, { passive: true })
    window.addEventListener('keydown', resetIdle, { passive: true })
    window.addEventListener('click', resetIdle, { passive: true })
    window.addEventListener('scroll', resetIdle, { passive: true })

    idleCheckRef.current = setInterval(() => {
      const idle = Date.now() - lastActivityRef.current > 5 * 60 * 1000
      if (idle && currentRef.current?.status === 'active') {
        pause('idle')
      }
    }, 30_000)

    return () => {
      window.removeEventListener('mousemove', resetIdle)
      window.removeEventListener('keydown', resetIdle)
      window.removeEventListener('click', resetIdle)
      window.removeEventListener('scroll', resetIdle)
      if (idleCheckRef.current) clearInterval(idleCheckRef.current)
    }
  }, [pause, resume])

  // Cleanup on unmount
  useEffect(() => () => clearTick(), [])

  return (
    <TimesheetContext.Provider value={{
      current, elapsedSeconds, idlePaused, idleToast,
      start, pause, resume, stop, dismissIdleToast,
    }}>
      {children}
    </TimesheetContext.Provider>
  )
}
