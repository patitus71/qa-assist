'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import * as XLSX from 'xlsx'

type Filter = 'today' | 'week' | 'all'
type TSStatus = 'active' | 'paused' | 'completed'

interface Entry {
  id: string
  ticketKey: string
  ticketName: string | null
  startTime: string
  endTime: string | null
  duration: number
  liveDuration: number
  status: TSStatus
  createdAt: string
}

function formatHM(mins: number) {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`
  return `${m}m`
}

function fmt(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const STATUS_STYLE: Record<TSStatus, { label: string; bg: string; color: string }> = {
  active:    { label: 'Active',    bg: '#F0FDF4', color: '#0B7A51' },
  paused:    { label: 'Paused',    bg: '#FFFBEB', color: '#92400E' },
  completed: { label: 'Completed', bg: '#F4F4F6', color: '#6B6B75' },
}

export default function TimesheetPage() {
  const { data: session } = useSession()
  const [filter, setFilter] = useState<Filter>('today')
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/timesheet/my?filter=${filter}`)
      if (res.ok) setEntries(await res.json())
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { load() }, [load])

  const totalMins = entries.reduce((s, e) => s + (e.liveDuration ?? 0), 0)

  function exportXlsx() {
    const rows = entries.map(e => ({
      Date: fmtDate(e.createdAt),
      'Ticket Key': e.ticketKey,
      'Ticket Name': e.ticketName ?? '',
      'Start Time': fmt(e.startTime),
      'End Time': fmt(e.endTime),
      'Duration (min)': e.liveDuration,
      Status: STATUS_STYLE[e.status]?.label ?? e.status,
    }))
    rows.push({
      Date: '',
      'Ticket Key': 'TOTAL',
      'Ticket Name': '',
      'Start Time': '',
      'End Time': '',
      'Duration (min)': totalMins,
      Status: formatHM(totalMins),
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Timesheet')
    XLSX.writeFile(wb, `timesheet_${filter}_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const FILTERS: { id: Filter; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'week', label: 'This week' },
    { id: 'all', label: 'All time' },
  ]

  return (
    <div className="flex-1 p-3 md:p-4 lg:p-8 min-w-0 bg-[#F4F4F6] dark:bg-ink-900">
      <div className="w-full flex flex-col gap-6">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-ink-900 dark:text-ink-100">Timesheet</h1>
              <p className="text-xs text-ink-500 mt-0.5">
                {session?.user?.name} — time logged per ticket
              </p>
            </div>
            <button onClick={exportXlsx} className="btn-ghost text-sm flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M8 10V2m0 0L5 5m3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2 11v2a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Export .xlsx
            </button>
          </div>

          {/* Filter tabs */}
          <div className="flex gap-1 bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-lg p-1 w-fit">
            {FILTERS.map(f => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  filter === f.id
                    ? 'bg-accent text-white'
                    : 'text-ink-600 dark:text-ink-300 hover:bg-ink-50 dark:hover:bg-ink-700'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Summary chips */}
          <div className="flex gap-3">
            <div className="bg-white dark:bg-ink-800 rounded-[10px] border border-ink-200 dark:border-ink-700 px-4 py-3 min-w-[120px]">
              <p className="text-xs text-ink-500 mb-0.5">Total time</p>
              <p className="font-mono text-xl font-bold text-ink-900 dark:text-ink-100">{formatHM(totalMins)}</p>
            </div>
            <div className="bg-white dark:bg-ink-800 rounded-[10px] border border-ink-200 dark:border-ink-700 px-4 py-3 min-w-[120px]">
              <p className="text-xs text-ink-500 mb-0.5">Tickets</p>
              <p className="font-mono text-xl font-bold text-ink-900 dark:text-ink-100">
                {new Set(entries.map(e => e.ticketKey)).size}
              </p>
            </div>
            <div className="bg-white dark:bg-ink-800 rounded-[10px] border border-ink-200 dark:border-ink-700 px-4 py-3 min-w-[120px]">
              <p className="text-xs text-ink-500 mb-0.5">Sessions</p>
              <p className="font-mono text-xl font-bold text-ink-900 dark:text-ink-100">{entries.length}</p>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white dark:bg-ink-800 rounded-[12px] border border-ink-200 dark:border-ink-700 overflow-hidden">
            {loading ? (
              <div className="p-10 text-center text-sm text-ink-400">Loading…</div>
            ) : entries.length === 0 ? (
              <div className="p-10 text-center text-sm text-ink-400">No timesheet entries for this period.</div>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-100 dark:border-ink-700">
                    {['Date', 'Ticket', 'Start', 'End', 'Duration', 'Status'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-ink-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entries.map(e => {
                    const st = STATUS_STYLE[e.status] ?? STATUS_STYLE.completed
                    return (
                      <tr key={e.id} className="border-b border-ink-50 dark:border-ink-700 last:border-0 hover:bg-ink-50/50 dark:hover:bg-ink-700/50 transition-colors">
                        <td className="px-4 py-3 text-xs text-ink-500 font-mono whitespace-nowrap">
                          {fmtDate(e.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            <span className="tc-id text-xs">{e.ticketKey}</span>
                            {e.ticketName && (
                              <p className="text-xs text-ink-500 mt-0.5 max-w-[180px] truncate">{e.ticketName}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-ink-600">{fmt(e.startTime)}</td>
                        <td className="px-4 py-3 font-mono text-xs text-ink-600">{fmt(e.endTime)}</td>
                        <td className="px-4 py-3 font-mono text-sm font-semibold text-ink-900 dark:text-ink-100">
                          {formatHM(e.liveDuration)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                            style={{ background: st.bg, color: st.color }}
                          >
                            {st.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                  {/* Summary row */}
                  <tr className="bg-ink-50 dark:bg-ink-700/50 border-t border-ink-200 dark:border-ink-600">
                    <td colSpan={4} className="px-4 py-2.5 text-xs font-medium text-ink-600 dark:text-ink-300">
                      Total ({filter})
                    </td>
                    <td className="px-4 py-2.5 font-mono text-sm font-bold text-ink-900 dark:text-ink-100">
                      {formatHM(totalMins)}
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
              </div>
            )}
          </div>

        </div>
    </div>
  )
}
