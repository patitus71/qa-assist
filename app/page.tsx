// app/page.tsx
'use client'

import { useState, useCallback, useEffect, useRef, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/lib/session-context'
import { loadSession, clearSession, type SavedSession } from '@/lib/autosave'
import type { StandardTC, E2ETC, APITC, TC, TCPriority, TCStatus } from '@/lib/types'
import * as XLSX from 'xlsx-js-style'

// ─── Image resize ────────────────────────────────────────────────────────────

async function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Not an image'))
      return
    }
    const img = document.createElement('img')
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const maxW = 800
      const maxH = 600
      let w = img.width
      let h = img.height
      if (w > maxW || h > maxH) {
        const ratio = Math.min(maxW / w, maxH / h)
        w = Math.round(w * ratio)
        h = Math.round(h * ratio)
      }
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(url)
        reject(new Error('No canvas context'))
        return
      }
      ctx.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.8))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }
    img.src = url
  })
}

// ─── Excel parsing ───────────────────────────────────────────────────────────

interface ExcelRow {
  id: string
  type: string
  title: string
  steps: string
  expected: string
  priority: string
  status: string
}

interface ExcelPreview {
  rows: ExcelRow[]
  hasStatus: boolean
  totalRows: number
}

function findCol(obj: Record<string, unknown>, candidates: string[]): string {
  const key = Object.keys(obj).find(k =>
    candidates.some(c => k.toLowerCase().replace(/[^a-z]/g, '').includes(c))
  )
  const val = key ? obj[key] : ''
  return typeof val === 'string' ? val : String(val ?? '')
}

async function parseExcelFile(file: File): Promise<ExcelPreview> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
        const rows: ExcelRow[] = raw.map(r => ({
          id: findCol(r, ['tcid', 'id']),
          type: findCol(r, ['type']),
          title: findCol(r, ['title', 'name', 'testcase']),
          steps: findCol(r, ['steps', 'step']),
          expected: findCol(r, ['expected', 'expectedresult']),
          priority: findCol(r, ['priority']),
          status: findCol(r, ['status']),
        }))
        const hasStatus = rows.some(r => r.status && !['', 'Pending'].includes(r.status))
        resolve({ rows: rows.slice(0, 20), totalRows: raw.length, hasStatus })
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

function excelRowToTC(row: ExcelRow): TC {
  const priority: TCPriority = (['High', 'Med', 'Low'].includes(row.priority)
    ? row.priority
    : 'Med') as TCPriority
  const status: TCStatus = (['Pending', 'Pass', 'Fail', 'Skip', 'Blocked'].includes(row.status)
    ? row.status
    : 'Pending') as TCStatus

  if (row.id.startsWith('TC-E2E') || row.type === 'E2E') {
    const tc: E2ETC = {
      id: row.id || `TC-E2E-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      type: 'E2E',
      title: row.title,
      flow: row.steps,
      steps: [],
      priority,
      status,
    }
    return tc
  }

  if (row.id.startsWith('ATC-') || row.type === 'API') {
    const tc: APITC = {
      id: row.id || `ATC-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      type: 'API',
      method: 'GET',
      endpoint: row.title,
      body: {},
      assertions: [],
      priority,
      status,
    }
    return tc
  }

  const tc: StandardTC = {
    id: row.id || `TC-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    type: 'Standard',
    title: row.title,
    steps: row.steps,
    expected: row.expected,
    priority,
    status,
  }
  return tc
}

// ─── Icons ───────────────────────────────────────────────────────────────────

function IconJira() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-accent">
      <rect x="3" y="3" width="8" height="8" rx="2" fill="currentColor" opacity="0.4" />
      <rect x="13" y="3" width="8" height="8" rx="2" fill="currentColor" />
      <rect x="3" y="13" width="8" height="8" rx="2" fill="currentColor" />
      <rect x="13" y="13" width="8" height="8" rx="2" fill="currentColor" opacity="0.4" />
    </svg>
  )
}

function IconPaste() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-accent">
      <rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 9h8M8 13h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function IconImport() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-accent">
      <path d="M12 3v12m0 0-4-4m4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

// ─── Jira Pull section ────────────────────────────────────────────────────────

interface JiraExistingTC { key: string; title: string; type: string }

interface JiraPullIssue {
  key: string; title: string; description: string; acceptanceCriteria: string; sprint?: string
}

function JiraPullSection({ session, router }: {
  session: { setRequirement: (t: string, k?: string) => void; setStandardTCs: (tcs: StandardTC[]) => void }
  router: { push: (url: string) => void }
}) {
  const [open, setOpen] = useState(false)
  const [subKey, setSubKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [issue, setIssue] = useState<JiraPullIssue | null>(null)
  const [existingTCs, setExistingTCs] = useState<JiraExistingTC[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)

  async function load() {
    const key = subKey.trim().toUpperCase()
    if (!key) return
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/jira/issue-with-tcs?key=${encodeURIComponent(key)}`)
      const data = await res.json() as { issue?: JiraPullIssue; existingTCs?: JiraExistingTC[]; error?: string }
      if (!res.ok) { setError(data.error ?? 'Failed to load'); return }
      setIssue(data.issue ?? null)
      setExistingTCs(data.existingTCs ?? [])
      setSelected(new Set((data.existingTCs ?? []).map(t => t.key)))
    } catch { setError('Network error') }
    finally { setLoading(false) }
  }

  async function importSelected() {
    if (!issue) return
    setImporting(true)
    const chosenTCs = existingTCs.filter(t => selected.has(t.key))
    const asTCs = chosenTCs.map((t, i): StandardTC => ({
      id: t.key,
      type: 'Standard',
      title: t.title,
      steps: '',
      expected: '',
      priority: 'Med',
      status: 'Pending',
    }))
    session.setRequirement(`${issue.title}\n${issue.description}`, issue.key)
    session.setStandardTCs(asTCs)
    router.push('/session/standard')
    setImporting(false)
  }

  if (!open) {
    return (
      <div className="max-w-5xl mx-auto mt-6">
        <button onClick={() => setOpen(true)} className="text-xs text-ink-400 hover:text-ink-700 transition-colors flex items-center gap-1.5 mx-auto">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2zm0 4v4m0 2v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          Pull sub-task with existing test cases from Jira
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto mt-6">
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-ink-900">Jira Pull — Sub-task</h2>
            <p className="text-xs text-ink-500 mt-0.5">Import existing TCs from Jira + gap analysis for missing ones</p>
          </div>
          <button onClick={() => setOpen(false)} className="text-ink-400 hover:text-ink-700 text-xs">✕</button>
        </div>
        <div className="flex gap-2 mb-3">
          <input value={subKey} onChange={(e: ChangeEvent<HTMLInputElement>) => { setSubKey(e.target.value.toUpperCase()); setError('') }}
            onKeyDown={(e) => e.key === 'Enter' && load()}
            placeholder="PROJ-1043"
            className="flex-1 font-mono text-sm border border-ink-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-accent" />
          <button onClick={load} disabled={!subKey.trim() || loading} className="btn-primary disabled:opacity-40">
            {loading ? 'Loading…' : 'Pull from Jira'}
          </button>
        </div>
        {error && <p className="text-xs text-danger mb-2">{error}</p>}

        {issue && (
          <div className="space-y-3">
            <div className="bg-ink-50 rounded-lg p-3 text-xs">
              <p className="font-medium text-ink-700">{issue.title}</p>
              {issue.sprint && <p className="text-ink-500 mt-0.5">Sprint: {issue.sprint}</p>}
            </div>

            {existingTCs.length > 0 ? (
              <>
                <p className="text-xs font-medium text-ink-600">{existingTCs.length} test case{existingTCs.length !== 1 ? 's' : ''} found in Jira:</p>
                <div className="max-h-48 overflow-y-auto border border-ink-100 rounded-lg divide-y divide-ink-50">
                  {existingTCs.map(tc => (
                    <label key={tc.key} className="flex items-start gap-2.5 px-3 py-2 hover:bg-ink-50 cursor-pointer">
                      <input type="checkbox" checked={selected.has(tc.key)}
                        onChange={() => { const n = new Set(selected); n.has(tc.key) ? n.delete(tc.key) : n.add(tc.key); setSelected(n) }}
                        className="mt-0.5 rounded shrink-0" />
                      <div>
                        <span className="tc-id mr-2">{tc.key}</span>
                        <span className="text-xs text-ink-700">{tc.title}</span>
                        <span className="ml-2 font-mono text-[10px] bg-ink-100 text-ink-500 px-1 rounded">from Jira</span>
                      </div>
                    </label>
                  ))}
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-ink-500">{selected.size} selected</span>
                  <div className="flex gap-2">
                    <button onClick={importSelected} disabled={importing || selected.size === 0} className="btn-primary text-xs disabled:opacity-40">
                      {importing ? 'Importing…' : `Import ${selected.size} TC${selected.size !== 1 ? 's' : ''}`}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-xs text-ink-500">No linked test cases found under this sub-task.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Landing page ─────────────────────────────────────────────────────────────

export default function LandingPage() {
  const router = useRouter()
  const session = useSession()

  // Resume banner
  const [savedSession, setSavedSession] = useState<SavedSession | null>(null)
  useEffect(() => {
    const s = loadSession()
    if (s && s.tcs.length > 0) setSavedSession(s)
  }, [])

  // ── Jira card ──
  const [jiraKey, setJiraKey] = useState('')
  const [jiraLoading, setJiraLoading] = useState(false)
  const [jiraError, setJiraError] = useState<string | null>(null)

  async function handleLoadJira() {
    const key = jiraKey.trim().toUpperCase()
    if (!key) return
    setJiraLoading(true)
    setJiraError(null)
    try {
      const res = await fetch(`/api/jira/issue?key=${encodeURIComponent(key)}`)
      const data = await res.json() as { title?: string; description?: string; acceptanceCriteria?: string; error?: string }
      if (!res.ok) {
        setJiraError(data.error ?? 'Failed to load Jira ticket')
        return
      }
      const parts = [
        data.title && `## ${data.title}`,
        data.description && `\n${data.description}`,
        data.acceptanceCriteria && `\n\n**Acceptance Criteria:**\n${data.acceptanceCriteria}`,
      ].filter(Boolean)
      session.setRequirement(parts.join(''), key)
      router.push('/session/generate')
    } catch {
      setJiraError('Network error — check your connection')
    } finally {
      setJiraLoading(false)
    }
  }

  // ── Paste card ──
  const [pasteText, setPasteText] = useState('')
  const [pasteImages, setPasteImages] = useState<string[]>([])
  const [imagesDragOver, setImagesDragOver] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const addImages = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => f.type.startsWith('image/'))
    const resized = await Promise.allSettled(arr.map(resizeImage))
    const valid = resized.flatMap(r => (r.status === 'fulfilled' ? [r.value] : []))
    setPasteImages(prev => [...prev, ...valid].slice(0, 5))
  }, [])

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items
      if (!items) return
      const imageItems = Array.from(items)
        .filter(i => i.kind === 'file' && i.type.startsWith('image/'))
        .map(i => i.getAsFile())
        .filter((f): f is File => f !== null)
      if (imageItems.length > 0) addImages(imageItems)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [addImages])

  function handleStartPaste() {
    if (!pasteText.trim()) return
    session.setRequirement(pasteText)
    session.setImages(pasteImages)
    router.push('/session/generate')
  }

  // ── Import Excel card ──
  const [excelDragOver, setExcelDragOver] = useState(false)
  const [excelPreview, setExcelPreview] = useState<ExcelPreview | null>(null)
  const [excelError, setExcelError] = useState<string | null>(null)
  const [excelLoading, setExcelLoading] = useState(false)
  const excelInputRef = useRef<HTMLInputElement>(null)

  async function handleExcelFile(file: File) {
    if (!file.name.match(/\.(xlsx|csv)$/i)) {
      setExcelError('Only .xlsx and .csv files are supported')
      return
    }
    setExcelLoading(true)
    setExcelError(null)
    try {
      const preview = await parseExcelFile(file)
      setExcelPreview(preview)
    } catch {
      setExcelError('Could not read the file — make sure it is a valid Excel or CSV file')
    } finally {
      setExcelLoading(false)
    }
  }

  function handleConfirmImport(resume: boolean) {
    if (!excelPreview) return
    const tcs = excelPreview.rows.map(excelRowToTC)
    const standardTCs = tcs.filter((t): t is StandardTC => t.type === 'Standard')
    const e2eTCs = tcs.filter((t): t is E2ETC => t.type === 'E2E')
    const apiTCs = tcs.filter((t): t is APITC => t.type === 'API')
    if (!resume) {
      // Reset statuses when not resuming
      standardTCs.forEach(t => { t.status = 'Pending' })
      e2eTCs.forEach(t => { t.status = 'Pending' })
      apiTCs.forEach(t => { t.status = 'Pending' })
    }
    session.setStandardTCs(standardTCs)
    session.setE2eTCs(e2eTCs)
    session.setApiTCs(apiTCs)
    router.push(e2eTCs.length > 0 && standardTCs.length === 0 ? '/session/e2e' : '/session/standard')
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-ink-50 flex flex-col">
      {/* Resume banner */}
      {savedSession && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex items-center gap-4">
          <span className="text-sm text-amber-900">
            Unsaved session found from{' '}
            <span className="font-mono">{new Date(savedSession.savedAt).toLocaleString()}</span>{' '}
            — {savedSession.tcs.length} test cases
          </span>
          <button
            className="btn-primary text-xs py-1"
            onClick={() => {
              router.push('/session/standard')
            }}
          >
            Resume
          </button>
          <button
            className="btn-ghost text-xs py-1"
            onClick={() => {
              clearSession()
              setSavedSession(null)
            }}
          >
            Discard
          </button>
        </div>
      )}

      {/* Header */}
      <div className="px-8 pt-12 pb-8 text-center">
        <div className="inline-flex items-center gap-2 mb-4">
          <span className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 1L10 6H15L11 9.5L12.5 15L8 11.5L3.5 15L5 9.5L1 6H6L8 1Z" fill="white" />
            </svg>
          </span>
          <span className="text-xl font-semibold text-ink-900">QA Assist</span>
        </div>
        <h1 className="text-3xl font-bold text-ink-900 mb-2">Where do you want to start?</h1>
        <p className="text-ink-500 text-sm">
          No login required — paste a Jira key, type your requirement, or import an existing Excel file.
        </p>
      </div>

      {/* Three cards */}
      <div className="flex-1 px-8 pb-12">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">

          {/* Card A: Jira */}
          <div className="card p-6 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <IconJira />
              <div>
                <h2 className="font-semibold text-ink-900 text-sm">Load from Jira</h2>
                <p className="text-ink-500 text-xs mt-0.5">Pull requirements by issue key</p>
              </div>
            </div>
            <div className="flex-1 flex flex-col gap-3">
              <input
                type="text"
                value={jiraKey}
                onChange={e => { setJiraKey(e.target.value.toUpperCase()); setJiraError(null) }}
                onKeyDown={e => e.key === 'Enter' && handleLoadJira()}
                placeholder="PROJ-1042"
                className="w-full font-mono text-sm border border-ink-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent placeholder:text-ink-300"
              />
              {jiraError && (
                <p className="text-xs text-danger">{jiraError}</p>
              )}
            </div>
            <button
              className="btn-primary w-full"
              onClick={handleLoadJira}
              disabled={jiraLoading || !jiraKey.trim()}
            >
              {jiraLoading ? 'Loading…' : 'Load from Jira'}
            </button>
          </div>

          {/* Card B: Paste */}
          <div className="card p-6 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <IconPaste />
              <div>
                <h2 className="font-semibold text-ink-900 text-sm">Paste requirement</h2>
                <p className="text-ink-500 text-xs mt-0.5">Type or paste your requirement text</p>
              </div>
            </div>
            <div className="flex-1 flex flex-col gap-3">
              <textarea
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                placeholder="User story, acceptance criteria, or any requirement text…"
                rows={5}
                className="w-full text-sm border border-ink-200 rounded-lg px-3 py-2 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent placeholder:text-ink-300"
              />
              {/* Image drop zone */}
              <div
                className={`border-2 border-dashed rounded-lg p-3 text-center text-xs transition-colors cursor-pointer ${imagesDragOver ? 'border-accent bg-accent/5' : 'border-ink-200 hover:border-ink-300'}`}
                onDragOver={e => { e.preventDefault(); setImagesDragOver(true) }}
                onDragLeave={() => setImagesDragOver(false)}
                onDrop={async e => {
                  e.preventDefault()
                  setImagesDragOver(false)
                  await addImages(e.dataTransfer.files)
                }}
                onClick={() => imageInputRef.current?.click()}
              >
                {pasteImages.length > 0 ? (
                  <span className="text-ink-600">{pasteImages.length} image{pasteImages.length !== 1 ? 's' : ''} attached</span>
                ) : (
                  <span className="text-ink-400">Drop Figma screenshots here or Ctrl+V to paste</span>
                )}
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={e => e.target.files && addImages(e.target.files)}
                />
              </div>
              {pasteImages.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {pasteImages.map((src, i) => (
                    <div key={i} className="relative group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="" className="h-12 w-16 object-cover rounded border border-ink-200" />
                      <button
                        className="absolute -top-1 -right-1 w-4 h-4 bg-danger text-white rounded-full text-xs leading-none hidden group-hover:flex items-center justify-center"
                        onClick={() => setPasteImages(prev => prev.filter((_, j) => j !== i))}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button
              className="btn-primary w-full"
              onClick={handleStartPaste}
              disabled={!pasteText.trim()}
            >
              Start
            </button>
          </div>

          {/* Card C: Import Excel */}
          <div className="card p-6 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <IconImport />
              <div>
                <h2 className="font-semibold text-ink-900 text-sm">Import Excel</h2>
                <p className="text-ink-500 text-xs mt-0.5">Upload .xlsx or .csv to resume a session</p>
              </div>
            </div>
            <div className="flex-1 flex flex-col gap-3">
              {!excelPreview ? (
                <>
                  <div
                    className={`flex-1 min-h-[120px] border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-2 text-center p-4 cursor-pointer transition-colors ${excelDragOver ? 'border-accent bg-accent/5' : 'border-ink-200 hover:border-ink-300'}`}
                    onDragOver={e => { e.preventDefault(); setExcelDragOver(true) }}
                    onDragLeave={() => setExcelDragOver(false)}
                    onDrop={async e => {
                      e.preventDefault()
                      setExcelDragOver(false)
                      const file = e.dataTransfer.files[0]
                      if (file) handleExcelFile(file)
                    }}
                    onClick={() => excelInputRef.current?.click()}
                  >
                    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="text-ink-300">
                      <rect x="4" y="4" width="24" height="24" rx="3" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M10 16h12M10 11h12M10 21h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                    <span className="text-xs text-ink-400">
                      {excelLoading ? 'Parsing…' : 'Drop .xlsx or .csv here'}
                    </span>
                    <input
                      ref={excelInputRef}
                      type="file"
                      accept=".xlsx,.csv"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0]
                        if (file) handleExcelFile(file)
                      }}
                    />
                  </div>
                  {excelError && <p className="text-xs text-danger">{excelError}</p>}
                  <button className="btn-ghost w-full" onClick={() => excelInputRef.current?.click()}>
                    Browse files
                  </button>
                </>
              ) : (
                <>
                  <div className="text-xs text-ink-500 font-mono">
                    {excelPreview.totalRows} rows detected
                  </div>
                  <div className="overflow-x-auto rounded border border-ink-100 max-h-40 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-ink-50 sticky top-0">
                        <tr>
                          {['ID', 'Type', 'Title', 'Priority', 'Status'].map(h => (
                            <th key={h} className="px-2 py-1.5 text-left text-ink-500 font-medium whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {excelPreview.rows.map((row, i) => (
                          <tr key={i} className="border-t border-ink-100">
                            <td className="px-2 py-1 font-mono text-ink-600 whitespace-nowrap">{row.id || '—'}</td>
                            <td className="px-2 py-1 text-ink-500 whitespace-nowrap">{row.type || 'Standard'}</td>
                            <td className="px-2 py-1 text-ink-700 max-w-[120px] truncate">{row.title}</td>
                            <td className="px-2 py-1 whitespace-nowrap">
                              <span className={`tc-id ${row.priority === 'High' ? 'text-danger' : row.priority === 'Low' ? 'text-ink-400' : 'text-warn'}`}>
                                {row.priority || '—'}
                              </span>
                            </td>
                            <td className="px-2 py-1 whitespace-nowrap text-ink-500">{row.status || 'Pending'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-col gap-2">
                    {excelPreview.hasStatus && (
                      <button
                        className="btn-primary w-full text-xs"
                        onClick={() => handleConfirmImport(true)}
                      >
                        Resume session (keep statuses)
                      </button>
                    )}
                    <button
                      className="btn-ghost w-full text-xs"
                      onClick={() => handleConfirmImport(false)}
                    >
                      Import as new run
                    </button>
                    <button
                      className="text-xs text-ink-400 hover:text-ink-600 text-center"
                      onClick={() => { setExcelPreview(null); setExcelError(null) }}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Jira Pull — sub-task with existing TCs */}
        <JiraPullSection session={session} router={router} />
      </div>
    </main>
  )
}
