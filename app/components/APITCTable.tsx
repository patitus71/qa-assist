// app/components/APITCTable.tsx
'use client'

import { useState } from 'react'
import type { APITC, Assertion, TCPriority } from '@/lib/types'

interface Props {
  tcs: APITC[]
  onChange: (tcs: APITC[]) => void
}

const PRIORITIES: TCPriority[] = ['High', 'Med', 'Low']
const METHODS = ['GET', 'POST', 'PUT', 'DELETE'] as const
const ASSERTION_TYPES = ['status', 'body', 'jsonpath', 'time'] as const
const OPERATORS = ['equals', 'contains', 'less_than'] as const

const METHOD_COLORS: Record<string, string> = {
  GET: 'text-green-700 bg-green-50 border-green-200',
  POST: 'text-blue-700 bg-blue-50 border-blue-200',
  PUT: 'text-amber-700 bg-amber-50 border-amber-200',
  DELETE: 'text-red-700 bg-red-50 border-red-200',
}

function MethodBadge({ method }: { method: string }) {
  return (
    <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap ${METHOD_COLORS[method] ?? 'bg-ink-100 text-ink-600 border-ink-200'}`}>
      {method}
    </span>
  )
}

function PriorityBadge({ p }: { p: TCPriority }) {
  const cls = p === 'High' ? 'badge-priority-high' : p === 'Low' ? 'badge-priority-low' : 'badge-priority-med'
  return <span className={cls}>{p}</span>
}

function AIBadge() {
  return (
    <span className="font-mono text-[9px] px-1 py-0.5 rounded bg-accent/10 text-accent border border-accent/20 whitespace-nowrap">
      AI
    </span>
  )
}

function IconTrash() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M3 4h10M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M6 7v5M10 7v5M4 4l1 9h6l1-9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className={`transition-transform ${open ? 'rotate-180' : ''}`}>
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── API Assertion Builder ─────────────────────────────────────────────────────

function APIBuilder({ tc, onChange }: { tc: APITC; onChange: (tc: APITC) => void }) {
  const [exampleResponse, setExampleResponse] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [swaggerUrl, setSwaggerUrl] = useState('')
  const [swaggerLoading, setSwaggerLoading] = useState(false)
  const [newAssertion, setNewAssertion] = useState<Partial<Assertion>>({
    type: 'status', operator: 'equals', expected: '200',
  })
  const [bodyText, setBodyText] = useState(JSON.stringify(tc.body, null, 2))

  async function generateFromResponse() {
    if (!exampleResponse.trim()) return
    setIsGenerating(true)
    setGenError(null)
    try {
      const res = await fetch('/api/generate-assertions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exampleResponse }),
      })
      const data = await res.json() as { assertions?: Assertion[]; error?: string }
      if (!res.ok) { setGenError(data.error ?? 'Generation failed'); return }
      const assertions = [...tc.assertions.filter(a => !a.fromSpec), ...(data.assertions ?? [])]
      onChange({ ...tc, assertions })
    } catch {
      setGenError('Network error')
    } finally {
      setIsGenerating(false)
    }
  }

  async function loadFromSwagger() {
    if (!swaggerUrl.trim()) return
    setSwaggerLoading(true)
    try {
      const res = await fetch(`/api/swagger?url=${encodeURIComponent(swaggerUrl)}`)
      const data = await res.json() as { content?: string; error?: string }
      if (!res.ok) { setGenError(data.error ?? 'Failed to load spec'); return }
      if (data.content) setExampleResponse(data.content)
    } catch {
      setGenError('Network error fetching Swagger spec')
    } finally {
      setSwaggerLoading(false)
    }
  }

  function addAssertion() {
    if (!newAssertion.type || !newAssertion.operator || !newAssertion.expected) return
    const a: Assertion = {
      type: newAssertion.type as Assertion['type'],
      operator: newAssertion.operator as Assertion['operator'],
      expected: newAssertion.expected,
    }
    onChange({ ...tc, assertions: [...tc.assertions, a] })
    setNewAssertion({ type: 'status', operator: 'equals', expected: '200' })
  }

  function removeAssertion(idx: number) {
    onChange({ ...tc, assertions: tc.assertions.filter((_, i) => i !== idx) })
  }

  function updateBody() {
    try {
      const parsed = JSON.parse(bodyText) as Record<string, unknown>
      onChange({ ...tc, body: parsed })
    } catch { /* invalid JSON — keep as-is */ }
  }

  const inputCls = 'font-mono text-xs border border-ink-200 rounded px-2 py-1 bg-white focus:outline-none focus:border-accent'

  return (
    <div className="p-4 bg-ink-50/50 border-t border-ink-100 space-y-4">
      {/* Method + Endpoint */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-ink-500 uppercase tracking-wide font-medium block mb-1.5">Method + Endpoint</label>
          <div className="flex gap-2">
            <select value={tc.method} onChange={e => onChange({ ...tc, method: e.target.value as APITC['method'] })}
              className={`${inputCls} whitespace-nowrap shrink-0`}>
              {METHODS.map(m => <option key={m}>{m}</option>)}
            </select>
            <input value={tc.endpoint} onChange={e => onChange({ ...tc, endpoint: e.target.value })}
              placeholder="/api/v1/endpoint"
              className={`${inputCls} flex-1`} />
          </div>
        </div>

        {/* Request body */}
        <div>
          <label className="text-xs text-ink-500 uppercase tracking-wide font-medium block mb-1.5">Request Body</label>
          <textarea value={bodyText} onChange={e => setBodyText(e.target.value)} onBlur={updateBody}
            rows={3} placeholder="{}" className={`${inputCls} w-full resize-none`} />
        </div>
      </div>

      {/* Assertions */}
      <div>
        <label className="text-xs text-ink-500 uppercase tracking-wide font-medium block mb-1.5">
          Assertions ({tc.assertions.length})
        </label>
        {tc.assertions.length === 0 && (
          <p className="text-xs text-ink-400 italic mb-2">No assertions — add manually or generate from example response.</p>
        )}
        <div className="flex flex-col gap-1.5 mb-3">
          {tc.assertions.map((a, i) => (
            <div key={i} className="flex items-center gap-2 group">
              <span className={`${inputCls} shrink-0 text-ink-600`}>{a.type}</span>
              <span className={`${inputCls} shrink-0 text-ink-500`}>{a.operator}</span>
              <span className={`${inputCls} flex-1 text-ink-700`}>{a.expected}</span>
              {a.fromSpec && (
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent border border-accent/20 whitespace-nowrap shrink-0">
                  from spec
                </span>
              )}
              <button onClick={() => removeAssertion(i)}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-danger hover:bg-red-50 rounded p-0.5">
                <IconTrash />
              </button>
            </div>
          ))}
        </div>

        {/* Add assertion row */}
        <div className="flex items-center gap-2 border-t border-dashed border-ink-200 pt-2">
          <select value={newAssertion.type ?? 'status'} onChange={e => setNewAssertion(a => ({ ...a, type: e.target.value as Assertion['type'] }))}
            className={`${inputCls} shrink-0`}>
            {ASSERTION_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
          <select value={newAssertion.operator ?? 'equals'} onChange={e => setNewAssertion(a => ({ ...a, operator: e.target.value as Assertion['operator'] }))}
            className={`${inputCls} shrink-0`}>
            {OPERATORS.map(o => <option key={o}>{o}</option>)}
          </select>
          <input value={newAssertion.expected ?? ''} onChange={e => setNewAssertion(a => ({ ...a, expected: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && addAssertion()}
            placeholder="Expected value"
            className={`${inputCls} flex-1`} />
          <button onClick={addAssertion} disabled={!newAssertion.expected}
            className="btn-primary text-xs py-1 px-2 disabled:opacity-40">Add</button>
        </div>
      </div>

      {/* Example response */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs text-ink-500 uppercase tracking-wide font-medium">Example Response</label>
          <div className="flex gap-2">
            <div className="flex gap-1">
              <input value={swaggerUrl} onChange={e => setSwaggerUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && loadFromSwagger()}
                placeholder="Swagger URL…"
                className="font-mono text-xs border border-ink-200 rounded px-2 py-0.5 bg-white focus:outline-none focus:border-accent w-48" />
              <button onClick={loadFromSwagger} disabled={!swaggerUrl.trim() || swaggerLoading}
                className="btn-ghost text-xs py-0.5 disabled:opacity-40">
                {swaggerLoading ? '…' : 'Load spec'}
              </button>
            </div>
            <button onClick={generateFromResponse} disabled={!exampleResponse.trim() || isGenerating}
              className="btn-primary text-xs py-0.5 disabled:opacity-40">
              {isGenerating ? 'Generating…' : 'AI generate from response'}
            </button>
          </div>
        </div>
        <textarea
          value={exampleResponse}
          onChange={e => setExampleResponse(e.target.value)}
          rows={5}
          placeholder={'{\n  "id": 1,\n  "status": "success"\n}'}
          className="w-full font-mono text-xs rounded-lg p-3 bg-ink-900 text-green-400 border border-ink-700 resize-y focus:outline-none focus:border-accent"
        />
        {genError && <p className="text-xs text-danger mt-1">{genError}</p>}
      </div>
    </div>
  )
}

// ── API TC Table ──────────────────────────────────────────────────────────────

export function APITCTable({ tcs, onChange }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editCell, setEditCell] = useState<{ rowId: string; field: 'endpoint' | 'priority' } | null>(null)
  const [newRow, setNewRow] = useState({ method: 'GET' as APITC['method'], endpoint: '', priority: 'Med' as TCPriority })

  function toggleExpand(id: string) {
    setExpanded(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function saveCell(rowId: string, field: string, value: string) {
    onChange(tcs.map(t => (t.id === rowId ? { ...t, [field]: value } : t)))
    setEditCell(null)
  }

  function renderCell(tc: APITC, field: 'endpoint' | 'priority') {
    const isEditing = editCell?.rowId === tc.id && editCell?.field === field
    if (!isEditing) {
      return (
        <div className="cursor-text hover:bg-accent/5 rounded px-1 -mx-1 transition-colors" onClick={() => setEditCell({ rowId: tc.id, field })}>
          {field === 'priority' ? <PriorityBadge p={tc.priority} /> : (
            <span className="font-mono text-xs text-ink-700">{tc.endpoint || <span className="text-ink-300">—</span>}</span>
          )}
        </div>
      )
    }
    if (field === 'priority') {
      return (
        <select autoFocus value={tc.priority} onChange={e => saveCell(tc.id, 'priority', e.target.value)} onBlur={() => setEditCell(null)}
          className="text-xs border border-accent rounded px-1 py-0.5 bg-white focus:outline-none">
          {PRIORITIES.map(p => <option key={p}>{p}</option>)}
        </select>
      )
    }
    return (
      <input autoFocus defaultValue={tc.endpoint}
        className="w-full font-mono text-xs border border-accent rounded px-2 py-0.5 bg-white focus:outline-none"
        onBlur={e => saveCell(tc.id, 'endpoint', e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') saveCell(tc.id, 'endpoint', (e.target as HTMLInputElement).value)
          if (e.key === 'Escape') setEditCell(null)
        }} />
    )
  }

  function handleAdd() {
    if (!newRow.endpoint.trim()) return
    const tc: APITC = {
      id: `ATC-${String(tcs.length + 1).padStart(2, '0')}`,
      type: 'API',
      method: newRow.method,
      endpoint: newRow.endpoint,
      body: {},
      assertions: [],
      priority: newRow.priority,
      status: 'Pending',
    }
    onChange([...tcs, tc])
    setNewRow({ method: 'GET', endpoint: '', priority: 'Med' })
  }

  function deleteSelected() {
    onChange(tcs.filter(t => !selected.has(t.id)))
    setSelected(new Set())
  }

  const allSelected = tcs.length > 0 && tcs.every(t => selected.has(t.id))

  return (
    <div>
      {selected.size > 0 && (
        <div className="flex justify-end mb-3">
          <button onClick={deleteSelected} className="btn-ghost text-xs text-danger border-danger hover:bg-red-50">
            Delete {selected.size} selected
          </button>
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-ink-50 border-b border-ink-100">
            <tr>
              <th className="w-8 px-3 py-2.5">
                <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(tcs.map(t => t.id)))} className="rounded" />
              </th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-ink-500 uppercase tracking-wide w-24">ID</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-ink-500 uppercase tracking-wide w-20">Method</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-ink-500 uppercase tracking-wide">Endpoint</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-ink-500 uppercase tracking-wide w-20">Priority</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-ink-500 uppercase tracking-wide w-24">Assertions</th>
              <th className="w-16" />
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-50">
            {tcs.map(tc => (
              <>
                <tr key={tc.id} className="group hover:bg-ink-50/60 transition-colors">
                  <td className="w-8 px-3 py-2">
                    <input type="checkbox" checked={selected.has(tc.id)} onChange={() => {
                      const n = new Set(selected); n.has(tc.id) ? n.delete(tc.id) : n.add(tc.id); setSelected(n)
                    }} className="rounded" />
                  </td>
                  <td className="px-3 py-2 w-24">
                    <div className="flex items-center gap-1.5">
                      <span className="tc-id">{tc.id}</span>
                      {tc.aiGenerated && <AIBadge />}
                    </div>
                  </td>
                  <td className="px-3 py-2 w-20"><MethodBadge method={tc.method} /></td>
                  <td className="px-3 py-2 min-w-[200px]">{renderCell(tc, 'endpoint')}</td>
                  <td className="px-3 py-2 w-20">{renderCell(tc, 'priority')}</td>
                  <td className="px-3 py-2 w-24">
                    <span className="font-mono text-xs text-ink-500 bg-ink-100 px-1.5 py-0.5 rounded-full">
                      {tc.assertions.length}
                    </span>
                  </td>
                  <td className="px-2 py-2 w-16">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => toggleExpand(tc.id)}
                        className={`p-1 rounded transition-colors ${expanded.has(tc.id) ? 'text-accent bg-accent/10' : 'text-ink-400 hover:bg-ink-100'}`}
                        title={expanded.has(tc.id) ? 'Collapse' : 'Edit assertions'}>
                        <IconChevron open={expanded.has(tc.id)} />
                      </button>
                      <button onClick={() => onChange(tcs.filter(t => t.id !== tc.id))}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-danger hover:bg-red-50 rounded p-1">
                        <IconTrash />
                      </button>
                    </div>
                  </td>
                </tr>

                {expanded.has(tc.id) && (
                  <tr key={`${tc.id}-builder`}>
                    <td colSpan={7} className="p-0">
                      <APIBuilder tc={tc} onChange={updated => onChange(tcs.map(t => (t.id === tc.id ? updated : t)))} />
                    </td>
                  </tr>
                )}
              </>
            ))}

            {/* Add row */}
            <tr className="bg-ink-50/40 border-t-2 border-dashed border-ink-200">
              <td className="w-8 px-3 py-2" />
              <td className="px-3 py-2 w-24"><span className="font-mono text-xs text-ink-400">auto</span></td>
              <td className="px-3 py-2 w-20">
                <select value={newRow.method} onChange={e => setNewRow(r => ({ ...r, method: e.target.value as APITC['method'] }))}
                  className="font-mono text-xs border border-ink-200 rounded px-1 py-0.5 bg-white">
                  {METHODS.map(m => <option key={m}>{m}</option>)}
                </select>
              </td>
              <td className="px-3 py-2">
                <input value={newRow.endpoint} onChange={e => setNewRow(r => ({ ...r, endpoint: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                  placeholder="/api/v1/endpoint…"
                  className="w-full font-mono text-xs border border-ink-200 rounded px-2 py-0.5 bg-white focus:outline-none focus:border-accent placeholder:text-ink-300" />
              </td>
              <td className="px-3 py-2 w-20">
                <select value={newRow.priority} onChange={e => setNewRow(r => ({ ...r, priority: e.target.value as TCPriority }))}
                  className="text-xs border border-ink-200 rounded px-1 py-0.5 bg-white">
                  {PRIORITIES.map(p => <option key={p}>{p}</option>)}
                </select>
              </td>
              <td className="px-3 py-2 w-24" />
              <td className="px-2 py-2 w-16">
                <button onClick={handleAdd} disabled={!newRow.endpoint.trim()}
                  className="btn-primary text-xs py-1 px-2 disabled:opacity-40">Add</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
