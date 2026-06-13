// app/session/import/page.tsx
'use client'

import { useState, useCallback, useRef, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/lib/session-context'
import type { StandardTC, E2ETC, APITC, TCPriority, TCStatus } from '@/lib/types'
import * as XLSX from 'xlsx-js-style'

// ─── Types ────────────────────────────────────────────────────────────────────

type TCField = 'Title' | 'Steps' | 'Expected' | 'Priority' | 'Status' | 'Notes' | 'ID' | 'Type'
type FieldMapping = TCField | 'skip'
type ImportMode = 'add' | 'resume' | 'new'

interface ExcelColumn {
  header: string
  samples: string[]
  mapping: FieldMapping
  detectionType: 'auto' | 'manual'
}

interface ParsedRow {
  [header: string]: string
}

interface ParseResult {
  columns: ExcelColumn[]
  rows: ParsedRow[]
  totalRows: number
  fileName: string
}

// ─── Field options ────────────────────────────────────────────────────────────

const FIELD_OPTIONS: { value: FieldMapping; label: string }[] = [
  { value: 'Title', label: 'Title' },
  { value: 'Steps', label: 'Steps' },
  { value: 'Expected', label: 'Expected Result' },
  { value: 'Priority', label: 'Priority' },
  { value: 'Status', label: 'Status' },
  { value: 'Notes', label: 'Notes' },
  { value: 'ID', label: 'ID' },
  { value: 'Type', label: 'Type' },
  { value: 'skip', label: '— Skip —' },
]

// ─── Auto-detection ───────────────────────────────────────────────────────────

function autoDetectField(header: string): { field: FieldMapping; isAuto: boolean } {
  const h = header.toLowerCase().replace(/[^a-z]/g, '')

  const patterns: [string[], FieldMapping][] = [
    [['title', 'name', 'testcase', 'tcname', 'casename', 'testname', 'summary'], 'Title'],
    [['steps', 'step', 'teststep', 'teststeps', 'description', 'desc', 'scenario', 'tcdesc'], 'Steps'],
    [['expected', 'expectedresult', 'expect', 'result', 'expectedoutcome'], 'Expected'],
    [['priority', 'prio', 'sev', 'severity', 'importance'], 'Priority'],
    [['status', 'state', 'runstatus', 'execstatus'], 'Status'],
    [['notes', 'note', 'comment', 'comments', 'remark', 'remarks', 'observation'], 'Notes'],
    [['id', 'tcid', 'testid', 'caseid', 'key', 'tcno', 'testno'], 'ID'],
    [['type', 'testtype', 'category', 'kind'], 'Type'],
  ]

  for (const [candidates, field] of patterns) {
    if (candidates.some(c => h === c || h.startsWith(c) || c.startsWith(h))) {
      return { field, isAuto: true }
    }
  }

  return { field: 'skip', isAuto: false }
}

// ─── File parsing ─────────────────────────────────────────────────────────────

async function parseFile(file: File): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

        if (raw.length === 0) {
          reject(new Error('File is empty or has no data rows'))
          return
        }

        const headers = Object.keys(raw[0])

        const columns: ExcelColumn[] = headers.map(header => {
          const { field, isAuto } = autoDetectField(header)
          const samples = raw
            .slice(0, 8)
            .map(r => String(r[header] ?? '').trim())
            .filter(Boolean)
            .slice(0, 3)
          return { header, samples, mapping: field, detectionType: isAuto ? 'auto' : 'manual' }
        })

        const rows: ParsedRow[] = raw.map(r =>
          Object.fromEntries(headers.map(h => [h, String(r[h] ?? '').trim()]))
        )

        resolve({ columns, rows, totalRows: raw.length, fileName: file.name })
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

// ─── TC builder ───────────────────────────────────────────────────────────────

function buildTCs(
  rows: ParsedRow[],
  columns: ExcelColumn[],
  resetStatuses: boolean,
): { standard: StandardTC[]; e2e: E2ETC[]; api: APITC[] } {
  const fieldToHeader: Partial<Record<TCField, string>> = {}
  for (const col of columns) {
    if (col.mapping !== 'skip' && !fieldToHeader[col.mapping]) {
      fieldToHeader[col.mapping] = col.header
    }
  }

  const get = (row: ParsedRow, field: TCField): string =>
    fieldToHeader[field] ? (row[fieldToHeader[field]!] ?? '') : ''

  const parsePriority = (raw: string): TCPriority => {
    const r = raw.toLowerCase()
    if (r === 'high' || r === 'h') return 'High'
    if (r === 'low' || r === 'l') return 'Low'
    if (raw === 'High' || raw === 'Med' || raw === 'Low') return raw as TCPriority
    return 'Med'
  }

  const parseStatus = (raw: string): TCStatus => {
    const valid: TCStatus[] = ['Pending', 'Pass', 'Fail', 'Skip', 'Blocked']
    return valid.includes(raw as TCStatus) ? (raw as TCStatus) : 'Pending'
  }

  const standard: StandardTC[] = []
  const e2e: E2ETC[] = []
  const api: APITC[] = []

  rows.forEach((row, idx) => {
    const id = get(row, 'ID')
    const type = get(row, 'Type').toLowerCase()
    const title = get(row, 'Title')
    const steps = get(row, 'Steps')
    const expected = get(row, 'Expected')
    const priority = parsePriority(get(row, 'Priority'))
    const status = resetStatuses ? 'Pending' : parseStatus(get(row, 'Status'))
    const notes = get(row, 'Notes') || undefined

    if (!title && !id) return

    const pad = String(idx + 1).padStart(4, '0')

    if (id.startsWith('TC-E2E') || type === 'e2e') {
      e2e.push({
        id: id || `TC-E2E-${pad}`,
        type: 'E2E',
        title: title || id,
        flow: steps,
        steps: [],
        priority,
        status,
        notes,
        source: 'manual',
      })
    } else if (id.startsWith('ATC-') || type === 'api') {
      api.push({
        id: id || `ATC-${pad}`,
        type: 'API',
        method: 'GET',
        endpoint: title || id,
        body: {},
        assertions: [],
        priority,
        status,
        notes,
        source: 'manual',
      })
    } else {
      standard.push({
        id: id || `TC-${pad}`,
        type: 'Standard',
        title: title || id,
        steps,
        expected,
        priority,
        status,
        notes,
        source: 'manual',
      })
    }
  })

  return { standard, e2e, api }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ImportPage() {
  const router = useRouter()
  const session = useSession()

  const [dragOver, setDragOver] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [importMode, setImportMode] = useState<ImportMode>('add')
  const [importing, setImporting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      setError('Only .xlsx, .xls, and .csv files are supported')
      return
    }
    setLoading(true)
    setError(null)
    setParseResult(null)
    try {
      const result = await parseFile(file)
      setParseResult(result)
    } catch {
      setError('Could not read the file — make sure it is a valid Excel or CSV file')
    } finally {
      setLoading(false)
    }
  }, [])

  function updateMapping(header: string, mapping: FieldMapping) {
    setParseResult(prev => {
      if (!prev) return prev
      return {
        ...prev,
        columns: prev.columns.map(col =>
          col.header === header ? { ...col, mapping, detectionType: 'manual' } : col
        ),
      }
    })
  }

  const titleMapped = parseResult?.columns.some(c => c.mapping === 'Title') ?? false
  const canImport = parseResult !== null && titleMapped

  async function doImport() {
    if (!parseResult) return
    setImporting(true)

    const resetStatuses = importMode !== 'resume'
    const { standard, e2e, api } = buildTCs(parseResult.rows, parseResult.columns, resetStatuses)

    if (importMode === 'new') {
      session.setRequirement('')
      session.setStandardTCs(standard)
      session.setE2eTCs(e2e)
      session.setApiTCs(api)
    } else if (importMode === 'add') {
      session.setStandardTCs([...session.standardTCs, ...standard])
      session.setE2eTCs([...session.e2eTCs, ...e2e])
      session.setApiTCs([...session.apiTCs, ...api])
    } else {
      session.setStandardTCs(standard)
      session.setE2eTCs(e2e)
      session.setApiTCs(api)
    }

    router.push('/session/standard')
    setImporting(false)
  }

  return (
    <main className="flex-1 p-3 md:p-4 lg:p-8">
      <div className="w-full space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-xl font-semibold text-ink-900 dark:text-ink-100">Import Excel</h1>
          <p className="text-sm text-ink-500 mt-1">
            Upload a test case spreadsheet to import into your session
          </p>
        </div>

        {/* Upload zone */}
        <div
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
            dragOver
              ? 'border-accent bg-accent/5'
              : 'border-ink-200 dark:border-ink-600 hover:border-ink-300 dark:hover:border-ink-500 bg-white dark:bg-ink-800'
          }`}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={async e => {
            e.preventDefault()
            setDragOver(false)
            const file = e.dataTransfer.files[0]
            if (file) handleFile(file)
          }}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              const file = e.target.files?.[0]
              if (file) handleFile(file)
              e.target.value = ''
            }}
          />

          {loading ? (
            <div className="flex flex-col items-center gap-2">
              <svg className="animate-spin w-8 h-8 text-accent" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-sm text-ink-500">Parsing file…</span>
            </div>
          ) : parseResult ? (
            <div className="flex flex-col items-center gap-2">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="text-green-500">
                <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2" />
                <path d="M10 16l4 4 8-8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className="text-sm font-medium text-ink-700 dark:text-ink-200">{parseResult.fileName}</p>
              <p className="text-xs text-ink-500">
                {parseResult.totalRows} row{parseResult.totalRows !== 1 ? 's' : ''} detected
              </p>
              <button
                className="text-xs text-accent hover:underline mt-1"
                onClick={e => { e.stopPropagation(); inputRef.current?.click() }}
              >
                Change file
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="text-ink-300 dark:text-ink-600">
                <rect x="6" y="6" width="36" height="36" rx="4" stroke="currentColor" strokeWidth="2" />
                <path d="M24 30V18m0 0-6 6m6-6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M14 36h20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <div>
                <p className="text-sm font-medium text-ink-700 dark:text-ink-200">Drag and drop your file here</p>
                <p className="text-xs text-ink-400 mt-1">or click to browse — accepts .xlsx, .xls, .csv</p>
              </div>
            </div>
          )}
        </div>

        {error && (
          <p className="text-sm text-danger">{error}</p>
        )}

        {/* Column mapping */}
        {parseResult && (
          <div className="card p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-ink-900 dark:text-ink-100">Column mapping</h2>
              <p className="text-xs text-ink-500 mt-0.5">
                Review how your spreadsheet columns map to test case fields.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-ink-100 dark:border-ink-700">
                    <th className="text-left pb-2 pr-4 font-medium text-ink-500">Column</th>
                    <th className="text-left pb-2 pr-4 font-medium text-ink-500">Sample values</th>
                    <th className="text-left pb-2 pr-4 font-medium text-ink-500">Maps to</th>
                    <th className="text-left pb-2 font-medium text-ink-500 w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-50 dark:divide-ink-700">
                  {parseResult.columns.map(col => (
                    <tr key={col.header}>
                      <td className="py-2 pr-4 font-mono text-ink-700 dark:text-ink-300 whitespace-nowrap">
                        {col.header}
                      </td>
                      <td className="py-2 pr-4 text-ink-400 max-w-[180px]">
                        <span className="block truncate">
                          {col.samples.length > 0
                            ? col.samples.join(', ')
                            : <em className="text-ink-300">empty</em>
                          }
                        </span>
                      </td>
                      <td className="py-2 pr-4">
                        <select
                          value={col.mapping}
                          onChange={e => updateMapping(col.header, e.target.value as FieldMapping)}
                          onClick={e => e.stopPropagation()}
                          className="border border-ink-200 dark:border-ink-600 rounded px-2 py-1 text-xs bg-white dark:bg-ink-800 dark:text-ink-200 focus:outline-none focus:border-accent"
                        >
                          {FIELD_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2">
                        {col.mapping !== 'skip' ? (
                          <span className={`inline-block font-mono text-[10px] px-1.5 py-0.5 rounded-full leading-none ${
                            col.detectionType === 'auto'
                              ? 'bg-accent/10 text-accent'
                              : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                          }`}>
                            {col.detectionType}
                          </span>
                        ) : (
                          <span className="inline-block font-mono text-[10px] px-1.5 py-0.5 rounded-full leading-none bg-ink-100 dark:bg-ink-700 text-ink-400">
                            skip
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!titleMapped && (
              <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
                Map at least one column to <strong>Title</strong> to enable import.
              </p>
            )}
          </div>
        )}

        {/* Import mode */}
        {parseResult && (
          <div className="card p-5 space-y-3">
            <h2 className="text-sm font-semibold text-ink-900 dark:text-ink-100">Import mode</h2>

            <div className="space-y-2">
              {([
                {
                  value: 'add' as ImportMode,
                  label: 'Add TCs',
                  description: 'Merge imported test cases with the existing session (statuses reset to Pending)',
                },
                {
                  value: 'resume' as ImportMode,
                  label: 'Resume session',
                  description: 'Load test cases and preserve run statuses from the file — continue from where you left off',
                },
                {
                  value: 'new' as ImportMode,
                  label: 'New session',
                  description: 'Clear the current session and start fresh from this file',
                },
              ] as const).map(opt => (
                <label
                  key={opt.value}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    importMode === opt.value
                      ? 'border-accent bg-accent/5 dark:bg-accent/10'
                      : 'border-ink-100 dark:border-ink-700 hover:border-ink-200 dark:hover:border-ink-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="importMode"
                    value={opt.value}
                    checked={importMode === opt.value}
                    onChange={() => setImportMode(opt.value)}
                    className="mt-0.5 accent-accent shrink-0"
                  />
                  <div>
                    <p className="text-sm font-medium text-ink-900 dark:text-ink-100">{opt.label}</p>
                    <p className="text-xs text-ink-500 mt-0.5">{opt.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        {parseResult && (
          <div className="flex gap-3 justify-end pb-8">
            <button
              className="btn-ghost"
              onClick={() => router.back()}
              disabled={importing}
            >
              Cancel
            </button>
            <button
              className="btn-primary disabled:opacity-40"
              disabled={!canImport || importing}
              onClick={doImport}
            >
              {importing
                ? 'Importing…'
                : `Import ${parseResult.totalRows} TC${parseResult.totalRows !== 1 ? 's' : ''}`
              }
            </button>
          </div>
        )}

      </div>
    </main>
  )
}
