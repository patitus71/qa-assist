// app/components/E2ETCTable.tsx
'use client'

import { useState } from 'react'
import type { E2ETC, E2EStep, TCPriority } from '@/lib/types'

interface Props {
  tcs: E2ETC[]
  onChange: (tcs: E2ETC[]) => void
}

const PRIORITIES: TCPriority[] = ['High', 'Med', 'Low']

const STEP_TYPE_STYLES: Record<E2EStep['type'], string> = {
  Action: 'bg-blue-100 text-accent border-blue-200',
  Verify: 'bg-green-100 text-success border-green-200',
  Setup: 'bg-purple-100 text-purple-700 border-purple-200',
  DB: 'bg-orange-100 text-orange-700 border-orange-200',
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

function StepTypeBadge({ type }: { type: E2EStep['type'] }) {
  return (
    <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap ${STEP_TYPE_STYLES[type]}`}>
      {type}
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

// ── Step Builder ─────────────────────────────────────────────────────────────

function StepBuilder({ tc, onChange }: { tc: E2ETC; onChange: (tc: E2ETC) => void }) {
  const [newStep, setNewStep] = useState<Partial<E2EStep>>({ type: 'Action', keyword: '', args: '', note: '' })

  function updateStep(num: number, field: keyof E2EStep, value: string) {
    onChange({
      ...tc,
      steps: tc.steps.map(s => (s.num === num ? { ...s, [field]: value } : s)),
    })
  }

  function deleteStep(num: number) {
    const steps = tc.steps.filter(s => s.num !== num).map((s, i) => ({ ...s, num: i + 1 }))
    onChange({ ...tc, steps })
  }

  function addStep() {
    if (!newStep.keyword?.trim()) return
    const step: E2EStep = {
      num: tc.steps.length + 1,
      keyword: newStep.keyword ?? '',
      args: newStep.args ?? '',
      type: newStep.type ?? 'Action',
      note: newStep.note ?? '',
    }
    onChange({ ...tc, steps: [...tc.steps, step] })
    setNewStep({ type: 'Action', keyword: '', args: '', note: '' })
  }

  const inputCls = 'font-mono text-xs border border-ink-200 rounded px-2 py-1 bg-white focus:outline-none focus:border-accent'
  const stepTypes: E2EStep['type'][] = ['Action', 'Verify', 'Setup', 'DB']

  return (
    <div className="p-4 bg-ink-50/50 border-t border-ink-100">
      <p className="text-xs font-medium text-ink-500 uppercase tracking-wide mb-3">Steps</p>

      {tc.steps.length === 0 && (
        <p className="text-xs text-ink-400 italic mb-3">No steps yet — add the first step below.</p>
      )}

      <div className="flex flex-col gap-2 mb-4">
        {tc.steps.map(step => (
          <div key={step.num} className="flex items-start gap-2 group">
            {/* Step number */}
            <span className="shrink-0 w-6 h-6 rounded-full bg-ink-200 text-ink-600 flex items-center justify-center font-mono text-[10px] mt-1">
              {step.num}
            </span>

            {/* Type select */}
            <select
              value={step.type}
              onChange={e => updateStep(step.num, 'type', e.target.value)}
              className={`${inputCls} whitespace-nowrap shrink-0`}
            >
              {stepTypes.map(t => <option key={t}>{t}</option>)}
            </select>

            {/* Type badge */}
            <StepTypeBadge type={step.type} />

            {/* Keyword */}
            <input
              value={step.keyword}
              onChange={e => updateStep(step.num, 'keyword', e.target.value)}
              placeholder="Keyword"
              className={`${inputCls} flex-1`}
            />

            {/* Args */}
            <input
              value={step.args}
              onChange={e => updateStep(step.num, 'args', e.target.value)}
              placeholder="Arguments"
              className={`${inputCls} flex-1`}
            />

            {/* Note */}
            <input
              value={step.note}
              onChange={e => updateStep(step.num, 'note', e.target.value)}
              placeholder="Note (optional)"
              className={`${inputCls} flex-1 text-ink-400`}
            />

            {/* Delete */}
            <button
              onClick={() => deleteStep(step.num)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-danger hover:bg-red-50 rounded p-1 mt-0.5"
            >
              <IconTrash />
            </button>
          </div>
        ))}
      </div>

      {/* Add step row */}
      <div className="flex items-center gap-2 border-t border-dashed border-ink-200 pt-3">
        <span className="shrink-0 w-6 h-6 rounded-full border border-dashed border-ink-300 flex items-center justify-center font-mono text-[10px] text-ink-400">
          +
        </span>
        <select
          value={newStep.type ?? 'Action'}
          onChange={e => setNewStep(s => ({ ...s, type: e.target.value as E2EStep['type'] }))}
          className={`${inputCls} whitespace-nowrap shrink-0`}
        >
          {stepTypes.map(t => <option key={t}>{t}</option>)}
        </select>
        <input
          value={newStep.keyword ?? ''}
          onChange={e => setNewStep(s => ({ ...s, keyword: e.target.value }))}
          onKeyDown={e => e.key === 'Enter' && addStep()}
          placeholder="Keyword"
          className={`${inputCls} flex-1`}
        />
        <input
          value={newStep.args ?? ''}
          onChange={e => setNewStep(s => ({ ...s, args: e.target.value }))}
          placeholder="Arguments"
          className={`${inputCls} flex-1`}
        />
        <input
          value={newStep.note ?? ''}
          onChange={e => setNewStep(s => ({ ...s, note: e.target.value }))}
          placeholder="Note"
          className={`${inputCls} flex-1 text-ink-400`}
        />
        <button
          onClick={addStep}
          disabled={!newStep.keyword?.trim()}
          className="btn-primary text-xs py-1 px-3 disabled:opacity-40"
        >
          Add step
        </button>
      </div>
    </div>
  )
}

// ── E2E TC Table ─────────────────────────────────────────────────────────────

export function E2ETCTable({ tcs, onChange }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editCell, setEditCell] = useState<{ rowId: string; field: 'title' | 'flow' | 'priority' } | null>(null)
  const [newRow, setNewRow] = useState({ title: '', flow: '', priority: 'Med' as TCPriority })

  function toggleExpand(id: string) {
    setExpanded(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function saveCell(rowId: string, field: string, value: string) {
    onChange(tcs.map(t => (t.id === rowId ? { ...t, [field]: value } : t)))
    setEditCell(null)
  }

  function renderCell(tc: E2ETC, field: 'title' | 'flow' | 'priority') {
    const isEditing = editCell?.rowId === tc.id && editCell?.field === field
    if (!isEditing) {
      return (
        <div className="cursor-text hover:bg-accent/5 rounded px-1 -mx-1 transition-colors" onClick={() => setEditCell({ rowId: tc.id, field })}>
          {field === 'priority' ? <PriorityBadge p={tc.priority} /> : (
            <span className="text-sm text-ink-700 line-clamp-2">{tc[field] || <span className="text-ink-300 italic">—</span>}</span>
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
      <input autoFocus defaultValue={tc[field] as string}
        className="w-full text-sm border border-accent rounded px-2 py-0.5 bg-white focus:outline-none"
        onBlur={e => saveCell(tc.id, field, e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') saveCell(tc.id, field, (e.target as HTMLInputElement).value)
          if (e.key === 'Escape') setEditCell(null)
        }} />
    )
  }

  function handleAdd() {
    if (!newRow.title.trim()) return
    const tc: E2ETC = {
      id: `TC-E2E-${String(tcs.length + 1).padStart(2, '0')}`,
      type: 'E2E',
      title: newRow.title,
      flow: newRow.flow,
      steps: [],
      priority: newRow.priority,
      status: 'Pending',
    }
    onChange([...tcs, tc])
    setNewRow({ title: '', flow: '', priority: 'Med' })
  }

  function deleteSelected() {
    onChange(tcs.filter(t => !selected.has(t.id)))
    setSelected(new Set())
  }

  const allSelected = tcs.length > 0 && tcs.every(t => selected.has(t.id))

  return (
    <div>
      {/* Toolbar */}
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
                <input type="checkbox" checked={allSelected} onChange={() => {
                  setSelected(allSelected ? new Set() : new Set(tcs.map(t => t.id)))
                }} className="rounded" />
              </th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-ink-500 uppercase tracking-wide w-28">ID</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-ink-500 uppercase tracking-wide">Title</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-ink-500 uppercase tracking-wide">Flow</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-ink-500 uppercase tracking-wide w-20">Priority</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-ink-500 uppercase tracking-wide w-16">Steps</th>
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
                  <td className="px-3 py-2 w-28">
                    <div className="flex items-center gap-1.5">
                      <span className="tc-id">{tc.id}</span>
                      {tc.aiGenerated && <AIBadge />}
                    </div>
                  </td>
                  <td className="px-3 py-2 min-w-[160px] max-w-[220px]">{renderCell(tc, 'title')}</td>
                  <td className="px-3 py-2 min-w-[160px] max-w-[250px]">{renderCell(tc, 'flow')}</td>
                  <td className="px-3 py-2 w-20">{renderCell(tc, 'priority')}</td>
                  <td className="px-3 py-2 w-16">
                    <span className="font-mono text-xs text-ink-500 bg-ink-100 px-1.5 py-0.5 rounded-full">
                      {tc.steps.length}
                    </span>
                  </td>
                  <td className="px-2 py-2 w-16">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => toggleExpand(tc.id)}
                        className={`p-1 rounded transition-colors ${expanded.has(tc.id) ? 'text-accent bg-accent/10' : 'text-ink-400 hover:bg-ink-100'}`}
                        title={expanded.has(tc.id) ? 'Collapse steps' : 'Edit steps'}>
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
                  <tr key={`${tc.id}-steps`}>
                    <td colSpan={7} className="p-0">
                      <StepBuilder tc={tc} onChange={updated => onChange(tcs.map(t => (t.id === tc.id ? updated : t)))} />
                    </td>
                  </tr>
                )}
              </>
            ))}

            {/* Add row */}
            <tr className="bg-ink-50/40 border-t-2 border-dashed border-ink-200">
              <td className="w-8 px-3 py-2" />
              <td className="px-3 py-2 w-28"><span className="font-mono text-xs text-ink-400">auto</span></td>
              <td className="px-3 py-2">
                <input value={newRow.title} onChange={e => setNewRow(r => ({ ...r, title: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                  placeholder="E2E flow title…"
                  className="w-full text-sm border border-ink-200 rounded px-2 py-0.5 bg-white focus:outline-none focus:border-accent placeholder:text-ink-300" />
              </td>
              <td className="px-3 py-2">
                <input value={newRow.flow} onChange={e => setNewRow(r => ({ ...r, flow: e.target.value }))}
                  placeholder="Flow description…"
                  className="w-full text-sm border border-ink-200 rounded px-2 py-0.5 bg-white focus:outline-none focus:border-accent placeholder:text-ink-300" />
              </td>
              <td className="px-3 py-2 w-20">
                <select value={newRow.priority} onChange={e => setNewRow(r => ({ ...r, priority: e.target.value as TCPriority }))}
                  className="text-xs border border-ink-200 rounded px-1 py-0.5 bg-white">
                  {PRIORITIES.map(p => <option key={p}>{p}</option>)}
                </select>
              </td>
              <td className="px-3 py-2 w-16" />
              <td className="px-2 py-2 w-16">
                <button onClick={handleAdd} disabled={!newRow.title.trim()}
                  className="btn-primary text-xs py-1 px-2 disabled:opacity-40">Add</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
