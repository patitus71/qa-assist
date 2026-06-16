'use client'

import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/lib/session-context'
import { importTCM, type TCMImportResult } from '@/lib/import-tcm'
import * as XLSX from 'xlsx-js-style'

// ── Icons ─────────────────────────────────────────────────────────────────────

function IconUpload() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <rect x="4" y="20" width="24" height="8" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16 18V6m0 0-6 6m6-6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconGrid() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1" y="1" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M1 5h12M1 9h12M5 1v12M9 1v12" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  )
}

function IconRows() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 4h10M2 7h10M2 10h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function IconWarn() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 1L13 12H1L7 1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M7 5.5v3M7 10v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4.5 7l2 2 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Stage = 'upload' | 'preview' | 'result'

export default function ImportTCMPage() {
  const router = useRouter()
  const session = useSession()

  const [stage, setStage] = useState<Stage>('upload')
  const [isDragging, setIsDragging] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [result, setResult] = useState<TCMImportResult | null>(null)
  const [parseError, setParseError] = useState('')
  const [rawRows, setRawRows] = useState<unknown[][]>([])
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setParseError('Only .xlsx and .xls files are supported.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setParseError('File is too large (max 10 MB).')
      return
    }

    setParseError('')
    setResult(null)
    setPendingFile(file)

    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }).slice(0, 12)
      setRawRows(rows)
      setStage('preview')
    } catch {
      setParseError('Could not read the file.')
    }
  }

  async function parseTCM() {
    if (!pendingFile) return
    setParsing(true)
    setParseError('')
    setResult(null)
    try {
      const res = await importTCM(pendingFile)
      setResult(res)
      setStage('result')
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Failed to parse file.')
      setStage('preview')
    } finally {
      setParsing(false)
    }
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const onDragLeave = useCallback(() => setIsDragging(false), [])

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  function handleImport() {
    if (!result) return
    session.setTcm(result.state)
    router.push('/session/tcm-editor')
  }

  const dataRows  = result ? result.state.rows.filter(r => !r.sectionLabel).length : 0
  const sectionRows = result ? result.state.rows.filter(r => r.sectionLabel).length : 0
  const hasData   = result && (result.state.groups.length > 0 || dataRows > 0)

  return (
    <div className="p-3 md:p-4 lg:p-8 w-full max-w-2xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink-900 mb-1">Import TCM</h1>
        <p className="text-ink-500 text-sm">
          Upload a banking TCM Excel file. The parser auto-detects header rows, merged cells, and section groupings.
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={[
          'card mb-4 p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all',
          isDragging ? 'border-accent border-2 bg-accent/5' : 'border-dashed hover:border-accent/50',
        ].join(' ')}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="text-ink-300">
          <IconUpload />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-ink-700 mb-0.5">
            {isDragging ? 'Drop to import' : 'Drop your TCM file here'}
          </p>
          <p className="text-xs text-ink-400">or click to browse · .xlsx, .xls up to 10 MB</p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={onFileChange}
        />
      </div>

      {/* Parsing spinner */}
      {parsing && (
        <div className="card p-5 flex items-center gap-3 mb-4">
          <svg className="animate-spin text-accent shrink-0" width="18" height="18" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeOpacity="0.3" />
            <path d="M8 2a6 6 0 0 1 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className="text-sm text-ink-600">Parsing file…</span>
        </div>
      )}

      {/* Parse error */}
      {parseError && (
        <div className="card p-4 mb-4 border-red-200 bg-red-50/50">
          <p className="text-sm text-danger flex items-center gap-2">
            <IconWarn /> {parseError}
          </p>
        </div>
      )}

      {/* Raw preview */}
      {stage === 'preview' && rawRows.length > 0 && (
        <div className="card overflow-hidden mb-4">
          <div className="flex items-center justify-between px-5 py-3 border-b border-ink-100">
            <div>
              <h2 className="text-sm font-semibold text-ink-900">File Preview</h2>
              <p className="text-xs text-ink-400 mt-0.5">First {rawRows.length} rows — verify structure before parsing</p>
            </div>
            <button
              className="btn-primary text-sm"
              onClick={parseTCM}
              disabled={parsing}
            >
              {parsing ? 'Parsing…' : 'Parse as TCM →'}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <tbody>
                {rawRows.map((row, ri) => {
                  const cells = row as string[]
                  const bg = ri === 0 ? '#0055A4' : ri === 1 ? '#D9D9D9' : ri % 2 === 0 ? '#F4F4F6' : '#FFFFFF'
                  const color = ri === 0 ? '#FFFFFF' : '#1A1A1C'
                  const fw = ri <= 1 ? 600 : 400
                  return (
                    <tr key={ri}>
                      {cells.map((cell, ci) => (
                        <td
                          key={ci}
                          style={{ background: bg, color, fontWeight: fw, padding: '6px 10px', border: '1px solid #E8E8EF', whiteSpace: 'nowrap', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}
                        >
                          {String(cell ?? '')}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Parse result preview */}
      {stage === 'result' && result && (
        <div className="card p-5 mb-4 space-y-4">
          {/* File meta */}
          <div>
            <p className="text-xs font-medium text-ink-500 uppercase tracking-widest mb-2">Parsed file</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-ink-400">File</span>
                <span className="font-medium text-ink-800 truncate" title={result.meta.fileName}>{result.meta.fileName}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-ink-400">Sheet</span>
                <span className="font-medium text-ink-800">{result.meta.sheetName}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-ink-400">Header rows detected</span>
                <span className="font-mono font-medium text-ink-800">{result.meta.headerRows}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-ink-400">TCM columns</span>
                <span className="font-mono font-medium text-ink-800">{result.meta.totalColumns}</span>
              </div>
            </div>
          </div>

          {/* Summary stats */}
          <div className="flex gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 bg-accent/10 text-accent px-3 py-1.5 rounded-lg text-sm font-medium">
              <IconGrid /> {result.state.groups.length} groups
            </div>
            <div className="flex items-center gap-1.5 bg-ink-50 text-ink-700 px-3 py-1.5 rounded-lg text-sm font-medium">
              <IconRows /> {dataRows} rows
            </div>
            {sectionRows > 0 && (
              <div className="flex items-center gap-1.5 bg-ink-50 text-ink-500 px-3 py-1.5 rounded-lg text-sm font-medium">
                {sectionRows} section{sectionRows > 1 ? 's' : ''} detected
              </div>
            )}
          </div>

          {/* Groups preview */}
          {result.state.groups.length > 0 && (
            <div>
              <p className="text-xs font-medium text-ink-500 uppercase tracking-widest mb-2">Groups preview</p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {result.state.groups.map(g => (
                  <div key={g.id} className="flex items-start gap-2 text-xs">
                    <span className="font-medium text-ink-700 min-w-0 flex-1 truncate" title={g.name}>{g.name}</span>
                    <span className="text-ink-400 shrink-0">{g.values.length} values</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Warnings */}
          {result.warnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
              {result.warnings.map((w, i) => (
                <p key={i} className="text-xs text-warn flex items-start gap-1.5">
                  <span className="shrink-0 mt-0.5"><IconWarn /></span> {w}
                </p>
              ))}
            </div>
          )}

          {/* No data warning */}
          {!hasData && !result.warnings.length && (
            <p className="text-sm text-ink-400">No groups or rows were detected. Try a different sheet or file.</p>
          )}

          {/* Success indicator */}
          {hasData && (
            <div className="flex items-center gap-1.5 text-xs text-success">
              <IconCheck /> Ready to import
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        {stage === 'result' && hasData && (
          <button onClick={handleImport} className="btn-primary">
            Import to TCM Editor →
          </button>
        )}
        <button
          onClick={() => { setResult(null); setParseError(''); setRawRows([]); setPendingFile(null); setStage('upload') }}
          className="btn-ghost"
          style={{ display: stage !== 'upload' || parseError ? undefined : 'none' }}
        >
          Clear
        </button>
      </div>
    </div>
  )
}
