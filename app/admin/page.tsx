'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'

type Role = 'ADMIN' | 'QA_LEAD' | 'QA_ENGINEER' | 'MANAGER'
type Tab = 'users' | 'squads' | 'audit' | 'settings'

interface SquadRef { id: string; name: string }

interface UserRow {
  id: string
  name: string
  email: string
  role: Role
  active: boolean
  createdAt: string
  squadId: string | null
  squad: SquadRef | null
}

interface AuditRow {
  id: string
  userId: string
  action: string
  details: string | null
  createdAt: string
}

interface SquadRow {
  id: string
  name: string
  createdAt: string
  _count: { members: number }
}

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Admin',
  QA_LEAD: 'QA Lead',
  QA_ENGINEER: 'QA Engineer',
  MANAGER: 'Manager',
}

function generatePassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%'
  return Array.from(crypto.getRandomValues(new Uint8Array(12)))
    .map(n => chars[n % chars.length])
    .join('')
}

function initials(name: string) {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
}

// ─── Add User Modal ──────────────────────────────────────────────────────────

function AddUserModal({
  onClose,
  onCreated,
  squads,
  viewerRole,
}: {
  onClose: () => void
  onCreated: () => void
  squads: SquadRow[]
  viewerRole: Role
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('QA_ENGINEER')
  const [squadId, setSquadId] = useState('')
  const [password, setPassword] = useState('')
  const [generatedPw, setGeneratedPw] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function handleGenerate() {
    const pw = generatePassword()
    setGeneratedPw(pw)
    setPassword(pw)
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(generatedPw)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleCreate() {
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, role, password, squadId: squadId || undefined }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to create user'); return }
      onCreated()
      onClose()
    } finally {
      setLoading(false)
    }
  }

  const availableRoles = (Object.keys(ROLE_LABELS) as Role[]).filter(r =>
    viewerRole === 'ADMIN' ? true : r !== 'ADMIN'
  )

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-[12px] border border-ink-200 w-full max-w-md p-6"
        style={{ boxShadow: '0 8px 32px rgba(13,13,14,0.12)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-ink-900">Add user</h2>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-700 text-lg leading-none">×</button>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-ink-700">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name"
              className="text-sm border border-ink-200 rounded-lg px-3 py-2 focus:outline-none focus:border-accent" />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-ink-700">Email</label>
            <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="user@bank.th"
              className="text-sm border border-ink-200 rounded-lg px-3 py-2 focus:outline-none focus:border-accent" />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-ink-700">Role</label>
            <select value={role} onChange={e => setRole(e.target.value as Role)}
              className="text-sm border border-ink-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-accent">
              {availableRoles.map(r => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-ink-700">Squad</label>
            <select value={squadId} onChange={e => setSquadId(e.target.value)}
              className="text-sm border border-ink-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-accent">
              <option value="">— No squad —</option>
              {squads.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-ink-700">Password</label>
            <div className="flex gap-2">
              <input value={password} onChange={e => { setPassword(e.target.value); setGeneratedPw('') }}
                type="text" placeholder="Min. 6 characters"
                className="flex-1 text-sm border border-ink-200 rounded-lg px-3 py-2 focus:outline-none focus:border-accent font-mono" />
              <button onClick={handleGenerate} type="button"
                className="btn-ghost text-xs px-3 whitespace-nowrap">Auto-generate</button>
            </div>
            {generatedPw && (
              <div className="flex items-center gap-2 mt-1 bg-ink-50 rounded-lg px-3 py-2">
                <span className="font-mono text-xs text-ink-700 flex-1 select-all">{generatedPw}</span>
                <button onClick={handleCopy} className="text-xs text-accent hover:underline whitespace-nowrap">
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            )}
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}

          <div className="flex justify-end gap-2 mt-2">
            <button onClick={onClose} className="btn-ghost text-sm">Cancel</button>
            <button
              onClick={handleCreate}
              disabled={loading || !name || !email || !password}
              className="btn-primary text-sm disabled:opacity-40"
            >
              {loading ? 'Creating…' : 'Create user'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Add Squad Modal ──────────────────────────────────────────────────────────

function AddSquadModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleCreate() {
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/admin/squads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to create squad'); return }
      onCreated()
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-[12px] border border-ink-200 w-full max-w-sm p-6"
        style={{ boxShadow: '0 8px 32px rgba(13,13,14,0.12)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-ink-900">Add squad</h2>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-700 text-lg leading-none">×</button>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-ink-700">Squad name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !loading && name && handleCreate()}
              placeholder="e.g. Alpha Squad"
              autoFocus
              className="text-sm border border-ink-200 rounded-lg px-3 py-2 focus:outline-none focus:border-accent"
            />
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}

          <div className="flex justify-end gap-2 mt-2">
            <button onClick={onClose} className="btn-ghost text-sm">Cancel</button>
            <button
              onClick={handleCreate}
              disabled={loading || !name}
              className="btn-primary text-sm disabled:opacity-40"
            >
              {loading ? 'Creating…' : 'Create squad'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Admin Page ───────────────────────────────────────────────────────────────

export default function AdminPage() {
  const { data: session } = useSession()
  const viewerRole = (session?.user?.role ?? 'QA_ENGINEER') as Role
  const isAdmin = viewerRole === 'ADMIN'

  const [tab, setTab] = useState<Tab>('users')
  const [users, setUsers] = useState<UserRow[]>([])
  const [squads, setSquads] = useState<SquadRow[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditRow[]>([])
  const [showAddUserModal, setShowAddUserModal] = useState(false)
  const [showAddSquadModal, setShowAddSquadModal] = useState(false)
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [loadingSquads, setLoadingSquads] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [editingSquadId, setEditingSquadId] = useState<string | null>(null)
  const [editingSquadName, setEditingSquadName] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true)
    try {
      const res = await fetch('/api/admin/users')
      if (res.ok) setUsers(await res.json())
    } finally {
      setLoadingUsers(false)
    }
  }, [])

  const fetchSquads = useCallback(async () => {
    setLoadingSquads(true)
    try {
      const res = await fetch('/api/admin/squads')
      if (res.ok) setSquads(await res.json())
    } finally {
      setLoadingSquads(false)
    }
  }, [])

  const fetchAudit = useCallback(async () => {
    const res = await fetch('/api/admin/audit')
    if (res.ok) setAuditLogs(await res.json())
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])
  useEffect(() => { fetchSquads() }, [fetchSquads])
  useEffect(() => { if (tab === 'audit') fetchAudit() }, [tab, fetchAudit])

  useEffect(() => {
    if (editingSquadId && editInputRef.current) editInputRef.current.focus()
  }, [editingSquadId])

  async function handleRoleChange(id: string, role: Role) {
    setErrorMsg('')
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    })
    const data = await res.json()
    if (!res.ok) { setErrorMsg(data.error ?? 'Failed to update role'); return }
    setUsers(prev => prev.map(u => u.id === id ? { ...u, role } : u))
  }

  async function handleToggleActive(id: string, active: boolean) {
    setErrorMsg('')
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active }),
    })
    const data = await res.json()
    if (!res.ok) { setErrorMsg(data.error ?? 'Failed to update status'); return }
    setUsers(prev => prev.map(u => u.id === id ? { ...u, active } : u))
  }

  async function handleSquadAssign(userId: string, squadId: string | null) {
    setErrorMsg('')
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ squadId }),
    })
    const data = await res.json()
    if (!res.ok) { setErrorMsg(data.error ?? 'Failed to assign squad'); return }
    const newSquad = squads.find(s => s.id === squadId) ?? null
    setUsers(prev => prev.map(u =>
      u.id === userId
        ? { ...u, squadId, squad: newSquad ? { id: newSquad.id, name: newSquad.name } : null }
        : u
    ))
  }

  async function handleSquadRename(id: string) {
    if (!editingSquadName.trim()) return
    setErrorMsg('')
    const res = await fetch(`/api/admin/squads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editingSquadName.trim() }),
    })
    const data = await res.json()
    if (!res.ok) { setErrorMsg(data.error ?? 'Failed to rename squad'); return }
    setSquads(prev => prev.map(s => s.id === id ? { ...s, name: data.name } : s))
    setEditingSquadId(null)
  }

  async function handleSquadDelete(id: string) {
    setErrorMsg('')
    const res = await fetch(`/api/admin/squads/${id}`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) { setErrorMsg(data.error ?? 'Failed to delete squad'); return }
    setSquads(prev => prev.filter(s => s.id !== id))
  }

  const navItems: { id: Tab; label: string; adminOnly?: boolean }[] = [
    { id: 'users', label: 'Users' },
    { id: 'squads', label: 'Squads' },
    { id: 'audit', label: 'Audit log' },
    { id: 'settings', label: 'Settings', adminOnly: true },
  ]

  const visibleNav = navItems.filter(item => !item.adminOnly || isAdmin)

  return (
    <>
      {/* Sidebar */}
      <aside className="w-[200px] min-h-screen bg-white border-r border-ink-100 flex flex-col shrink-0">
        <div className="px-4 py-5 border-b border-ink-100">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-md bg-accent flex items-center justify-center shrink-0">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M8 1L10 6H15L11 9.5L12.5 15L8 11.5L3.5 15L5 9.5L1 6H6L8 1Z" fill="white" />
              </svg>
            </span>
            <span className="text-sm font-semibold text-ink-900">Admin</span>
          </div>
        </div>

        <nav className="flex-1 px-2 py-3 flex flex-col gap-0.5">
          {visibleNav.map(item => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`w-full text-left flex items-center px-3 py-2 rounded-lg text-sm transition-colors ${
                tab === item.id
                  ? 'bg-accent text-white'
                  : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="px-4 py-3 border-t border-ink-100">
          <Link href="/" className="text-xs text-ink-400 hover:text-ink-700 transition-colors">
            ← Back to app
          </Link>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 p-8">
        {errorMsg && (
          <div className="mb-4 max-w-4xl bg-red-50 border border-red-200 text-danger text-xs px-4 py-2 rounded-lg flex items-center justify-between">
            {errorMsg}
            <button onClick={() => setErrorMsg('')} className="ml-4 text-danger/60 hover:text-danger">×</button>
          </div>
        )}

        {/* ── Users Tab ─────────────────────────────────────────────────── */}
        {tab === 'users' && (
          <div className="flex flex-col gap-6 max-w-5xl">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-lg font-semibold text-ink-900">Users</h1>
                <p className="text-xs text-ink-500 mt-0.5">Manage team members and their access roles.</p>
              </div>
              <button onClick={() => setShowAddUserModal(true)} className="btn-primary text-sm">
                + Add user
              </button>
            </div>

            <div className="bg-white rounded-[12px] border border-ink-200 overflow-hidden">
              {loadingUsers ? (
                <div className="p-8 text-center text-sm text-ink-400">Loading…</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink-100">
                      {['Name', 'Email', 'Role', 'Squad', 'Status', ''].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-ink-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(user => {
                      const isSelf = user.id === session?.user?.id
                      const isTargetAdmin = user.role === 'ADMIN'
                      const managerRestricted = viewerRole === 'MANAGER' && isTargetAdmin

                      return (
                        <tr key={user.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <span className="w-7 h-7 rounded-full bg-accent/10 text-accent flex items-center justify-center text-[11px] font-semibold shrink-0">
                                {initials(user.name)}
                              </span>
                              <span className="font-medium text-ink-900">{user.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-ink-600">{user.email}</td>

                          {/* Role dropdown */}
                          <td className="px-4 py-3">
                            {managerRestricted ? (
                              <span className="text-xs text-ink-400 italic">Admin</span>
                            ) : (
                              <div className="relative group inline-block">
                                <select
                                  value={user.role}
                                  onChange={e => handleRoleChange(user.id, e.target.value as Role)}
                                  className="text-xs border border-ink-200 rounded-md px-2 py-1 bg-white focus:outline-none focus:border-accent"
                                >
                                  {(Object.keys(ROLE_LABELS) as Role[]).map(r => {
                                    const disabled = viewerRole === 'MANAGER' && r === 'ADMIN'
                                    return (
                                      <option key={r} value={r} disabled={disabled}
                                        style={disabled ? { color: '#ccc' } : undefined}>
                                        {ROLE_LABELS[r]}
                                      </option>
                                    )
                                  })}
                                </select>
                              </div>
                            )}
                          </td>

                          {/* Squad dropdown */}
                          <td className="px-4 py-3">
                            <select
                              value={user.squadId ?? ''}
                              onChange={e => handleSquadAssign(user.id, e.target.value || null)}
                              disabled={managerRestricted}
                              className="text-xs border border-ink-200 rounded-md px-2 py-1 bg-white focus:outline-none focus:border-accent disabled:opacity-50"
                            >
                              <option value="">— None —</option>
                              {squads.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </select>
                          </td>

                          {/* Active toggle */}
                          <td className="px-4 py-3">
                            <div className="relative group inline-block">
                              <button
                                onClick={() => !isSelf && !managerRestricted && handleToggleActive(user.id, !user.active)}
                                disabled={isSelf || managerRestricted}
                                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                                  user.active ? 'bg-success' : 'bg-ink-300'
                                } ${(isSelf || managerRestricted) ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                              >
                                <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${user.active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                              </button>
                              {isSelf && (
                                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block whitespace-nowrap bg-ink-800 text-white text-[10px] rounded px-2 py-1 pointer-events-none z-10">
                                  Cannot disable your own account
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${user.active ? 'bg-green-50 text-success' : 'bg-ink-100 text-ink-400'}`}>
                              {user.active ? 'Active' : 'Disabled'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <p className="text-xs text-ink-400 italic">
              Future: sync users from Jira/Azure AD automatically
            </p>
          </div>
        )}

        {/* ── Squads Tab ────────────────────────────────────────────────── */}
        {tab === 'squads' && (
          <div className="flex flex-col gap-6 max-w-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-lg font-semibold text-ink-900">Squads</h1>
                <p className="text-xs text-ink-500 mt-0.5">Organise team members into squads.</p>
              </div>
              <button onClick={() => setShowAddSquadModal(true)} className="btn-primary text-sm">
                + Add squad
              </button>
            </div>

            <div className="bg-white rounded-[12px] border border-ink-200 overflow-hidden">
              {loadingSquads ? (
                <div className="p-8 text-center text-sm text-ink-400">Loading…</div>
              ) : squads.length === 0 ? (
                <div className="p-8 text-center text-sm text-ink-400">No squads yet. Add your first squad.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink-100">
                      {['Name', 'Members', 'Actions'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-ink-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {squads.map(squad => (
                      <tr key={squad.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/50 transition-colors">
                        <td className="px-4 py-3">
                          {editingSquadId === squad.id ? (
                            <input
                              ref={editInputRef}
                              value={editingSquadName}
                              onChange={e => setEditingSquadName(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleSquadRename(squad.id)
                                if (e.key === 'Escape') setEditingSquadId(null)
                              }}
                              onBlur={() => handleSquadRename(squad.id)}
                              className="text-sm border border-accent rounded-md px-2 py-1 focus:outline-none w-48"
                            />
                          ) : (
                            <span className="font-medium text-ink-900">{squad.name}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-ink-500">
                          <span className="font-mono text-xs bg-ink-100 px-2 py-0.5 rounded-full">
                            {squad._count.members}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {editingSquadId === squad.id ? (
                              <button
                                onClick={() => setEditingSquadId(null)}
                                className="text-xs text-ink-400 hover:text-ink-700"
                              >
                                Cancel
                              </button>
                            ) : (
                              <button
                                onClick={() => { setEditingSquadId(squad.id); setEditingSquadName(squad.name) }}
                                className="text-xs text-accent hover:underline"
                              >
                                Rename
                              </button>
                            )}
                            <button
                              onClick={() => handleSquadDelete(squad.id)}
                              disabled={squad._count.members > 0}
                              title={squad._count.members > 0 ? 'Remove all members first' : 'Delete squad'}
                              className="text-xs text-danger hover:underline disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ── Audit Tab ─────────────────────────────────────────────────── */}
        {tab === 'audit' && (
          <div className="flex flex-col gap-4 max-w-4xl">
            <div>
              <h1 className="text-lg font-semibold text-ink-900">Audit log</h1>
              <p className="text-xs text-ink-500 mt-0.5">All administrative actions on user accounts.</p>
            </div>
            <div className="bg-white rounded-[12px] border border-ink-200 overflow-hidden">
              {auditLogs.length === 0 ? (
                <div className="p-8 text-center text-sm text-ink-400">No audit log entries yet.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink-100">
                      {['Date', 'Action', 'Details'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-ink-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map(log => (
                      <tr key={log.id} className="border-b border-ink-50 last:border-0">
                        <td className="px-4 py-3 text-xs font-mono text-ink-500 whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs bg-ink-100 text-ink-600 px-2 py-0.5 rounded">{log.action}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-ink-600">{log.details ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ── Settings Tab (Admin only) ──────────────────────────────────── */}
        {tab === 'settings' && isAdmin && (
          <div className="max-w-xl">
            <h1 className="text-lg font-semibold text-ink-900 mb-4">Settings</h1>
            <div className="bg-white rounded-[12px] border border-ink-200 p-6 text-sm text-ink-500">
              Application settings will be available in a future release.
            </div>
          </div>
        )}
      </div>

      {showAddUserModal && (
        <AddUserModal
          onClose={() => setShowAddUserModal(false)}
          onCreated={fetchUsers}
          squads={squads}
          viewerRole={viewerRole}
        />
      )}

      {showAddSquadModal && (
        <AddSquadModal
          onClose={() => setShowAddSquadModal(false)}
          onCreated={fetchSquads}
        />
      )}
    </>
  )
}
