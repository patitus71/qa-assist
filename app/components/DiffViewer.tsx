'use client'

// app/components/DiffViewer.tsx
import { useState } from 'react'
import { diffJSON, type DiffEntry } from '@/lib/response-differ'
import type { APITC, APIRunResult } from '@/lib/types'

interface Props {
  tcs: APITC[]
  runResults?: Record<string, APIRunResult>
}

const STATUS_CLS: Record<DiffEntry['status'], string> = {
  match:    'bg-green-50 text-success border-green-200',
  mismatch: 'bg-red-50 text-danger border-red-200',
  missing:  'bg-amber-50 text-warn border-amber-200',
}

export function DiffViewer({ tcs, runResults = {} }: Props) {
  const [selectedId, setSelectedId] = useState(tcs[0]?.id ?? '')
  const [expectedText, setExpectedText] = useState('')
  const [actualText, setActualText] = useState('')
  const [results, setResults] = useState<DiffEntry[] | null>(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)

  function loadRunResult() {
    const result = runResults[selectedId]
    if (!result?.responseBody) return
    setActualText(JSON.stringify(result.responseBody, null, 2))
  }

  function compare() {
    setError('')
    setResults(null)
    let expected: unknown, actual: unknown
    try { expected = JSON.parse(expectedText) } catch { setError('Expected: Invalid JSON'); return }
    try { actual   = JSON.parse(actualText)   } catch { setError('Actual: Invalid JSON');   return }
    setResults(diffJSON(expected, actual))
  }

  const hasRunResult = !!runResults[selectedId]?.responseBody

  const matchCount    = results?.filter(r => r.status === 'match').length    ?? 0
  const mismatchCount = results?.filter(r => r.status === 'mismatch').length ?? 0
  const missingCount  = results?.filter(r => r.status === 'missing').length  ?? 0

  // Show mismatches + missing first, matches last
  const sorted = results
    ? [
        ...results.filter(r => r.status !== 'match'),
        ...results.filter(r => r.status === 'match'),
      ]
    : []

  return (
    <div className="card overflow-hidden">
      {/* Header — collapsible toggle */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-ink-50 border-b border-ink-100 hover:bg-ink-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-ink-500">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
            <path d="M5 8h6M8 5v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="text-sm font-semibold text-ink-900">Response Diff</span>
          <span className="text-xs text-ink-500">Compare expected vs actual JSON</span>
        </div>
        <svg
          width="14" height="14" viewBox="0 0 16 16" fill="none"
          className={`text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="p-4 space-y-4">

          {/* Two text areas */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] font-medium text-ink-500 uppercase tracking-wide mb-1.5">
                Expected JSON
              </p>
              <textarea
                value={expectedText}
                onChange={e => setExpectedText(e.target.value)}
                placeholder={'{\n  "status": "success",\n  "data": {}\n}'}
                className="w-full font-mono text-xs border border-ink-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-accent resize-none"
                rows={7}
                spellCheck={false}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] font-medium text-ink-500 uppercase tracking-wide">
                  Actual Response
                </p>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedId}
                    onChange={e => setSelectedId(e.target.value)}
                    className="font-mono text-[10px] border border-ink-200 rounded px-1.5 py-0.5 bg-white focus:outline-none"
                  >
                    {tcs.map(tc => (
                      <option key={tc.id} value={tc.id}>{tc.id}</option>
                    ))}
                  </select>
                  {hasRunResult && (
                    <button
                      onClick={loadRunResult}
                      className="text-[10px] text-accent hover:underline whitespace-nowrap"
                    >
                      Load run result
                    </button>
                  )}
                </div>
              </div>
              <textarea
                value={actualText}
                onChange={e => setActualText(e.target.value)}
                placeholder="Paste actual API response JSON here…"
                className="w-full font-mono text-xs border border-ink-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-accent resize-none"
                rows={7}
                spellCheck={false}
              />
            </div>
          </div>

          {error && <p className="text-xs text-danger font-mono">{error}</p>}

          <button
            onClick={compare}
            disabled={!expectedText.trim() || !actualText.trim()}
            className="btn-primary text-sm disabled:opacity-40"
          >
            Compare
          </button>

          {results !== null && (
            <div className="space-y-3">
              {/* Summary badges */}
              <div className="flex gap-4">
                {[
                  { label: 'match',    count: matchCount,    color: 'text-success' },
                  { label: 'mismatch', count: mismatchCount, color: 'text-danger'  },
                  { label: 'missing',  count: missingCount,  color: 'text-warn'    },
                ].map(s => (
                  <div key={s.label} className="flex items-center gap-1.5 text-xs">
                    <span className={`font-mono font-bold ${s.color}`}>{s.count}</span>
                    <span className="text-ink-500">{s.label}</span>
                  </div>
                ))}
              </div>

              {/* Results table */}
              <div className="border border-ink-100 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-ink-50 border-b border-ink-100">
                    <tr>
                      {['Path', 'Status', 'Expected', 'Actual'].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-[10px] font-medium text-ink-500 uppercase tracking-wide">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-4 text-center text-ink-400">
                          No differences — responses match exactly
                        </td>
                      </tr>
                    ) : sorted.map((entry, i) => (
                      <tr
                        key={i}
                        className={`border-b border-ink-50 ${entry.status === 'match' ? 'opacity-40' : ''}`}
                      >
                        <td className="px-3 py-1.5 font-mono text-ink-700 max-w-[140px] truncate">
                          {entry.path}
                        </td>
                        <td className="px-3 py-1.5">
                          <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded border ${STATUS_CLS[entry.status]}`}>
                            {entry.status}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 font-mono text-ink-600 max-w-[160px] truncate">
                          {entry.expected !== undefined ? JSON.stringify(entry.expected) : '—'}
                        </td>
                        <td className="px-3 py-1.5 font-mono max-w-[160px] truncate">
                          <span className={entry.status === 'mismatch' ? 'text-danger' : 'text-ink-600'}>
                            {entry.actual !== undefined ? JSON.stringify(entry.actual) : '—'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
