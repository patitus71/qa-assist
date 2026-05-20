// app/components/StandardTCTable.tsx
'use client'

import { useState, useEffect, type DragEvent } from 'react'
import type { StandardTC, TCPriority } from '@/lib/types'

interface Props {
  tcs: StandardTC[]
  onChange: (tcs: StandardTC[]) => void
}

type EditField = 'title' | 'steps' | 'expected' | 'priority' | 'positiveNegative' | 'testData' | 'prerequisite'
type EditCell = { rowId: string; field: EditField }

const PRIORITIES: TCPriority[] = ['High', 'Med', 'Low']

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
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M3 4h10M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M6 7v5M10 7v5M4 4l1 9h6l1-9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconDuplicate() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M3 11H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

function IconGrip() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-ink-300">
      <circle cx="4" cy="3" r="1" fill="currentColor" />
      <circle cx="8" cy="3" r="1" fill="currentColor" />
      <circle cx="4" cy="6" r="1" fill="currentColor" />
      <circle cx="8" cy="6" r="1" fill="currentColor" />
      <circle cx="4" cy="9" r="1" fill="currentColor" />
      <circle cx="8" cy="9" r="1" fill="currentColor" />
    </svg>
  )
}

export function StandardTCTable({ tcs, onChange }: Props) {
  const [editCell, setEditCell] = useState<EditCell | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [priorityFilter, setPriorityFilter] = useState<'All' | TCPriority>('All')
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [newRow, setNewRow] = useState({
    title: '', steps: '', expected: '', priority: 'Med' as TCPriority,
    testData: '', prerequisite: '', positiveNegative: 'Positive' as 'Positive' | 'Negative',
  })

  const isFiltering = !!search || priorityFilter !== 'All'
  const filtered = tcs.filter(tc => {
    const matchSearch = !search || tc.title.toLowerCase().includes(search.toLowerCase()) || tc.id.toLowerCase().includes(search.toLowerCase())
    const matchPriority = priorityFilter === 'All' || tc.priority === priorityFilter
    return matchSearch && matchPriority
  })

  // ── Inline edit ────────────────────────────────────────────────────────────

  function saveCell(rowId: string, field: string, value: string) {
    onChange(tcs.map(t => t.id === rowId ? { ...t, [field]: value } : t))
    setEditCell(null)
  }

  function renderCell(tc: StandardTC, field: EditField) {
    const isEditing = editCell?.rowId === tc.id && editCell?.field === field

    if (!isEditing) {
      return (
        <div
          className="min-h-[22px] cursor-text rounded px-1 -mx-1 hover:bg-accent/5 transition-colors"
          onClick={() => setEditCell({ rowId: tc.id, field })}
        >
          {field === 'priority' ? (
            <PriorityBadge p={tc.priority} />
          ) : field === 'positiveNegative' ? (
            <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap ${
              tc.positiveNegative === 'Negative'
                ? 'bg-red-50 text-red-700 border-red-200'
                : 'bg-green-50 text-green-700 border-green-200'
            }`}>
              {tc.positiveNegative ?? 'Positive'}
            </span>
          ) : (
            <span className="text-xs text-ink-700 line-clamp-2 whitespace-pre-wrap">
              {(tc[field as keyof StandardTC] as string) || <span className="text-ink-300 italic">—</span>}
            </span>
          )}
        </div>
      )
    }

    if (field === 'priority') {
      return (
        <select autoFocus value={tc.priority}
          onChange={e => saveCell(tc.id, 'priority', e.target.value)}
          onBlur={() => setEditCell(null)}
          className="text-xs border border-accent rounded px-1 py-0.5 bg-white focus:outline-none">
          {PRIORITIES.map(p => <option key={p}>{p}</option>)}
        </select>
      )
    }

    if (field === 'positiveNegative') {
      return (
        <select autoFocus value={tc.positiveNegative ?? 'Positive'}
          onChange={e => saveCell(tc.id, 'positiveNegative', e.target.value)}
          onBlur={() => setEditCell(null)}
          className="text-xs border border-accent rounded px-1 py-0.5 bg-white focus:outline-none">
          <option value="Positive">Positive</option>
          <option value="Negative">Negative</option>
        </select>
      )
    }

    const isMultiline = field === 'steps' || field === 'expected' || field === 'prerequisite'
    const val = (tc[field as keyof StandardTC] as string) ?? ''

    if (isMultiline) {
      return (
        <textarea autoFocus defaultValue={val} rows={3}
          className="w-full text-xs border border-accent rounded p-1.5 bg-white focus:outline-none resize-none font-sans"
          onBlur={e => saveCell(tc.id, field, e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') setEditCell(null) }} />
      )
    }

    return (
      <input autoFocus defaultValue={val}
        className="w-full text-xs border border-accent rounded px-2 py-0.5 bg-white focus:outline-none"
        onBlur={e => saveCell(tc.id, field, e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') saveCell(tc.id, field, (e.target as HTMLInputElement).value)
          if (e.key === 'Escape') setEditCell(null)
        }} />
    )
  }

  // ── Drag reorder ───────────────────────────────────────────────────────────

  function handleDragStart(e: DragEvent<HTMLTableRowElement>, idx: number) {
    e.dataTransfer.setData('text/plain', String(idx))
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e: DragEvent<HTMLTableRowElement>, idx: number) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIdx(idx)
  }

  function handleDrop(e: DragEvent<HTMLTableRowElement>, targetIdx: number) {
    e.preventDefault()
    const srcIdx = parseInt(e.dataTransfer.getData('text/plain'))
    if (isNaN(srcIdx) || srcIdx === targetIdx) { setDragOverIdx(null); return }
    const next = [...tcs]
    const [moved] = next.splice(srcIdx, 1)
    next.splice(targetIdx, 0, moved)
    onChange(next)
    setDragOverIdx(null)
  }

  // ── Add row ────────────────────────────────────────────────────────────────

  function handleAdd() {
    if (!newRow.title.trim()) return
    const next: StandardTC = {
      id: `TC-${String(tcs.length + 1).padStart(2, '0')}`,
      type: 'Standard',
      title: newRow.title,
      steps: newRow.steps,
      expected: newRow.expected,
      priority: newRow.priority,
      testData: newRow.testData,
      prerequisite: newRow.prerequisite,
      positiveNegative: newRow.positiveNegative,
      source: 'manual',
      status: 'Pending',
    }
    onChange([...tcs, next])
    setNewRow({ title: '', steps: '', expected: '', priority: 'Med', testData: '', prerequisite: '', positiveNegative: 'Positive' })
  }

  // ── Bulk select ────────────────────────────────────────────────────────────

  const allFilteredSelected = filtered.length > 0 && filtered.every(tc => selected.has(tc.id))

  function toggleAll() {
    if (allFilteredSelected) {
      const filteredIds = new Set(filtered.map(t => t.id))
      setSelected(new Set(Array.from(selected).filter(id => !filteredIds.has(id))))
    } else {
      const next = new Set(Array.from(selected))
      filtered.forEach(t => next.add(t.id))
      setSelected(next)
    }
  }

  function deleteSelected() {
    onChange(tcs.filter(t => !selected.has(t.id)))
    setSelected(new Set())
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  function duplicateTC(tc: StandardTC) {
    const copy: StandardTC = {
      ...tc,
      id: `${tc.id}-copy`,
      title: `Copy of ${tc.title}`,
      status: 'Pending',
      bugTicket: undefined,
      actualResult: undefined,
      runDate: undefined,
      evidenceFiles: undefined,
    }
    const idx = tcs.findIndex(t => t.id === tc.id)
    const next = [...tcs]
    next.splice(idx + 1, 0, copy)
    onChange(next)
    setEditCell({ rowId: copy.id, field: 'title' })
    showToast('TC duplicated — rename in the highlighted field')
  }

  function duplicateSelected() {
    const list = tcs.filter(t => selected.has(t.id))
    if (list.length === 0) return
    const lastIdx = Math.max(...list.map(t => tcs.findIndex(x => x.id === t.id)))
    const copies: StandardTC[] = list.map(tc => ({
      ...tc,
      id: `${tc.id}-copy`,
      title: `Copy of ${tc.title}`,
      status: 'Pending',
      bugTicket: undefined,
      actualResult: undefined,
      runDate: undefined,
      evidenceFiles: undefined,
    }))
    const next = [...tcs]
    next.splice(lastIdx + 1, 0, ...copies)
    onChange(next)
    setSelected(new Set())
    showToast(`${copies.length} TC${copies.length !== 1 ? 's' : ''} duplicated`)
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!((e.ctrlKey || e.metaKey) && e.key === 'd') || selected.size === 0) return
      e.preventDefault()
      duplicateSelected()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, tcs])

  const inputCls = 'w-full text-xs border border-ink-200 rounded px-2 py-0.5 bg-white focus:outline-none focus:border-accent placeholder:text-ink-300'

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-ink-900 text-white text-sm px-4 py-2.5 rounded-lg shadow-xl flex items-center gap-2 pointer-events-none">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-success shrink-0"><path d="M3 8l4 4 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          {toast}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-3">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by ID or title…"
          className="flex-1 text-sm border border-ink-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20" />
        <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value as typeof priorityFilter)}
          className="text-sm border border-ink-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-accent">
          <option>All</option>
          {PRIORITIES.map(p => <option key={p}>{p}</option>)}
        </select>
        {selected.size > 0 && (
          <>
            <button onClick={duplicateSelected}
              className="btn-ghost text-xs text-accent border-accent/30 hover:bg-accent/5 whitespace-nowrap flex items-center gap-1.5">
              <IconDuplicate />
              Duplicate {selected.size} selected
            </button>
            <button onClick={deleteSelected}
              className="btn-ghost text-xs text-danger border-danger hover:bg-red-50 whitespace-nowrap">
              Delete {selected.size} selected
            </button>
          </>
        )}
        <span className="text-xs text-ink-400 font-mono whitespace-nowrap">{filtered.length}/{tcs.length} TC</span>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 border-b border-ink-100">
              <tr>
                <th className="w-8 px-3 py-2.5">
                  <input type="checkbox" checked={allFilteredSelected} onChange={toggleAll} className="rounded" />
                </th>
                <th className="w-4 px-1" />
                <th className="px-3 py-2.5 text-left text-xs font-medium text-ink-500 uppercase tracking-wide w-24">ID</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-ink-500 uppercase tracking-wide min-w-[160px]">Title</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-ink-500 uppercase tracking-wide min-w-[160px]">Steps</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-ink-500 uppercase tracking-wide min-w-[140px]">Expected</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-ink-500 uppercase tracking-wide w-20">Priority</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-ink-500 uppercase tracking-wide w-20">Pos/Neg</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-ink-500 uppercase tracking-wide min-w-[120px]">Test Data</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-ink-500 uppercase tracking-wide min-w-[120px]">Prerequisite</th>
                <th className="w-16" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50">
              {filtered.map((tc, i) => (
                <tr key={tc.id}
                  className={`group transition-colors ${dragOverIdx === i ? 'border-t-2 border-accent bg-accent/5' : 'hover:bg-ink-50/60'}`}
                  draggable={!isFiltering}
                  onDragStart={e => handleDragStart(e, tcs.indexOf(tc))}
                  onDragEnd={() => setDragOverIdx(null)}
                  onDragOver={e => handleDragOver(e, i)}
                  onDrop={e => handleDrop(e, tcs.indexOf(tc))}
                >
                  <td className="w-8 px-3 py-2">
                    <input type="checkbox" checked={selected.has(tc.id)}
                      onChange={() => { const n = new Set(selected); n.has(tc.id) ? n.delete(tc.id) : n.add(tc.id); setSelected(n) }}
                      className="rounded" />
                  </td>
                  <td className="w-4 px-1 py-2 cursor-grab">{!isFiltering && <IconGrip />}</td>
                  <td className="px-3 py-2 w-24">
                    <div className="flex items-center gap-1.5">
                      <span className="tc-id">{tc.id}</span>
                      {tc.aiGenerated && <AIBadge />}
                    </div>
                  </td>
                  <td className="px-3 py-2 min-w-[160px] max-w-[200px]">{renderCell(tc, 'title')}</td>
                  <td className="px-3 py-2 min-w-[160px] max-w-[220px]">{renderCell(tc, 'steps')}</td>
                  <td className="px-3 py-2 min-w-[140px] max-w-[200px]">{renderCell(tc, 'expected')}</td>
                  <td className="px-3 py-2 w-20">{renderCell(tc, 'priority')}</td>
                  <td className="px-3 py-2 w-20">{renderCell(tc, 'positiveNegative')}</td>
                  <td className="px-3 py-2 min-w-[120px] max-w-[180px]">{renderCell(tc, 'testData')}</td>
                  <td className="px-3 py-2 min-w-[120px] max-w-[180px]">{renderCell(tc, 'prerequisite')}</td>
                  <td className="px-2 py-2 w-16 text-right">
                    <div className="flex items-center gap-0.5 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => duplicateTC(tc)}
                        className="text-ink-400 hover:text-accent hover:bg-accent/10 rounded p-1 transition-colors" title="Duplicate (Ctrl+D)">
                        <IconDuplicate />
                      </button>
                      <button onClick={() => { onChange(tcs.filter(t => t.id !== tc.id)); setSelected(s => { const n = new Set(s); n.delete(tc.id); return n }) }}
                        className="text-danger hover:bg-red-50 rounded p-1 transition-colors" title="Delete">
                        <IconTrash />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {/* Add row */}
              <tr className="bg-ink-50/40 border-t-2 border-dashed border-ink-200">
                <td className="w-8 px-3 py-2" />
                <td className="w-4 px-1" />
                <td className="px-3 py-2 w-24"><span className="font-mono text-xs text-ink-400">auto</span></td>
                <td className="px-3 py-2 min-w-[160px]">
                  <input value={newRow.title} onChange={e => setNewRow(r => ({ ...r, title: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && handleAdd()}
                    placeholder="Add test case title…" className={inputCls} />
                </td>
                <td className="px-3 py-2 min-w-[160px]">
                  <input value={newRow.steps} onChange={e => setNewRow(r => ({ ...r, steps: e.target.value }))}
                    placeholder="Steps…" className={inputCls} />
                </td>
                <td className="px-3 py-2 min-w-[140px]">
                  <input value={newRow.expected} onChange={e => setNewRow(r => ({ ...r, expected: e.target.value }))}
                    placeholder="Expected…" className={inputCls} />
                </td>
                <td className="px-3 py-2 w-20">
                  <select value={newRow.priority} onChange={e => setNewRow(r => ({ ...r, priority: e.target.value as TCPriority }))}
                    className="text-xs border border-ink-200 rounded px-1 py-0.5 bg-white focus:outline-none">
                    {PRIORITIES.map(p => <option key={p}>{p}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2 w-20">
                  <select value={newRow.positiveNegative} onChange={e => setNewRow(r => ({ ...r, positiveNegative: e.target.value as 'Positive' | 'Negative' }))}
                    className="text-xs border border-ink-200 rounded px-1 py-0.5 bg-white focus:outline-none">
                    <option value="Positive">Positive</option>
                    <option value="Negative">Negative</option>
                  </select>
                </td>
                <td className="px-3 py-2 min-w-[120px]">
                  <input value={newRow.testData} onChange={e => setNewRow(r => ({ ...r, testData: e.target.value }))}
                    placeholder="Test data…" className={inputCls} />
                </td>
                <td className="px-3 py-2 min-w-[120px]">
                  <input value={newRow.prerequisite} onChange={e => setNewRow(r => ({ ...r, prerequisite: e.target.value }))}
                    placeholder="Prerequisite…" className={inputCls} />
                </td>
                <td className="px-2 py-2 w-10">
                  <button onClick={handleAdd} disabled={!newRow.title.trim()}
                    className="btn-primary text-xs py-1 px-2 disabled:opacity-40">Add</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
