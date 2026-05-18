// app/components/TCMColumnEditor.tsx
'use client'

import { useState, type DragEvent } from 'react'
import type { TC } from '@/lib/types'
import { exportTCMXlsx } from '@/lib/export-xlsx'

interface Group {
  id: string
  name: string
  values: string[]
}

interface Props {
  tcs: TC[]
  filename?: string
  onClose: () => void
}

const FIXED_COLS = [
  'NO', 'Scenario',
  'Positive/Negative', 'Priority', 'Expect result',
  'Status', 'Actual Result', 'Bug ID', 'Run Date',
]

const DEFAULT_GROUPS: Group[] = [
  { id: '1', name: 'isProductBundle', values: ['TRUE', 'FALSE'] },
  { id: '2', name: 'Flow', values: ['Short form', 'Full form'] },
]

function GripIcon() {
  return (
    <svg width="10" height="14" viewBox="0 0 10 14" fill="none" className="text-ink-300 shrink-0">
      <circle cx="3" cy="2.5" r="1.2" fill="currentColor" />
      <circle cx="7" cy="2.5" r="1.2" fill="currentColor" />
      <circle cx="3" cy="7" r="1.2" fill="currentColor" />
      <circle cx="7" cy="7" r="1.2" fill="currentColor" />
      <circle cx="3" cy="11.5" r="1.2" fill="currentColor" />
      <circle cx="7" cy="11.5" r="1.2" fill="currentColor" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M3 4h10M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M6 7v5M10 7v5M4 4l1 9h6l1-9"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function TCMColumnEditor({ tcs, filename = 'qa-assist-tcm.xlsx', onClose }: Props) {
  const [groups, setGroups] = useState<Group[]>(DEFAULT_GROUPS)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const [newValueInputs, setNewValueInputs] = useState<Record<string, string>>({})
  const [editingName, setEditingName] = useState<string | null>(null)

  // ── Group CRUD ──────────────────────────────────────────────────────────────

  function addGroup() {
    const id = Date.now().toString()
    setGroups(g => [...g, { id, name: 'New Group', values: [] }])
    setEditingName(id)
  }

  function removeGroup(id: string) {
    setGroups(g => g.filter(gr => gr.id !== id))
  }

  function updateName(id: string, name: string) {
    setGroups(g => g.map(gr => gr.id === id ? { ...gr, name } : gr))
  }

  function addValue(id: string) {
    const val = newValueInputs[id]?.trim()
    if (!val) return
    setGroups(g => g.map(gr => gr.id === id ? { ...gr, values: [...gr.values, val] } : gr))
    setNewValueInputs(v => ({ ...v, [id]: '' }))
  }

  function removeValue(groupId: string, vi: number) {
    setGroups(g => g.map(gr => gr.id === groupId ? { ...gr, values: gr.values.filter((_, i) => i !== vi) } : gr))
  }

  // ── Drag reorder ─────────────────────────────────────────────────────────────

  function onDragStart(e: DragEvent<HTMLDivElement>, idx: number) {
    e.dataTransfer.setData('text/plain', String(idx))
    e.dataTransfer.effectAllowed = 'move'
  }

  function onDragOver(e: DragEvent<HTMLDivElement>, idx: number) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIdx(idx)
  }

  function onDrop(e: DragEvent<HTMLDivElement>, targetIdx: number) {
    e.preventDefault()
    const src = parseInt(e.dataTransfer.getData('text/plain'))
    if (isNaN(src) || src === targetIdx) { setDragOverIdx(null); return }
    const next = [...groups]
    const [moved] = next.splice(src, 1)
    next.splice(targetIdx, 0, moved)
    setGroups(next)
    setDragOverIdx(null)
  }

  // ── Export ────────────────────────────────────────────────────────────────────

  function handleExport() {
    exportTCMXlsx(tcs, filename, groups)
    onClose()
  }

  const totalCondCols = groups.reduce((s, g) => s + g.values.length, 0)

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white dark:bg-ink-800 rounded-card shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
          <div>
            <h2 className="text-sm font-semibold text-ink-900">TCM Column Editor</h2>
            <p className="text-xs text-ink-500 mt-0.5">
              Define condition groups · drag to reorder · values become sub-columns
            </p>
          </div>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-700 p-1 rounded transition-colors">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">

          {groups.length === 0 && (
            <div className="card p-8 border-dashed text-center text-ink-400">
              <p className="text-sm">No groups yet — click "Add group" to start building your matrix.</p>
            </div>
          )}

          {groups.map((group, idx) => (
            <div
              key={group.id}
              draggable
              onDragStart={e => onDragStart(e, idx)}
              onDragEnd={() => setDragOverIdx(null)}
              onDragOver={e => onDragOver(e, idx)}
              onDrop={e => onDrop(e, idx)}
              className={`card p-3 transition-all cursor-default ${
                dragOverIdx === idx ? 'ring-2 ring-accent border-accent' : ''
              }`}
            >
              {/* Group header row */}
              <div className="flex items-center gap-2 mb-2.5">
                <span className="cursor-grab active:cursor-grabbing"><GripIcon /></span>

                {/* Group name — inline edit */}
                {editingName === group.id ? (
                  <input
                    autoFocus
                    value={group.name}
                    onChange={e => updateName(group.id, e.target.value)}
                    onBlur={() => setEditingName(null)}
                    onKeyDown={e => e.key === 'Enter' && setEditingName(null)}
                    className="flex-1 text-sm font-medium border-b border-accent focus:outline-none bg-transparent text-ink-900"
                  />
                ) : (
                  <span
                    className="flex-1 text-sm font-medium text-ink-900 cursor-text hover:text-accent transition-colors"
                    onClick={() => setEditingName(group.id)}
                    title="Click to edit name"
                  >
                    {group.name}
                  </span>
                )}

                <span className="font-mono text-[10px] text-ink-400 shrink-0">
                  {group.values.length} col{group.values.length !== 1 ? 's' : ''}
                </span>

                <button
                  onClick={() => removeGroup(group.id)}
                  className="text-ink-300 hover:text-danger transition-colors shrink-0"
                  title="Remove group"
                >
                  <TrashIcon />
                </button>
              </div>

              {/* Value chips */}
              <div className="flex flex-wrap gap-1.5">
                {group.values.map((val, vi) => (
                  <span
                    key={vi}
                    className="inline-flex items-center gap-1 font-mono text-[11px] bg-accent/10 text-accent border border-accent/20 px-2 py-0.5 rounded-full"
                  >
                    {val}
                    <button
                      onClick={() => removeValue(group.id, vi)}
                      className="hover:text-danger leading-none ml-0.5"
                      title="Remove value"
                    >
                      ×
                    </button>
                  </span>
                ))}

                {/* Add value inline input */}
                <input
                  value={newValueInputs[group.id] ?? ''}
                  onChange={e => setNewValueInputs(v => ({ ...v, [group.id]: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && addValue(group.id)}
                  placeholder="+ add value"
                  className="font-mono text-[11px] border border-dashed border-ink-300 rounded-full px-2.5 py-0.5 bg-transparent focus:outline-none focus:border-accent text-ink-500 w-24"
                />
              </div>
            </div>
          ))}

          <button onClick={addGroup} className="btn-ghost w-full text-sm">
            + Add group
          </button>

          {/* Fixed columns preview */}
          <div className="pt-1 border-t border-ink-100">
            <p className="text-[10px] font-medium text-ink-500 uppercase tracking-wide mb-2">
              Fixed columns — always included
            </p>
            <div className="flex flex-wrap gap-1.5">
              {FIXED_COLS.map(col => (
                <span key={col} className="font-mono text-[10px] bg-ink-50 text-ink-500 border border-ink-200 px-2 py-0.5 rounded">
                  {col}
                </span>
              ))}
            </div>
          </div>

          {/* Matrix preview */}
          {groups.length > 0 && (
            <div className="pt-1 border-t border-ink-100">
              <p className="text-[10px] font-medium text-ink-500 uppercase tracking-wide mb-2">
                Matrix structure preview
              </p>
              <div className="overflow-x-auto">
                <table className="text-[10px] font-mono border-collapse">
                  <thead>
                    <tr>
                      <th className="px-2 py-1 bg-ink-700 text-white border border-ink-600 whitespace-nowrap">NO</th>
                      <th className="px-2 py-1 bg-ink-700 text-white border border-ink-600 whitespace-nowrap">Scenario</th>
                      {groups.map(gr => gr.values.length > 0 && (
                        <th key={gr.id}
                          className="px-2 py-1 bg-blue-700 text-white border border-blue-600 whitespace-nowrap"
                          colSpan={gr.values.length}
                        >
                          {gr.name}
                        </th>
                      ))}
                      <th className="px-2 py-1 bg-ink-500 text-white border border-ink-400 whitespace-nowrap" colSpan={5}>
                        Fixed cols…
                      </th>
                    </tr>
                    <tr>
                      <td className="px-2 py-1 bg-ink-50 border border-ink-200" />
                      <td className="px-2 py-1 bg-ink-50 border border-ink-200" />
                      {groups.flatMap(gr => gr.values.map((val, vi) => (
                        <td key={`${gr.id}-${vi}`} className="px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap">
                          {val}
                        </td>
                      )))}
                      {['Pos/Neg', 'Priority', 'Status', 'Actual', 'Bug'].map(h => (
                        <td key={h} className="px-2 py-1 bg-ink-50 text-ink-500 border border-ink-200">{h}</td>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tcs.slice(0, 3).map((tc, i) => (
                      <tr key={tc.id} className={i % 2 === 0 ? 'bg-white' : 'bg-ink-50/50'}>
                        <td className="px-2 py-1 border border-ink-100 text-center">{i + 1}</td>
                        <td className="px-2 py-1 border border-ink-100 max-w-[120px] truncate">
                          {tc.type === 'Standard' ? tc.title : tc.type === 'E2E' ? tc.title : `${tc.method} ${tc.endpoint}`}
                        </td>
                        {groups.flatMap(gr => gr.values.map((_, vi) => (
                          <td key={`${tc.id}-${gr.id}-${vi}`} className="px-2 py-1 border border-ink-100 text-center text-ink-300">—</td>
                        )))}
                        {['', tc.priority, tc.status, '', ''].map((v, ci) => (
                          <td key={ci} className="px-2 py-1 border border-ink-100 text-center">{v}</td>
                        ))}
                      </tr>
                    ))}
                    {tcs.length > 3 && (
                      <tr>
                        <td colSpan={2 + totalCondCols + 5} className="px-2 py-1 text-ink-400 text-center border border-ink-100">
                          +{tcs.length - 3} more rows…
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-ink-100 flex items-center justify-between">
          <p className="text-xs text-ink-500 font-mono">
            {tcs.length} TC · {totalCondCols} condition col{totalCondCols !== 1 ? 's' : ''}
          </p>
          <div className="flex gap-3">
            <button onClick={onClose} className="btn-ghost text-sm">Cancel</button>
            <button onClick={handleExport} className="btn-primary text-sm">
              Export TCM .xlsx
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
