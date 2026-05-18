// app/session/robot/page.tsx
'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { useSession } from '@/lib/session-context'
import { generateDefaultRobot, downloadRobotFile } from '@/lib/export-robot'
import type { TC } from '@/lib/types'
import type { ParsedTemplate } from '@/app/api/robot/parse-template/route'

type Mode = 'default' | 'custom'
type Scope = 'all' | 'standard' | 'e2e' | 'api'

// ── Syntax highlighter ────────────────────────────────────────────────────────

function RobotPreview({ content }: { content: string }) {
  const lines = content.split('\n')
  return (
    <pre className="font-mono text-xs leading-relaxed p-4 overflow-auto" style={{ tabSize: 4 }}>
      {lines.map((line, i) => {
        // Section headers *** ... ***
        if (/^\*\*\*/.test(line)) {
          return <div key={i} className="text-cyan-400 font-bold">{line}</div>
        }
        // Comments
        if (/^\s*#/.test(line)) {
          return <div key={i} className="text-gray-500">{line}</div>
        }
        // [Tags], [Documentation], [Arguments], etc.
        if (/^\s+\[/.test(line)) {
          const parts = line.split(/(\$\{[^}]+\})/g)
          return (
            <div key={i}>
              {parts.map((p, j) =>
                p.startsWith('${') ? (
                  <span key={j} className="text-sky-300">{p}</span>
                ) : /\[.*?\]/.test(p) ? (
                  <span key={j} className="text-yellow-300">{p}</span>
                ) : (
                  <span key={j} className="text-gray-200">{p}</span>
                )
              )}
            </div>
          )
        }
        // Variable declarations/usage
        const parts = line.split(/(\$\{[^}]+\})/g)
        const hasVar = parts.some(p => p.startsWith('${'))
        if (hasVar) {
          return (
            <div key={i} className="text-gray-200">
              {parts.map((p, j) =>
                p.startsWith('${') ? <span key={j} className="text-sky-300">{p}</span> : p
              )}
            </div>
          )
        }
        // Keyword definitions (no leading spaces, not a section)
        if (/^[A-Za-z]/.test(line)) {
          return <div key={i} className="text-green-300">{line}</div>
        }
        return <div key={i} className="text-gray-200">{line}</div>
      })}
    </pre>
  )
}

// ── Mode card ─────────────────────────────────────────────────────────────────

function ModeCard({ mode, active, icon, title, description, onClick }: {
  mode: Mode; active: boolean; icon: React.ReactNode; title: string; description: string; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`card p-5 flex flex-col text-left transition-all ${
        active ? 'border-accent bg-accent/5 ring-1 ring-accent/30' : 'hover:border-ink-300'
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className={active ? 'text-accent' : 'text-ink-500'}>{icon}</span>
        <span className={`text-sm font-semibold ${active ? 'text-accent' : 'text-ink-900'}`}>{title}</span>
        {active && <span className="ml-auto font-mono text-[10px] bg-accent text-white px-1.5 py-0.5 rounded-full">Selected</span>}
      </div>
      <p className="text-xs text-ink-500 flex-1 leading-relaxed">{description}</p>
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RobotPage() {
  const session = useSession()

  const [mode, setMode] = useState<Mode>('default')
  const [scope, setScope] = useState<Scope>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string> | null>(null) // null = all selected
  const [showPreview, setShowPreview] = useState(false)
  const [defaultContent, setDefaultContent] = useState('')

  // Custom mode state
  const [template, setTemplate] = useState<ParsedTemplate | null>(null)
  const [selectedSections, setSelectedSections] = useState<Set<string>>(new Set(['settings', 'variables', 'keywords']))
  const [customContent, setCustomContent] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [generateError, setGenerateError] = useState('')
  const [editableCustomContent, setEditableCustomContent] = useState('')
  const [editingCustom, setEditingCustom] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setEditableCustomContent(customContent)
    setEditingCustom(false)
  }, [customContent])

  const scopeTCs = useMemo((): TC[] => {
    const all: TC[] = [...session.standardTCs, ...session.e2eTCs, ...session.apiTCs]
    if (scope === 'all') return all
    if (scope === 'standard') return session.standardTCs
    if (scope === 'e2e') return session.e2eTCs
    return session.apiTCs
  }, [scope, session.standardTCs, session.e2eTCs, session.apiTCs])

  const visibleTCs = selectedIds === null ? scopeTCs : scopeTCs.filter(t => (selectedIds as Set<string>).has(t.id))
  const totalTCs = session.standardTCs.length + session.e2eTCs.length + session.apiTCs.length

  function toggleTC(id: string) {
    if (selectedIds === null) {
      // Currently all selected — deselect this one
      const next = new Set(scopeTCs.map(t => t.id))
      next.delete(id)
      setSelectedIds(next)
    } else {
      const next = new Set(selectedIds)
      next.has(id) ? next.delete(id) : next.add(id)
      // If all selected, reset to null (all)
      if (next.size === scopeTCs.length) setSelectedIds(null)
      else setSelectedIds(next)
    }
  }

  function isTCSelected(id: string) {
    return selectedIds === null || selectedIds.has(id)
  }

  function selectAll() { setSelectedIds(null) }
  function deselectAll() { setSelectedIds(new Set()) }

  function generateDefault() {
    const tcs = selectedIds === null ? scopeTCs : scopeTCs.filter(t => (selectedIds as Set<string>).has(t.id))
    const content = generateDefaultRobot(tcs)
    setDefaultContent(content)
    setShowPreview(true)
  }

  function downloadDefault() {
    const tcs = selectedIds === null ? scopeTCs : scopeTCs.filter(t => (selectedIds as Set<string>).has(t.id))
    const content = defaultContent || generateDefaultRobot(tcs)
    downloadRobotFile(content, `qa-assist-${scope}.robot`)
  }

  async function uploadTemplate(file: File) {
    setIsUploading(true)
    setUploadError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/robot/parse-template', { method: 'POST', body: fd })
      const data = await res.json() as ParsedTemplate & { error?: string }
      if (!res.ok) { setUploadError(data.error ?? 'Failed to parse file'); return }
      setTemplate(data)
      // Generate default preview to show diff
      const tcs = selectedIds === null ? scopeTCs : scopeTCs.filter(t => (selectedIds as Set<string>).has(t.id))
      setDefaultContent(generateDefaultRobot(tcs))
    } catch { setUploadError('Network error') }
    finally { setIsUploading(false) }
  }

  async function generateCustom() {
    if (!template) return
    setIsGenerating(true)
    setGenerateError('')
    const tcs = selectedIds === null ? scopeTCs : scopeTCs.filter(t => (selectedIds as Set<string>).has(t.id))

    // Apply only selected sections from the template
    const effectiveTemplate: ParsedTemplate = {
      settings: selectedSections.has('settings') ? template.settings : '',
      variables: selectedSections.has('variables') ? template.variables : '',
      testcases: '',
      keywords: selectedSections.has('keywords') ? template.keywords : '',
    }

    try {
      const res = await fetch('/api/robot/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tcs, mode: 'custom', template: effectiveTemplate, scope: [scope] }),
      })
      const data = await res.json() as { content?: string; error?: string }
      if (!res.ok) { setGenerateError(data.error ?? 'Generation failed'); return }
      setCustomContent(data.content ?? '')
    } catch { setGenerateError('Network error') }
    finally { setIsGenerating(false) }
  }

  if (totalTCs === 0) {
    return (
      <div className="p-8 max-w-3xl">
        <h1 className="text-2xl font-bold text-ink-900 mb-4">Robot Export</h1>
        <div className="card p-10 border-dashed text-center text-ink-400">
          <p className="text-sm">No test cases to export. Generate or import test cases first.</p>
        </div>
      </div>
    )
  }

  const activeContent = mode === 'default' ? defaultContent : customContent

  return (
    <div className="p-8 max-w-6xl w-full">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink-900">Robot Export</h1>
        <p className="text-ink-500 text-sm mt-0.5">Generate Robot Framework .robot files from your test cases.</p>
      </div>

      {/* Mode cards */}
      <div className="grid grid-cols-2 gap-4 mb-6" style={{ alignItems: 'stretch' }}>
        <ModeCard
          mode="default"
          active={mode === 'default'}
          icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="2" y="2" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" /><path d="M5 7h8M5 11h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>}
          title="Default Template"
          description="Built-in template with SeleniumLibrary, DatabaseLibrary, and RequestsLibrary. Includes Login With Credentials and standard banking keywords ready to use."
          onClick={() => setMode('default')}
        />
        <ModeCard
          mode="custom"
          active={mode === 'custom'}
          icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2 14l4-4 3 3 5-7 2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /><circle cx="14" cy="4" r="2" stroke="currentColor" strokeWidth="1.5" /></svg>}
          title="Custom Template"
          description="Upload your team's existing .robot file as a format reference. AI matches your Library imports, custom Keywords, naming convention, and tag style exactly."
          onClick={() => setMode('custom')}
        />
      </div>

      <div className="flex flex-col gap-6">
        {/* Controls */}
        <div className="space-y-5">
          {/* Scope selector */}
          <div className="card p-4">
            <p className="text-xs font-medium text-ink-500 uppercase tracking-wide mb-2.5">Scope</p>
            <div className="flex gap-1">
              {(['all', 'standard', 'e2e', 'api'] as Scope[]).map(s => (
                <button key={s} onClick={() => { setScope(s); setSelectedIds(null) }}
                  className={`font-mono text-xs px-3 py-1.5 rounded border capitalize transition-all ${
                    scope === s ? 'bg-accent text-white border-accent' : 'border-ink-200 text-ink-600 hover:border-ink-300'
                  }`}>
                  {s === 'all' ? `All (${totalTCs})` : s === 'standard' ? `Standard (${session.standardTCs.length})` : s === 'e2e' ? `E2E (${session.e2eTCs.length})` : `API (${session.apiTCs.length})`}
                </button>
              ))}
            </div>
          </div>

          {/* Custom mode upload */}
          {mode === 'custom' && (
            <div className="card p-4 space-y-3">
              <p className="text-xs font-medium text-ink-500 uppercase tracking-wide">Upload Template</p>
              {!template ? (
                <>
                  <div
                    className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-ink-300 transition-colors"
                    onClick={() => fileRef.current?.click()}
                  >
                    <p className="text-xs text-ink-400">{isUploading ? 'Parsing…' : 'Drop .robot file here or click to browse'}</p>
                    <input ref={fileRef} type="file" accept=".robot" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) uploadTemplate(f) }} />
                  </div>
                  {uploadError && <p className="text-xs text-danger">{uploadError}</p>}
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-success bg-green-50 border border-green-200 px-2 py-0.5 rounded">Template loaded</span>
                    <button onClick={() => { setTemplate(null); setCustomContent('') }} className="text-xs text-ink-400 hover:text-danger ml-auto">Remove</button>
                  </div>
                  <p className="text-xs font-medium text-ink-600">Use sections:</p>
                  {(['settings', 'variables', 'keywords'] as const).map(sec => (
                    <label key={sec} className="flex items-center gap-2 text-xs capitalize cursor-pointer">
                      <input type="checkbox" checked={selectedSections.has(sec)}
                        onChange={() => {
                          const n = new Set(selectedSections)
                          n.has(sec) ? n.delete(sec) : n.add(sec)
                          setSelectedSections(n)
                        }} className="rounded" />
                      {sec} {template[sec] ? `(${template[sec].split('\n').length} lines)` : '(empty)'}
                    </label>
                  ))}
                  {generateError && <p className="text-xs text-danger">{generateError}</p>}
                  <button onClick={generateCustom} disabled={isGenerating}
                    className="btn-primary w-full text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                    {isGenerating && <svg className="animate-spin" width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="white" strokeWidth="2" strokeOpacity="0.4" /><path d="M8 2a6 6 0 0 1 6 6" stroke="white" strokeWidth="2" strokeLinecap="round" /></svg>}
                    {isGenerating ? 'Generating with AI…' : 'Generate using this template'}
                  </button>
                </>
              )}
            </div>
          )}

          {/* TC checklist */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-ink-100 bg-ink-50">
              <p className="text-xs font-medium text-ink-600">
                {selectedIds === null ? scopeTCs.length : (selectedIds as Set<string>).size}/{scopeTCs.length} selected
              </p>
              <div className="flex gap-2">
                <button onClick={selectAll} className="text-xs text-accent hover:underline">All</button>
                <button onClick={deselectAll} className="text-xs text-ink-400 hover:underline">None</button>
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto divide-y divide-ink-50">
              {scopeTCs.length === 0 ? (
                <p className="px-4 py-3 text-xs text-ink-400">No test cases in this scope.</p>
              ) : scopeTCs.map(tc => (
                <label key={tc.id} className="flex items-center gap-2.5 px-4 py-2 hover:bg-ink-50 cursor-pointer">
                  <input type="checkbox" checked={isTCSelected(tc.id)} onChange={() => toggleTC(tc.id)} className="rounded shrink-0" />
                  <span className="tc-id text-[10px] shrink-0">{tc.id}</span>
                  <span className="text-xs text-ink-700 truncate">
                    {tc.type === 'Standard' ? tc.title : tc.type === 'E2E' ? tc.title : `${tc.method} ${tc.endpoint}`}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3">
            {mode === 'default' ? (
              <>
                <button onClick={generateDefault} className="btn-ghost flex-1 text-sm">Preview .robot</button>
                <button onClick={downloadDefault} className="btn-primary flex-1 text-sm">Download .robot</button>
              </>
            ) : (
              <button
                onClick={() => editableCustomContent && downloadRobotFile(editableCustomContent, 'qa-assist-custom.robot')}
                disabled={!editableCustomContent}
                className="btn-primary flex-1 text-sm disabled:opacity-40"
              >
                Download custom .robot
              </button>
            )}
          </div>
        </div>

        {/* Preview */}
        <div className="space-y-3">

          {/* Diff: side-by-side when both default and custom are available */}
          {mode === 'custom' && defaultContent && editableCustomContent ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-ink-500 uppercase tracking-wide">Diff Preview</p>
              <div className="grid grid-cols-2 gap-4">
                {/* Default */}
                <div>
                  <p className="text-[10px] font-mono text-ink-400 mb-1 uppercase">Default template</p>
                  <div className="bg-ink-900 rounded-lg overflow-hidden border border-ink-700">
                    <div className="flex items-center justify-between px-3 py-1.5 bg-ink-800 border-b border-ink-700">
                      <span className="font-mono text-[10px] text-ink-400">qa-assist-{scope}.robot</span>
                      <button onClick={() => downloadRobotFile(defaultContent, `qa-assist-${scope}.robot`)} className="font-mono text-[10px] text-accent hover:underline">↓ download</button>
                    </div>
                    <div className="overflow-auto max-h-[480px]">
                      <RobotPreview content={defaultContent} />
                    </div>
                  </div>
                </div>
                {/* Custom */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] font-mono text-ink-400 uppercase">Custom (AI-generated)</p>
                    <button
                      onClick={() => setEditingCustom(e => !e)}
                      className="text-[10px] text-accent hover:underline font-mono"
                    >{editingCustom ? 'Preview' : 'Edit'}</button>
                  </div>
                  <div className="bg-ink-900 rounded-lg overflow-hidden border border-accent/30">
                    <div className="flex items-center justify-between px-3 py-1.5 bg-ink-800 border-b border-accent/20">
                      <span className="font-mono text-[10px] text-accent">qa-assist-custom.robot</span>
                      <button onClick={() => downloadRobotFile(editableCustomContent, 'qa-assist-custom.robot')} className="font-mono text-[10px] text-accent hover:underline">↓ download</button>
                    </div>
                    {editingCustom ? (
                      <textarea
                        className="w-full bg-ink-900 text-gray-200 font-mono text-xs p-4 resize-none focus:outline-none"
                        style={{ minHeight: '448px' }}
                        value={editableCustomContent}
                        onChange={e => setEditableCustomContent(e.target.value)}
                        spellCheck={false}
                      />
                    ) : (
                      <div className="overflow-auto max-h-[480px]">
                        <RobotPreview content={editableCustomContent} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Default-only preview */}
              {(showPreview || (mode === 'custom' && defaultContent)) && defaultContent && (
                <div>
                  {mode === 'custom' && (
                    <p className="text-[10px] font-mono text-ink-400 mb-1 uppercase">Default template</p>
                  )}
                  <div className="bg-ink-900 rounded-lg overflow-hidden border border-ink-700">
                    <div className="flex items-center justify-between px-3 py-1.5 bg-ink-800 border-b border-ink-700">
                      <span className="font-mono text-[10px] text-ink-400">qa-assist-{scope}.robot</span>
                      <button onClick={() => downloadRobotFile(defaultContent, `qa-assist-${scope}.robot`)} className="font-mono text-[10px] text-accent hover:underline">↓ download</button>
                    </div>
                    <div className="overflow-auto max-h-[600px]">
                      <RobotPreview content={defaultContent} />
                    </div>
                  </div>
                </div>
              )}

              {/* Empty state */}
              {!showPreview && !defaultContent && !editableCustomContent && (
                <div className="card p-10 border-dashed text-center text-ink-400 flex items-center justify-center">
                  <p className="text-sm">
                    {mode === 'default' ? 'Click "Preview .robot" to see generated content.' : 'Upload a template and generate to see the preview here.'}
                  </p>
                </div>
              )}
            </>
          )}

        </div>
      </div>
    </div>
  )
}
