// app/components/Sidebar.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'
import { useSession as useQASession } from '@/lib/session-context'
import { useSession as useAuthSession, signOut } from 'next-auth/react'
import { useTimesheetContextSafe } from '@/lib/timesheet-context'
import { ThemeToggle } from '@/app/components/ThemeToggle'

type Role = 'ADMIN' | 'QA_LEAD' | 'QA_ENGINEER' | 'MANAGER'

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Admin',
  QA_LEAD: 'QA Lead',
  QA_ENGINEER: 'QA Engineer',
  MANAGER: 'Manager',
}

const ROLE_BADGE_STYLE: Record<Role, { bg: string; color: string }> = {
  ADMIN: { bg: '#FEF2F2', color: '#C0392B' },
  QA_LEAD: { bg: '#EEF2FF', color: '#3730A3' },
  QA_ENGINEER: { bg: '#EEF4FF', color: '#1A56DB' },
  MANAGER: { bg: '#ECFDF5', color: '#0B7A51' },
}

function initials(name: string) {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
}

function formatHMS(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':')
}

function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`
  return `${m}m`
}

// ── Timer widget (QA_ENGINEER only) ──────────────────────────────────────────

function TimerWidget() {
  const ts = useTimesheetContextSafe()
  const [expanded, setExpanded] = useState(false)
  const [todayTotal, setTodayTotal] = useState<number | null>(null)
  const [ticketTotal, setTicketTotal] = useState<number | null>(null)

  const fetchTotals = useCallback(async (ticketKey: string) => {
    try {
      const res = await fetch('/api/timesheet/my?filter=today')
      if (!res.ok) return
      const entries: { ticketKey: string; liveDuration: number; status: string }[] = await res.json()
      const today = entries.reduce((s, e) => s + (e.liveDuration ?? 0), 0)
      const ticket = entries.filter(e => e.ticketKey === ticketKey)
        .reduce((s, e) => s + (e.liveDuration ?? 0), 0)
      setTodayTotal(today)
      setTicketTotal(ticket)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (expanded && ts?.current?.ticketKey) {
      fetchTotals(ts.current.ticketKey)
    }
  }, [expanded, ts?.current?.ticketKey, fetchTotals])

  if (!ts?.current || ts.current.status === 'completed') return null

  const { current, elapsedSeconds, idlePaused, pause, resume, stop } = ts
  const status = current.status as 'active' | 'paused'

  const COLOR = {
    active: '#0B7A51',
    paused: '#92400E',
  }[status]

  const startedAt = new Date(current.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="mx-2 mb-1">
      {/* Compact row — click to expand */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border transition-colors hover:bg-ink-50 dark:hover:bg-ink-700"
        style={{ borderColor: `${COLOR}30`, background: `${COLOR}08` }}
      >
        <span className="text-[10px]">⏱</span>
        <span
          className="font-mono text-sm font-semibold flex-1 text-left tabular-nums"
          style={{ color: COLOR }}
        >
          {formatHMS(elapsedSeconds)}
        </span>
        <svg
          width="12" height="12" viewBox="0 0 12 12" fill="none"
          className="text-ink-400 transition-transform"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <p className="font-mono text-[10px] text-ink-500 px-2.5 mt-0.5 truncate">{current.ticketKey}</p>

      {/* Expanded panel */}
      {expanded && (
        <div className="mt-1.5 px-2.5 py-3 bg-white dark:bg-ink-800 border border-ink-100 dark:border-ink-700 rounded-lg flex flex-col gap-2.5">
          <div className="flex flex-col gap-1 text-xs text-ink-600 dark:text-ink-300">
            <div className="flex justify-between">
              <span>Today total</span>
              <span className="font-mono font-medium text-ink-900 dark:text-ink-100">
                {todayTotal !== null ? formatMinutes(todayTotal) : '…'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>This ticket</span>
              <span className="font-mono font-medium text-ink-900 dark:text-ink-100">
                {ticketTotal !== null ? formatMinutes(ticketTotal) : '…'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Started</span>
              <span className="font-mono text-ink-500">{startedAt}</span>
            </div>
          </div>

          <div className="flex gap-1.5 pt-1 border-t border-ink-100 dark:border-ink-700">
            {status === 'active' ? (
              <button
                onClick={() => pause('manual')}
                className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 rounded-md border border-ink-200 text-ink-700 hover:bg-ink-50 dark:border-ink-600 dark:text-ink-300 dark:hover:bg-ink-700 transition-colors"
              >
                <span>⏸</span> Pause
              </button>
            ) : (
              <button
                onClick={() => resume()}
                className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 rounded-md border border-ink-200 text-ink-700 hover:bg-ink-50 dark:border-ink-600 dark:text-ink-300 dark:hover:bg-ink-700 transition-colors"
              >
                <span>▶</span> Resume
              </button>
            )}
            <button
              onClick={() => { stop(); setExpanded(false) }}
              className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 rounded-md border border-red-200 text-danger hover:bg-red-50 transition-colors"
            >
              <span>⏹</span> Stop
            </button>
          </div>

          {idlePaused && (
            <p className="text-[10px] text-warn bg-amber-50 rounded px-2 py-1">
              Paused — no activity detected
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Nav icons ─────────────────────────────────────────────────────────────────

function IconGenerate() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1.5L9.5 6H14L10.5 8.75L12 13L8 10.25L4 13L5.5 8.75L2 6H6.5L8 1.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
}
function IconFileUpload() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 10V3m0 0L5.5 5.5M8 3l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /><rect x="2" y="11" width="12" height="3" rx="1" stroke="currentColor" strokeWidth="1.5" /></svg>
}
function IconList() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M3 8h10M3 12h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
}
function IconFlow() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="5" width="4" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" /><rect x="11" y="5" width="4" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" /><path d="M5 8h6m0 0-2-2m2 2-2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
}
function IconApi() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M5 5L2 8l3 3M11 5l3 3-3 3M9 3l-2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
}
function IconRobot() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="3" y="6" width="10" height="8" rx="2" stroke="currentColor" strokeWidth="1.5" /><circle cx="6" cy="10" r="1" fill="currentColor" /><circle cx="10" cy="10" r="1" fill="currentColor" /><path d="M8 3v3M6 3h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
}
function IconExport() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 10V2m0 0L5 5m3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M2 11v2a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
}
function IconReport() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" /><path d="M5 10V8M8 10V6M11 10V4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
}
function IconClock() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" /><path d="M8 5v3l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

interface NavItem { label: string; href: string; badge?: number; icon: React.ReactNode; alwaysActive?: boolean }
interface NavSection { heading: string; items: NavItem[]; qaEngineerOnly?: boolean }

export function Sidebar() {
  const pathname = usePathname()
  const { standardTCs, e2eTCs, apiTCs } = useQASession()
  const { data: authSession, status: authStatus } = useAuthSession()
  const authUser = authSession?.user
  const role = authUser?.role as Role | undefined
  const roleBadge = role ? ROLE_BADGE_STYLE[role] : null

  const isLoggedIn = authStatus === 'authenticated'
  const isLanding = pathname === '/'
  const hasSession = standardTCs.length > 0 || e2eTCs.length > 0 || apiTCs.length > 0

  const sections: NavSection[] = [
    {
      heading: 'SESSION',
      items: [
        { label: 'Generate TC', href: '/session/generate', icon: <IconGenerate />, alwaysActive: true },
        { label: 'Import Excel', href: '/session/import', icon: <IconFileUpload />, alwaysActive: true },
      ],
    },
    {
      heading: 'TEST CASES',
      items: [
        { label: 'Standard', href: '/session/standard', badge: standardTCs.length || undefined, icon: <IconList /> },
        { label: 'E2E', href: '/session/e2e', badge: e2eTCs.length || undefined, icon: <IconFlow /> },
        { label: 'API', href: '/session/api', badge: apiTCs.length || undefined, icon: <IconApi /> },
      ],
    },
    {
      heading: 'EXPORT',
      items: [
        { label: 'Robot', href: '/session/robot', icon: <IconRobot /> },
        { label: 'Export / Push', href: '/session/export', icon: <IconExport /> },
      ],
    },
    {
      heading: 'REPORT',
      items: [
        { label: 'Report', href: '/session/report', icon: <IconReport /> },
        { label: 'Timesheet', href: '/session/timesheet', icon: <IconClock /> },
      ],
    },
  ]

  return (
    <aside className="w-[210px] min-h-screen bg-white dark:bg-ink-800 border-r border-ink-100 dark:border-ink-700 flex flex-col shrink-0">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-ink-100 dark:border-ink-700">
        <Link href="/" className="flex items-center gap-2 group">
          <span className="w-7 h-7 rounded-md bg-accent flex items-center justify-center shrink-0">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M8 1L10 6H15L11 9.5L12.5 15L8 11.5L3.5 15L5 9.5L1 6H6L8 1Z" fill="white" />
            </svg>
          </span>
          <span className="text-sm font-semibold text-ink-900 dark:text-ink-100 group-hover:text-accent transition-colors">
            QA Assist
          </span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 flex flex-col gap-4 overflow-y-auto">
        {sections.map(section => (
          <div key={section.heading}>
            <p className="font-mono text-[10px] font-medium tracking-widest text-ink-400 uppercase px-2 mb-1">
              {section.heading}
            </p>
            <ul className="flex flex-col gap-0.5">
              {section.items.map(item => {
                if (!isLoggedIn) {
                  return (
                    <li key={item.href}>
                      <div style={{ color: '#A8A8B0', pointerEvents: 'none', opacity: 0.5 }}
                        className="flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm cursor-not-allowed select-none">
                        <span className="shrink-0">{item.icon}</span>
                        <span className="flex-1 whitespace-nowrap">{item.label}</span>
                      </div>
                    </li>
                  )
                }

                const active = pathname === item.href || pathname.startsWith(item.href + '/')
                const disabled = isLanding && !hasSession && !item.alwaysActive

                if (disabled) {
                  return (
                    <li key={item.href}>
                      <div title="Start a session first" style={{ color: '#A8A8B0', pointerEvents: 'none' }}
                        className="flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm cursor-not-allowed select-none">
                        <span className="shrink-0 opacity-50">{item.icon}</span>
                        <span className="flex-1 whitespace-nowrap">{item.label}</span>
                      </div>
                    </li>
                  )
                }

                if (isLanding && item.href === '/session/generate') {
                  return (
                    <li key={item.href}>
                      <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                        className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm transition-colors text-ink-600 dark:text-ink-300 hover:bg-ink-50 dark:hover:bg-ink-700 hover:text-ink-900 dark:hover:text-ink-100">
                        <span className="shrink-0 opacity-80">{item.icon}</span>
                        <span className="flex-1 whitespace-nowrap text-left">{item.label}</span>
                      </button>
                    </li>
                  )
                }

                return (
                  <li key={item.href}>
                    <Link href={item.href}
                      className={`flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm transition-colors ${
                        active
                          ? 'bg-accent text-white'
                          : 'text-ink-600 dark:text-ink-300 hover:bg-ink-50 dark:hover:bg-ink-700 hover:text-ink-900 dark:hover:text-ink-100'
                      }`}>
                      <span className="shrink-0 opacity-80">{item.icon}</span>
                      <span className="flex-1 whitespace-nowrap">{item.label}</span>
                      {item.badge !== undefined && (
                        <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded-full leading-none ${
                          active ? 'bg-white/20 text-white' : 'bg-ink-100 dark:bg-ink-700 text-ink-500 dark:text-ink-400'
                        }`}>{item.badge}</span>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Timer widget — QA_ENGINEER only */}
      {isLoggedIn && role === 'QA_ENGINEER' && <TimerWidget />}

      {/* Admin link — ADMIN and MANAGER */}
      {isLoggedIn && (role === 'ADMIN' || role === 'MANAGER') && (
        <div className="px-2 pb-1">
          <Link href="/admin"
            className="flex items-center px-2 py-2 rounded-lg text-sm text-ink-600 hover:bg-ink-50 hover:text-ink-900 transition-colors gap-2">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.5" />
              <path d="M2 14c0-3.314 2.686-5 6-5s6 1.686 6 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Admin
          </Link>
        </div>
      )}

      {/* Footer */}
      <div className="px-3 py-3 border-t border-ink-100 dark:border-ink-700">
        {isLoggedIn ? (
          <>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-7 h-7 rounded-full bg-accent text-white flex items-center justify-center text-[11px] font-semibold shrink-0">
                {authUser?.name ? initials(authUser.name) : '?'}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-ink-900 dark:text-ink-100 truncate">{authUser?.name ?? '—'}</p>
                {role && roleBadge && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                    style={{ background: roleBadge.bg, color: roleBadge.color }}>
                    {ROLE_LABELS[role]}
                  </span>
                )}
              </div>
              <button onClick={() => signOut({ callbackUrl: '/login' })} title="Sign out"
                className="text-ink-400 hover:text-danger transition-colors shrink-0">
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                  <path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3M10 11l3-3-3-3M13 8H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            <div className="flex items-center justify-between">
              <Link href="/" className="text-xs text-ink-400 hover:text-ink-600 transition-colors">
                ← New session
              </Link>
              <ThemeToggle />
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <Link href="/login" className="flex-1 btn-primary text-xs py-2 text-center">Sign in</Link>
            <ThemeToggle />
          </div>
        )}
      </div>
    </aside>
  )
}
