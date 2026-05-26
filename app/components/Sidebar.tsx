// app/components/Sidebar.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession as useQASession } from '@/lib/session-context'
import { useSession as useAuthSession, signOut } from 'next-auth/react'
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

interface NavItem {
  label: string
  href: string
  badge?: number
  icon: React.ReactNode
  alwaysActive?: boolean
}

interface NavSection {
  heading: string
  items: NavItem[]
}

function IconGenerate() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 1.5L9.5 6H14L10.5 8.75L12 13L8 10.25L4 13L5.5 8.75L2 6H6.5L8 1.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

function IconFileUpload() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 10V3m0 0L5.5 5.5M8 3l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="2" y="11" width="12" height="3" rx="1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function IconList() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3 4h10M3 8h10M3 12h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function IconFlow() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="5" width="4" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="5" width="4" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 8h6m0 0-2-2m2 2-2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconApi() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M5 5L2 8l3 3M11 5l3 3-3 3M9 3l-2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconRobot() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="3" y="6" width="10" height="8" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="6" cy="10" r="1" fill="currentColor" />
      <circle cx="10" cy="10" r="1" fill="currentColor" />
      <path d="M8 3v3M6 3h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function IconExport() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 10V2m0 0L5 5m3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 11v2a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function IconReport() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 10V8M8 10V6M11 10V4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const { standardTCs, e2eTCs, apiTCs } = useQASession()
  const { data: authSession } = useAuthSession()
  const authUser = authSession?.user
  const role = authUser?.role as Role | undefined
  const roleBadge = role ? ROLE_BADGE_STYLE[role] : null

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
                const active = pathname === item.href || pathname.startsWith(item.href + '/')
                const disabled = isLanding && !hasSession && !item.alwaysActive

                if (disabled) {
                  return (
                    <li key={item.href}>
                      <div
                        title="Start a session first"
                        style={{ color: '#A8A8B0', pointerEvents: 'none' }}
                        className="flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm cursor-not-allowed select-none"
                      >
                        <span className="shrink-0 opacity-50">{item.icon}</span>
                        <span className="flex-1 whitespace-nowrap">{item.label}</span>
                      </div>
                    </li>
                  )
                }

                // Generate TC on the landing page: stay on page, scroll to top
                if (isLanding && item.href === '/session/generate') {
                  return (
                    <li key={item.href}>
                      <button
                        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                        className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm transition-colors text-ink-600 dark:text-ink-300 hover:bg-ink-50 dark:hover:bg-ink-700 hover:text-ink-900 dark:hover:text-ink-100"
                      >
                        <span className="shrink-0 opacity-80">{item.icon}</span>
                        <span className="flex-1 whitespace-nowrap text-left">{item.label}</span>
                      </button>
                    </li>
                  )
                }

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm transition-colors ${
                        active
                          ? 'bg-accent text-white'
                          : 'text-ink-600 dark:text-ink-300 hover:bg-ink-50 dark:hover:bg-ink-700 hover:text-ink-900 dark:hover:text-ink-100'
                      }`}
                    >
                      <span className="shrink-0 opacity-80">{item.icon}</span>
                      <span className="flex-1 whitespace-nowrap">{item.label}</span>
                      {item.badge !== undefined && (
                        <span
                          className={`font-mono text-[10px] px-1.5 py-0.5 rounded-full leading-none ${
                            active
                              ? 'bg-white/20 text-white'
                              : 'bg-ink-100 dark:bg-ink-700 text-ink-500 dark:text-ink-400'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Admin link — ADMIN only */}
      {role === 'ADMIN' && (
        <div className="px-2 pb-1">
          <Link
            href="/admin"
            className="flex items-center px-2 py-2 rounded-lg text-sm text-ink-600 hover:bg-ink-50 hover:text-ink-900 transition-colors gap-2"
          >
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
        <div className="flex items-center gap-2 mb-2">
          <span className="w-7 h-7 rounded-full bg-accent text-white flex items-center justify-center text-[11px] font-semibold shrink-0">
            {authUser?.name ? initials(authUser.name) : '?'}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-ink-900 dark:text-ink-100 truncate">{authUser?.name ?? '—'}</p>
            {role && roleBadge && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                style={{ background: roleBadge.bg, color: roleBadge.color }}
              >
                {ROLE_LABELS[role]}
              </span>
            )}
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            title="Sign out"
            className="text-ink-400 hover:text-danger transition-colors shrink-0"
          >
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
      </div>
    </aside>
  )
}
