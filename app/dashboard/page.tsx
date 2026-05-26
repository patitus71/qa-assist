'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

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

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-[12px] border border-ink-200 p-5">
      <p className="text-xs text-ink-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-ink-900">{value}</p>
      {sub && <p className="text-xs text-ink-400 mt-1">{sub}</p>}
    </div>
  )
}

// ─── Email report panel (shared by MANAGER and QA_LEAD) ───────────────────────

function EmailReportPanel({ scopeLabel }: { scopeLabel: string }) {
  const [autoSend, setAutoSend] = useState(false)
  const [sendTime, setSendTime] = useState('17:00')
  const [recipients, setRecipients] = useState<string[]>([])
  const [recipientInput, setRecipientInput] = useState('')
  const [lastSent, setLastSent] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sendStatus, setSendStatus] = useState<{ ok: boolean; msg: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/email-config')
      if (res.ok) {
        const data = await res.json()
        if (data) {
          setAutoSend(data.autoSend ?? false)
          setSendTime(data.sendTime ?? '17:00')
          setRecipients(data.recipients ?? [])
        }
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { loadConfig() }, [loadConfig])

  async function saveConfig(update: { autoSend?: boolean; sendTime?: string; recipients?: string[] }) {
    setSaving(true)
    try {
      await fetch('/api/email-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      })
    } finally {
      setSaving(false)
    }
  }

  function addRecipient() {
    const e = recipientInput.trim()
    if (!e || !e.includes('@') || recipients.includes(e)) return
    const next = [...recipients, e]
    setRecipients(next)
    setRecipientInput('')
    saveConfig({ recipients: next })
  }

  function removeRecipient(email: string) {
    const next = recipients.filter(r => r !== email)
    setRecipients(next)
    saveConfig({ recipients: next })
  }

  async function handleSendNow() {
    if (recipients.length === 0) { setSendStatus({ ok: false, msg: 'Add at least one recipient.' }); return }
    setSending(true)
    setSendStatus(null)
    try {
      const res = await fetch('/api/reports/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipients }),
      })
      const data = await res.json()
      if (res.ok) {
        setLastSent(new Date().toISOString())
        setSendStatus({ ok: true, msg: 'Report sent successfully.' })
      } else {
        setSendStatus({ ok: false, msg: data.error ?? 'Failed to send.' })
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="bg-white rounded-[12px] border border-ink-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-ink-100 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink-900">Email report — {scopeLabel}</h2>
        {saving && <span className="text-xs text-ink-400">Saving…</span>}
      </div>
      <div className="p-5 flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <button
              role="switch"
              aria-checked={autoSend}
              onClick={() => { const v = !autoSend; setAutoSend(v); saveConfig({ autoSend: v }) }}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${autoSend ? 'bg-accent' : 'bg-ink-300'}`}
            >
              <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${autoSend ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>
            <span className="text-sm text-ink-700">{autoSend ? 'Auto send' : 'Manual only'}</span>
          </label>

          {autoSend && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-ink-600">at</label>
              <input
                type="time"
                value={sendTime}
                onChange={e => { setSendTime(e.target.value); saveConfig({ sendTime: e.target.value }) }}
                className="text-sm border border-ink-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-accent"
              />
            </div>
          )}

          {lastSent && (
            <div className="text-xs text-ink-500 ml-auto">
              Last sent: <span className="font-mono">{new Date(lastSent).toLocaleString()}</span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-ink-700">Recipients</label>
          <div className="flex gap-2">
            <input
              type="email"
              value={recipientInput}
              onChange={e => setRecipientInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addRecipient()}
              placeholder="email@bank.th"
              className="flex-1 text-sm border border-ink-200 rounded-lg px-3 py-2 focus:outline-none focus:border-accent"
            />
            <button onClick={addRecipient} className="btn-ghost text-sm px-3">Add</button>
          </div>
          {recipients.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-1">
              {recipients.map(r => (
                <span key={r} className="flex items-center gap-1.5 bg-ink-50 text-ink-700 text-xs px-2.5 py-1 rounded-full border border-ink-200">
                  {r}
                  <button onClick={() => removeRecipient(r)} className="text-ink-400 hover:text-danger">×</button>
                </span>
              ))}
            </div>
          )}
        </div>

        {sendStatus && (
          <p className={`text-xs px-3 py-2 rounded-lg ${sendStatus.ok ? 'bg-green-50 text-success' : 'bg-red-50 text-danger'}`}>
            {sendStatus.msg}
          </p>
        )}

        <div className="flex justify-end">
          <button onClick={handleSendNow} disabled={sending} className="btn-primary text-sm disabled:opacity-40">
            {sending ? 'Sending…' : 'Send now'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── QA Lead view ─────────────────────────────────────────────────────────────

function QALeadDashboard({ name }: { name: string }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-ink-900">Welcome, {name}</h1>
        <p className="text-xs text-ink-500 mt-0.5">Team overview — QA Lead</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Pass" value={0} />
        <StatCard label="Fail" value={0} />
        <StatCard label="Pending" value={0} />
        <StatCard label="Pass Rate" value="—" sub="No runs yet" />
      </div>

      <div className="bg-white rounded-[12px] border border-ink-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-ink-100">
          <h2 className="text-sm font-semibold text-ink-900">Team progress</h2>
          <button className="btn-primary text-xs py-1">Assign ticket</button>
        </div>
        <div className="p-8 text-center text-sm text-ink-400">No active sessions.</div>
      </div>

      <div className="bg-white rounded-[12px] border border-ink-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-ink-100">
          <h2 className="text-sm font-semibold text-ink-900">Bug approvals queue</h2>
        </div>
        <div className="p-8 text-center text-sm text-ink-400">No pending approvals.</div>
      </div>

      <EmailReportPanel scopeLabel="my squad" />
    </div>
  )
}

// ─── QA Engineer view ─────────────────────────────────────────────────────────

function QAEngineerDashboard({ name }: { name: string }) {
  const router = useRouter()
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-ink-900">Welcome, {name}</h1>
        <p className="text-xs text-ink-500 mt-0.5">Your assignments</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Assigned" value={0} />
        <StatCard label="Done" value={0} />
        <StatCard label="In Progress" value={0} />
        <StatCard label="Not Started" value={0} />
      </div>

      <div className="bg-white rounded-[12px] border border-ink-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-ink-100">
          <h2 className="text-sm font-semibold text-ink-900">My tickets</h2>
          <button onClick={() => router.push('/session/generate')} className="btn-primary text-xs py-1">
            + New session
          </button>
        </div>
        <div className="p-8 text-center text-sm text-ink-400">
          No assigned tickets.{' '}
          <Link href="/" className="text-accent hover:underline">Start a new session</Link>
        </div>
      </div>
    </div>
  )
}

// ─── Manager view ─────────────────────────────────────────────────────────────

function ManagerDashboard({ name }: { name: string }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-ink-900">Welcome, {name}</h1>
        <p className="text-xs text-ink-500 mt-0.5">Sprint overview — all squads</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total TC" value={0} />
        <StatCard label="Pass" value={0} />
        <StatCard label="Bugs Found" value={0} />
        <StatCard label="Engineers active" value={0} />
      </div>

      <div className="bg-white rounded-[12px] border border-ink-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-ink-100">
          <h2 className="text-sm font-semibold text-ink-900">Sprint progress</h2>
        </div>
        <div className="p-8 text-center text-sm text-ink-400">No sprint data available.</div>
      </div>

      <EmailReportPanel scopeLabel="all squads" />
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { data: session, status } = useSession()

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-[#F4F4F6] flex items-center justify-center">
        <div className="text-sm text-ink-400">Loading…</div>
      </div>
    )
  }

  const user = session?.user
  const role = user?.role as Role | undefined
  const roleBadge = role ? ROLE_BADGE_STYLE[role] : null

  return (
    <div className="min-h-screen bg-[#F4F4F6] flex">
      {/* Sidebar */}
      <aside className="w-[210px] min-h-screen bg-white border-r border-ink-100 flex flex-col shrink-0">
        <div className="px-4 py-5 border-b border-ink-100">
          <Link href="/" className="flex items-center gap-2 group">
            <span className="w-7 h-7 rounded-md bg-accent flex items-center justify-center shrink-0">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M8 1L10 6H15L11 9.5L12.5 15L8 11.5L3.5 15L5 9.5L1 6H6L8 1Z" fill="white" />
              </svg>
            </span>
            <span className="text-sm font-semibold text-ink-900 group-hover:text-accent transition-colors">
              QA Assist
            </span>
          </Link>
        </div>

        <nav className="flex-1 px-2 py-3 flex flex-col gap-0.5">
          <Link href="/dashboard"
            className="flex items-center px-3 py-2 rounded-lg text-sm bg-accent text-white">
            Dashboard
          </Link>
          <Link href="/"
            className="flex items-center px-3 py-2 rounded-lg text-sm text-ink-600 hover:bg-ink-50 hover:text-ink-900 transition-colors">
            New session
          </Link>
          {(role === 'ADMIN' || role === 'MANAGER') && (
            <Link href="/admin"
              className="flex items-center px-3 py-2 rounded-lg text-sm text-ink-600 hover:bg-ink-50 hover:text-ink-900 transition-colors">
              Admin
            </Link>
          )}
        </nav>

        {/* User chip */}
        <div className="px-3 py-3 border-t border-ink-100 flex items-center gap-2">
          <span className="w-7 h-7 rounded-full bg-accent text-white flex items-center justify-center text-[11px] font-semibold shrink-0">
            {user?.name ? initials(user.name) : '?'}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-ink-900 truncate">{user?.name ?? '—'}</p>
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
            className="text-ink-400 hover:text-ink-700 transition-colors shrink-0"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3M10 11l3-3-3-3M13 8H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </aside>

      {/* Content */}
      <div className="flex-1 p-8">
        {role === 'QA_LEAD' && <QALeadDashboard name={user?.name ?? ''} />}
        {role === 'QA_ENGINEER' && <QAEngineerDashboard name={user?.name ?? ''} />}
        {role === 'MANAGER' && <ManagerDashboard name={user?.name ?? ''} />}
        {role === 'ADMIN' && (
          <div className="flex flex-col gap-4">
            <h1 className="text-lg font-semibold text-ink-900">Admin Dashboard</h1>
            <p className="text-sm text-ink-500">
              Manage users and settings in the{' '}
              <Link href="/admin" className="text-accent hover:underline">Admin panel</Link>.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
