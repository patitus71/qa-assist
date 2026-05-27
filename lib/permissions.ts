// lib/permissions.ts
// Shared permission constants — safe to import in middleware (Edge), auth.ts, Sidebar, and admin UI.
// No Prisma or Node-only imports here.

export const ALL_MENU_KEYS = [
  'dashboard',
  'standard',
  'e2e',
  'api',
  'robot',
  'export',
  'report',
  'timesheet',
] as const

export type MenuKey = (typeof ALL_MENU_KEYS)[number]

export const MENU_LABELS: Record<MenuKey, string> = {
  dashboard: 'Dashboard',
  standard:  'Standard TC',
  e2e:       'E2E TC',
  api:       'API TC',
  robot:     'Robot',
  export:    'Export / Push',
  report:    'Report',
  timesheet: 'Timesheet',
}

// Grouped sections for the admin permission matrix UI
export const MENU_SECTIONS: { heading: string; keys: MenuKey[] }[] = [
  { heading: 'Analytics',  keys: ['dashboard', 'report'] },
  { heading: 'Test Cases', keys: ['standard', 'e2e', 'api'] },
  { heading: 'Output',     keys: ['robot', 'export'] },
  { heading: 'Time',       keys: ['timesheet'] },
]

// Route prefix → menu key required to access.
// /admin is handled separately by role check — not here.
export const ROUTE_PERMISSION_MAP: { prefix: string; key: MenuKey }[] = [
  { prefix: '/dashboard',         key: 'dashboard' },
  { prefix: '/session/standard',  key: 'standard' },
  { prefix: '/session/e2e',       key: 'e2e' },
  { prefix: '/session/api',       key: 'api' },
  { prefix: '/session/robot',     key: 'robot' },
  { prefix: '/session/export',    key: 'export' },
  { prefix: '/session/report',    key: 'report' },
  { prefix: '/session/timesheet', key: 'timesheet' },
]

// Default permissions when no DB rows exist for a role (fail-open).
// ADMIN always gets every key — do NOT add ADMIN here.
export const DEFAULT_PERMISSIONS: Record<string, string[]> = {
  QA_LEAD:     [...ALL_MENU_KEYS],
  QA_ENGINEER: ['standard', 'e2e', 'api', 'robot', 'export', 'timesheet'],
  MANAGER:     ['dashboard', 'report'],
}
