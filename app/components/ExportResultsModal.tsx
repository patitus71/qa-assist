// app/components/ExportResultsModal.tsx
'use client'

import { useState } from 'react'
import type { TC, Evidence } from '@/lib/types'
import type { ResultFilter } from '@/lib/export-pdf-results'

interface Props {
  tcs: TC[]
  evidenceMap?: Record<string, Evidence>
  jiraKey?: string
  onClose: () => void
}

export function ExportResultsModal({ tcs, evidenceMap = {}, jiraKey, onClose }: Props) {
  const [filter, setFilter]           = useState<ResultFilter>('all')
  const [projectName, setProjectName] = useState('')
  const [sprint, setSprint]           = useState('')
  const [loading, setLoading]         = useState(false)

  const pass    = tcs.filter(t => t.status === 'Pass').length
  const fail    = tcs.filter(t => t.status === 'Fail').length
  const blocked = tcs.filter(t => t.status === 'Blocked').length
  const pending = tcs.filter(t => t.status === 'Pending').length
  const withEv  = tcs.filter(tc => {
    const ev = evidenceMap[tc.id]
    return ev && (ev.screenshots.length > 0 || ev.apiResponse || ev.dbResult || ev.notes)
  }).length

  const filterCounts: Record<ResultFilter, number> = {
    all:            tcs.length,
    failed:         fail,
    passed:         pass,
    'with-evidence': withEv,
  }

  const filtered = tcs.filter(tc => {
    if (filter === 'failed')         return tc.status === 'Fail'
    if (filter === 'passed')         return tc.status === 'Pass'
    if (filter === 'with-evidence') {
      const ev = evidenceMap[tc.id]
      return ev && (ev.screenshots.length > 0 || ev.apiResponse || ev.dbResult || ev.notes)
    }
    return true
  })

  async function handleExport() {
    if (filtered.length === 0) return
    setLoading(true)
    try {
      const { exportTestResultPdf } = await import('@/lib/export-pdf-results')
      await exportTestResultPdf(filtered, {
        projectName: projectName.trim() || undefined,
        jiraKey:     jiraKey || undefined,
        sprint:      sprint.trim() || undefined,
        filter,
        evidenceMap,
        filename: `test-results-${new Date().toISOString().slice(0, 10)}.pdf`,
      })
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-ink-800 rounded-xl shadow-xl w-full max-w-md overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100 dark:border-ink-700">
          <div>
            <h2 className="text-sm font-semibold text-ink-900 dark:text-ink-100">Export Test Results PDF</h2>
            <p className="text-xs text-ink-500 mt-0.5">Execution report with evidence and bug tickets</p>
          </div>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-600 text-base leading-none">✕</button>
        </div>

        <div className="p-5 space-y-5">

          {/* Mini stat row */}
          <div className="grid grid-cols-4 gap-2">
            {([
              { label: 'Pass',    count: pass,    cls: 'text-success' },
              { label: 'Fail',    count: fail,    cls: 'text-danger'  },
              { label: 'Blocked', count: blocked, cls: 'text-warn'    },
              { label: 'Pending', count: pending, cls: 'text-ink-400' },
            ] as const).map(s => (
              <div key={s.label} className="text-center bg-ink-50 dark:bg-ink-700/50 rounded-lg py-2.5">
                <div className={`text-lg font-bold font-mono ${s.cls}`}>{s.count}</div>
                <div className="text-[10px] text-ink-500 uppercase tracking-wide mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Filter */}
          <div>
            <p className="text-xs font-medium text-ink-700 dark:text-ink-300 mb-2">Include test cases</p>
            <div className="space-y-1.5">
              {([
                { value: 'all',            label: 'All TCs'            },
                { value: 'failed',         label: 'Failed only'        },
                { value: 'passed',         label: 'Passed only'        },
                { value: 'with-evidence',  label: 'With evidence only' },
              ] as const).map(opt => (
                <label
                  key={opt.value}
                  className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                    filter === opt.value
                      ? 'border-accent bg-accent/5 dark:bg-accent/10'
                      : 'border-ink-100 dark:border-ink-700 hover:border-ink-200 dark:hover:border-ink-600'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="result-filter"
                      value={opt.value}
                      checked={filter === opt.value}
                      onChange={() => setFilter(opt.value)}
                      className="accent-accent shrink-0"
                    />
                    <span className="text-sm text-ink-700 dark:text-ink-200">{opt.label}</span>
                  </div>
                  <span className="font-mono text-[10px] bg-ink-100 dark:bg-ink-700 text-ink-500 px-1.5 py-0.5 rounded-full leading-none">
                    {filterCounts[opt.value]}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Optional fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-ink-700 dark:text-ink-300 block mb-1.5">
                Project name <span className="text-ink-400 font-normal">(optional)</span>
              </label>
              <input
                value={projectName}
                onChange={e => setProjectName(e.target.value)}
                placeholder="e.g. Internet Banking v2"
                className="w-full text-sm border border-ink-200 dark:border-ink-600 rounded-lg px-3 py-2 bg-white dark:bg-ink-800 dark:text-ink-200 focus:outline-none focus:border-accent placeholder:text-ink-300"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-700 dark:text-ink-300 block mb-1.5">
                Sprint <span className="text-ink-400 font-normal">(optional)</span>
              </label>
              <input
                value={sprint}
                onChange={e => setSprint(e.target.value)}
                placeholder="e.g. Sprint 24"
                className="w-full text-sm border border-ink-200 dark:border-ink-600 rounded-lg px-3 py-2 bg-white dark:bg-ink-800 dark:text-ink-200 focus:outline-none focus:border-accent placeholder:text-ink-300"
              />
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-ink-100 dark:border-ink-700 flex gap-3 justify-end">
          <button onClick={onClose} disabled={loading} className="btn-ghost text-sm">
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={filtered.length === 0 || loading}
            className="btn-primary text-sm disabled:opacity-40 flex items-center gap-2"
          >
            {loading && (
              <svg className="animate-spin shrink-0" width="13" height="13" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6" stroke="white" strokeWidth="2" strokeOpacity="0.4" />
                <path d="M8 2a6 6 0 0 1 6 6" stroke="white" strokeWidth="2" strokeLinecap="round" />
              </svg>
            )}
            {loading
              ? 'Generating PDF…'
              : `Export ${filtered.length} TC${filtered.length !== 1 ? 's' : ''} → PDF`}
          </button>
        </div>

      </div>
    </div>
  )
}
