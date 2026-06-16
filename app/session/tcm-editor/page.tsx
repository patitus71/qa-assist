// app/session/tcm-editor/page.tsx
'use client'

import React, { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/lib/session-context'
import { downloadTCMXlsx } from '@/lib/tcm-exporter'
import type { TCMGroup, TCMRow, TCPriority, StandardTC, E2ETC, APITC } from '@/lib/types'

// ── Icons ─────────────────────────────────────────────────────────────────────

function IconSpinner() {
  return (
    <svg className="animate-spin" width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeOpacity="0.3" />
      <path d="M8 2a6 6 0 0 1 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function IconUp() {
  return <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 8l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
}
function IconDown() {
  return <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
}
function IconTrash() {
  return <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 3h8M5 3V2h2v1M4 3v7h4V3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
}
function IconPlus() {
  return <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 2v9M2 6.5h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
}
function IconEdit() {
  return <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 10.5L3.5 10l5.5-5.5-1.5-1.5L2 8.5v2zM8.5 2l1.5 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
}
function IconChevron({ open }: { open: boolean }) {
  return <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }}><path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
}
function IconDownload() {
  return <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 2v7M3.5 7l3 3 3-3M2 11h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PRIORITIES: TCPriority[] = ['High', 'Med', 'Low']

function nextPriority(p: TCPriority): TCPriority {
  const idx = PRIORITIES.indexOf(p)
  return PRIORITIES[(idx + 1) % PRIORITIES.length]
}

function priorityColor(p: TCPriority) {
  return p === 'High' ? 'bg-red-100 text-red-700' : p === 'Med' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
}

function normalizeChecks(
  checks: Record<string, Record<string, boolean>>,
  groups: TCMGroup[]
): Record<string, Record<string, boolean>> {
  const result: Record<string, Record<string, boolean>> = {}
  for (const g of groups) {
    result[g.name] = {}
    for (const v of g.values) {
      result[g.name][v] = checks[g.name]?.[v] ?? false
    }
  }
  return result
}

let rowCounter = 0
function newRowId() { return `TCM-user-${++rowCounter}` }

// ── Edit Groups Modal ─────────────────────────────────────────────────────────

interface EditGroupsModalProps {
  groups: TCMGroup[]
  onSave: (groups: TCMGroup[]) => void
  onClose: () => void
}

function EditGroupsModal({ groups: initialGroups, onSave, onClose }: EditGroupsModalProps) {
  const [groups, setGroups] = useState<TCMGroup[]>(initialGroups.map(g => ({ ...g, values: [...g.values] })))
  const [newGroupName, setNewGroupName] = useState('')
  const [newValueInputs, setNewValueInputs] = useState<Record<string, string>>({})

  function addGroup() {
    const name = newGroupName.trim()
    if (!name) return
    setGroups(prev => [...prev, { id: `g-new-${Date.now()}`, name, values: [] }])
    setNewGroupName('')
  }

  function deleteGroup(id: string) {
    setGroups(prev => prev.filter(g => g.id !== id))
  }

  function renameGroup(id: string, name: string) {
    setGroups(prev => prev.map(g => g.id === id ? { ...g, name } : g))
  }

  function addValue(groupId: string) {
    const val = (newValueInputs[groupId] ?? '').trim()
    if (!val) return
    setGroups(prev => prev.map(g =>
      g.id === groupId && !g.values.includes(val)
        ? { ...g, values: [...g.values, val] }
        : g
    ))
    setNewValueInputs(prev => ({ ...prev, [groupId]: '' }))
  }

  function deleteValue(groupId: string, value: string) {
    setGroups(prev => prev.map(g =>
      g.id === groupId ? { ...g, values: g.values.filter(v => v !== value) } : g
    ))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
          <h2 className="text-sm font-semibold text-ink-900">Edit Groups</h2>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-700 transition-colors text-lg leading-none">×</button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {groups.map(group => (
            <div key={group.id} className="border border-ink-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <input
                  value={group.name}
                  onChange={e => renameGroup(group.id, e.target.value)}
                  className="flex-1 text-sm font-medium border border-ink-200 rounded px-2 py-1 focus:outline-none focus:border-accent"
                  placeholder="Group name"
                />
                <button
                  onClick={() => deleteGroup(group.id)}
                  className="text-xs text-danger hover:bg-red-50 rounded px-2 py-1 transition-colors"
                >
                  Delete
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {group.values.map(v => (
                  <span key={v} className="inline-flex items-center gap-1 font-mono text-xs bg-ink-100 text-ink-600 px-2 py-0.5 rounded-full">
                    {v}
                    <button onClick={() => deleteValue(group.id, v)} className="text-ink-400 hover:text-danger leading-none">×</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-1.5">
                <input
                  value={newValueInputs[group.id] ?? ''}
                  onChange={e => setNewValueInputs(prev => ({ ...prev, [group.id]: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && addValue(group.id)}
                  placeholder="Add value…"
                  className="flex-1 font-mono text-xs border border-ink-200 rounded px-2 py-1 focus:outline-none focus:border-accent"
                />
                <button
                  onClick={() => addValue(group.id)}
                  className="text-xs btn-ghost py-1 px-2"
                >
                  Add
                </button>
              </div>
            </div>
          ))}

          {/* Add group */}
          <div className="border border-dashed border-ink-200 rounded-lg p-3 flex gap-2">
            <input
              value={newGroupName}
              onChange={e => setNewGroupName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addGroup()}
              placeholder="New group name…"
              className="flex-1 text-sm border border-ink-200 rounded px-2 py-1 focus:outline-none focus:border-accent"
            />
            <button onClick={addGroup} className="btn-ghost text-xs py-1 flex items-center gap-1">
              <IconPlus /> Add Group
            </button>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-ink-100 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost text-sm">Cancel</button>
          <button onClick={() => onSave(groups)} className="btn-primary text-sm">Save Groups</button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TCMEditorPage() {
  const router = useRouter()
  const session = useSession()
  const tcm = session.tcm

  const [groups, setGroups] = useState<TCMGroup[]>(tcm?.groups ?? [])
  const [rows, setRows] = useState<TCMRow[]>(tcm?.rows ?? [])
  const [editingGroupsModal, setEditingGroupsModal] = useState(false)
  const [editingCell, setEditingCell] = useState<string | null>(null) // rowId currently editing scenario
  const [editScenarioVal, setEditScenarioVal] = useState('')
  const scenarioInputRef = useRef<HTMLInputElement>(null)

  const [converting, setConverting] = useState(false)
  const [convertError, setConvertError] = useState('')
  const [toast, setToast] = useState('')
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [generatingMissing, setGeneratingMissing] = useState(false)
  const [generateMissingError, setGenerateMissingError] = useState('')
  const [generateReq, setGenerateReq] = useState(() => session.requirement || '')
  const [showReqInput, setShowReqInput] = useState(false)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const importMeta = tcm?.importMeta
  const type = tcm?.type ?? 'standard'
  const hasNewRows = rows.some(r => r.isNew)
  const activeRows = rows.filter(r => !r.rejected)
  const newRows = rows.filter(r => r.isNew)
  const acceptedNew = newRows.filter(r => !r.rejected)
  const rejectedNew = newRows.filter(r => r.rejected)

  function showToast(msg: string) {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 3000)
  }

  // ── Row mutations ──────────────────────────────────────────────────────────

  const toggleCheck = useCallback((rowId: string, groupName: string, value: string) => {
    setRows(prev => prev.map(r =>
      r.id === rowId
        ? { ...r, checks: { ...r.checks, [groupName]: { ...r.checks[groupName], [value]: !r.checks[groupName]?.[value] } } }
        : r
    ))
  }, [])

  const togglePosNeg = useCallback((rowId: string) => {
    setRows(prev => prev.map(r =>
      r.id === rowId ? { ...r, posNeg: r.posNeg === 'Positive' ? 'Negative' : 'Positive' } : r
    ))
  }, [])

  const cyclePriority = useCallback((rowId: string) => {
    setRows(prev => prev.map(r =>
      r.id === rowId ? { ...r, priority: nextPriority(r.priority) } : r
    ))
  }, [])

  function startEditScenario(row: TCMRow) {
    setEditingCell(row.id)
    setEditScenarioVal(row.scenario)
    setTimeout(() => scenarioInputRef.current?.focus(), 0)
  }

  function saveEditScenario(rowId: string) {
    setRows(prev => prev.map(r => r.id === rowId ? { ...r, scenario: editScenarioVal } : r))
    setEditingCell(null)
  }

  function addRow() {
    const id = newRowId()
    const checks = normalizeChecks({}, groups)
    const newRow: TCMRow = { id, scenario: 'New scenario', checks, posNeg: 'Positive', priority: 'Med' }
    setRows(prev => [...prev, newRow])
    setEditingCell(id)
    setEditScenarioVal('New scenario')
    setTimeout(() => scenarioInputRef.current?.focus(), 0)
  }

  function deleteRow(rowId: string) {
    setRows(prev => prev.filter(r => r.id !== rowId))
  }

  function moveRowUp(rowId: string) {
    setRows(prev => {
      const idx = prev.findIndex(r => r.id === rowId)
      if (idx <= 0) return prev
      const next = [...prev]
      ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
      return next
    })
  }

  function moveRowDown(rowId: string) {
    setRows(prev => {
      const idx = prev.findIndex(r => r.id === rowId)
      if (idx < 0 || idx >= prev.length - 1) return prev
      const next = [...prev]
      ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
      return next
    })
  }

  function acceptRow(rowId: string) {
    setRows(prev => prev.map(r => r.id === rowId ? { ...r, rejected: false } : r))
  }

  function rejectRow(rowId: string) {
    setRows(prev => prev.map(r => r.id === rowId ? { ...r, rejected: true } : r))
  }

  function acceptAllNew() {
    setRows(prev => prev.map(r => r.isNew ? { ...r, rejected: false } : r))
  }

  function rejectAllNew() {
    setRows(prev => prev.map(r => r.isNew ? { ...r, rejected: true } : r))
  }

  function acceptHighPriorityOnly() {
    setRows(prev => prev.map(r => {
      if (!r.isNew) return r
      return r.priority === 'High' ? { ...r, rejected: false } : { ...r, rejected: true }
    }))
  }

  function toggleExpand(rowId: string) {
    setExpandedRows(prev => {
      const next = new Set(prev)
      next.has(rowId) ? next.delete(rowId) : next.add(rowId)
      return next
    })
  }

  // ── Group editing ──────────────────────────────────────────────────────────

  function handleSaveGroups(newGroups: TCMGroup[]) {
    // Map old group names → new group names for rows that still have a matching group
    const oldIdToNewName: Record<string, string> = {}
    for (const ng of newGroups) {
      const old = groups.find(g => g.id === ng.id)
      if (old) oldIdToNewName[old.name] = ng.name
    }

    const updatedRows = rows.map(row => {
      const newChecks: Record<string, Record<string, boolean>> = {}
      for (const ng of newGroups) {
        const oldName = groups.find(g => g.id === ng.id)?.name ?? ng.name
        newChecks[ng.name] = {}
        for (const v of ng.values) {
          newChecks[ng.name][v] = row.checks[oldName]?.[v] ?? false
        }
      }
      return { ...row, checks: newChecks }
    })

    setGroups(newGroups)
    setRows(updatedRows)
    setEditingGroupsModal(false)
    session.setTcm({ groups: newGroups, rows: updatedRows, type, ...(importMeta ? { importMeta } : {}) })
  }

  // ── Convert to TCs ─────────────────────────────────────────────────────────

  async function convertToTCs() {
    const toConvert = activeRows
    if (toConvert.length === 0) return

    setConverting(true)
    setConvertError('')

    session.setTcm({ groups, rows, type, ...(importMeta ? { importMeta } : {}) })

    try {
      const res = await fetch('/api/convert-tcm-to-tc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requirement: session.requirement,
          type,
          groups: groups.map(g => ({ id: g.id, name: g.name, values: g.values })),
          tcmRows: toConvert.map(r => ({
            id: r.id,
            scenario: r.scenario,
            checks: r.checks,
            posNeg: r.posNeg,
            priority: r.priority,
          })),
        }),
      })

      const data = await res.json() as {
        standard?: StandardTC[]
        e2e?: E2ETC[]
        api?: APITC[]
        error?: string
      }

      if (!res.ok) {
        setConvertError(data.error ?? 'Conversion failed')
        return
      }

      if (type === 'standard' && data.standard?.length) {
        session.setStandardTCs([...session.standardTCs, ...data.standard])
        showToast(`${data.standard.length} Standard TCs added`)
        setTimeout(() => router.push('/session/standard'), 600)
      } else if (type === 'e2e' && data.e2e?.length) {
        session.setE2eTCs([...session.e2eTCs, ...data.e2e])
        showToast(`${data.e2e.length} E2E TCs added`)
        setTimeout(() => router.push('/session/e2e'), 600)
      } else if (type === 'api' && data.api?.length) {
        session.setApiTCs([...session.apiTCs, ...data.api])
        showToast(`${data.api.length} API TCs added`)
        setTimeout(() => router.push('/session/api'), 600)
      } else {
        setConvertError('No test cases returned — try again')
      }
    } catch {
      setConvertError('Network error — check connection')
    } finally {
      setConverting(false)
    }
  }

  // ── Generate missing TCs ──────────────────────────────────────────────────

  async function generateMissingTCs() {
    const reqText = generateReq.trim()
    if (!reqText) { setShowReqInput(true); return }

    setGeneratingMissing(true)
    setGenerateMissingError('')
    setShowReqInput(false)

    const existingTCs = rows
      .filter(r => !r.sectionLabel)
      .map(r => ({
        title: r.scenario,
        combinations: Object.fromEntries(
          Object.entries(r.checks).map(([g, vals]) => [
            g,
            Object.entries(vals).filter(([, checked]) => checked).map(([v]) => v),
          ])
        ),
      }))

    try {
      const res = await fetch('/api/generate-from-tcm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requirement: reqText,
          tcm: {
            groups: groups.map(g => ({ name: g.name, values: g.values })),
            existingTCs,
          },
        }),
      })
      const data = await res.json() as { rows?: TCMRow[]; error?: string }
      if (!res.ok) { setGenerateMissingError(data.error ?? 'Generation failed'); return }

      const newRows: TCMRow[] = (data.rows ?? []).map(r => ({ ...r, isNew: true }))
      if (newRows.length === 0) { setGenerateMissingError('No missing scenarios found'); return }

      const merged = [...rows, ...newRows]
      setRows(merged)
      session.setTcm({ groups, rows: merged, type, ...(importMeta ? { importMeta } : {}) })
      showToast(`${newRows.length} missing scenario${newRows.length > 1 ? 's' : ''} suggested`)
    } catch {
      setGenerateMissingError('Network error — check connection')
    } finally {
      setGeneratingMissing(false)
    }
  }

  // ── Empty state ────────────────────────────────────────────────────────────

  if (!tcm) {
    return (
      <div className="p-3 md:p-4 lg:p-8 w-full">
        <div className="card p-10 text-center border-dashed">
          <p className="text-ink-500 mb-3">No TCM in session yet.</p>
          <a href="/session/generate" className="btn-primary text-sm">
            ← Generate TCM first
          </a>
        </div>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const typeBadge = { standard: 'Standard', e2e: 'E2E', api: 'API' }[type]
  const typeBadgeColor = { standard: 'bg-accent/10 text-accent', e2e: 'bg-purple-100 text-purple-700', api: 'bg-green-100 text-green-700' }[type]

  return (
    <div className="p-3 md:p-4 lg:p-8 w-full">

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-ink-900 text-white text-sm px-4 py-2.5 rounded-full shadow-lg pointer-events-none">
          {toast}
        </div>
      )}

      {/* Import metadata banner */}
      {importMeta && (
        <div className="mb-4 px-3 py-2.5 rounded-lg bg-ink-50 border border-ink-200 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500">
          <span className="font-medium text-ink-700">Imported file</span>
          <span className="font-mono">{importMeta.fileName}</span>
          <span>Sheet: <span className="font-medium text-ink-700">{importMeta.sheetName}</span></span>
          <span>{importMeta.headerRows} header row{importMeta.headerRows !== 1 ? 's' : ''}</span>
          <span>{importMeta.totalColumns} columns</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-5 gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-ink-900">TCM Editor</h1>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${typeBadgeColor}`}>{typeBadge}</span>
            {session.jiraKey && <span className="tc-id">{session.jiraKey}</span>}
          </div>
          <p className="text-ink-500 text-sm">
            {groups.length} groups · {rows.length} rows
            {hasNewRows && (
              <span className="ml-2 text-accent font-medium">
                · {newRows.length} AI suggestions ({acceptedNew.length} accepted, {rejectedNew.length} rejected)
              </span>
            )}
          </p>
        </div>

        {/* Bulk accept/reject controls (only when AI new rows exist) */}
        {hasNewRows && (
          <div className="flex gap-2 items-center flex-wrap">
            <button onClick={acceptAllNew} className="text-xs border border-success text-success rounded-lg px-3 py-1.5 hover:bg-success hover:text-white transition-colors">
              Accept all new
            </button>
            <button
              onClick={acceptHighPriorityOnly}
              className="text-xs border border-red-300 text-red-600 rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors"
              title="Accept only High-priority AI rows, reject the rest"
            >
              Accept High only
            </button>
            <button onClick={rejectAllNew} className="text-xs border border-ink-200 text-ink-400 rounded-lg px-3 py-1.5 hover:bg-ink-100 transition-colors">
              Reject all
            </button>
          </div>
        )}
      </div>

      {/* ── TCM Table ─────────────────────────────────────────────────────── */}
      <div className="card mb-5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              {/* Row 1: Group headers */}
              <tr className="bg-ink-50 border-b border-ink-200">
                <th className="px-3 py-2 text-left font-medium text-ink-500 w-8 whitespace-nowrap border-r border-ink-100" rowSpan={2}>No.</th>
                <th className="px-3 py-2 text-left font-medium text-ink-500 min-w-[200px] border-r border-ink-100" rowSpan={2}>Scenario</th>
                {groups.map(g => (
                  <th
                    key={g.id}
                    colSpan={g.values.length || 1}
                    className="px-3 py-2 text-center font-semibold text-ink-700 border-r border-ink-200 bg-accent/5 whitespace-nowrap"
                  >
                    {g.name}
                  </th>
                ))}
                <th className="px-3 py-2 text-center font-medium text-ink-500 whitespace-nowrap border-r border-ink-100" rowSpan={2}>Pos/Neg</th>
                <th className="px-3 py-2 text-center font-medium text-ink-500 whitespace-nowrap border-r border-ink-100" rowSpan={2}>Priority</th>
                <th className="px-3 py-2 text-center font-medium text-ink-500 w-20" rowSpan={2}>Actions</th>
              </tr>
              {/* Row 2: Value headers */}
              <tr className="bg-ink-50 border-b border-ink-200">
                {groups.flatMap(g =>
                  g.values.length > 0
                    ? g.values.map(v => (
                        <th key={`${g.id}-${v}`} className="px-2 py-1.5 text-center font-mono text-[10px] text-ink-500 border-r border-ink-100 whitespace-nowrap min-w-[60px]">
                          {v}
                        </th>
                      ))
                    : [<th key={`${g.id}-empty`} className="px-2 py-1.5 border-r border-ink-100 min-w-[60px]" />]
                )}
              </tr>
            </thead>
            <tbody>
              {(() => {
                let tcRowNum = 0
                const totalCheckCols = 3 + groups.reduce((s, g) => s + Math.max(g.values.length, 1), 0)
                return rows.map((row, rowIdx) => {
                const isSection = !!row.sectionLabel

                if (isSection) {
                  return (
                    <tr key={row.id} className="bg-ink-50/60 border-b border-ink-200">
                      <td
                        colSpan={totalCheckCols}
                        className="px-4 py-1.5 text-xs font-semibold text-ink-500 uppercase tracking-widest"
                      >
                        {row.sectionLabel}
                      </td>
                    </tr>
                  )
                }

                const displayNum = ++tcRowNum
                const isNew = row.isNew === true
                const isRejected = row.rejected === true

                const rowStyle: React.CSSProperties = {}
                let rowBg = ''
                if (isRejected) {
                  rowBg = 'opacity-40'
                } else if (isNew) {
                  rowStyle.backgroundColor = '#F0F7FF'
                  rowStyle.borderLeft = '2.5px solid #1A56DB'
                }

                return (
                  <React.Fragment key={row.id}>
                  <tr
                    style={rowStyle}
                    className={`border-b border-ink-100 transition-colors hover:bg-ink-50/50 ${rowBg}`}
                  >
                    {/* No. */}
                    <td className="px-3 py-2 text-ink-400 font-mono border-r border-ink-100 align-middle whitespace-nowrap">
                      {displayNum}
                    </td>

                    {/* Scenario */}
                    <td className="px-3 py-2 border-r border-ink-100 align-middle min-w-[200px]">
                      <div className="flex items-start gap-1.5 flex-wrap">
                        {isNew && !isRejected && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-bold bg-accent text-white px-1.5 py-0.5 rounded-full shrink-0 mt-0.5">
                            AI NEW
                          </span>
                        )}
                        {editingCell === row.id ? (
                          <input
                            ref={scenarioInputRef}
                            value={editScenarioVal}
                            onChange={e => setEditScenarioVal(e.target.value)}
                            onBlur={() => saveEditScenario(row.id)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') saveEditScenario(row.id)
                              if (e.key === 'Escape') setEditingCell(null)
                            }}
                            className="text-sm w-full border border-accent rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-accent/20"
                          />
                        ) : (
                          <span
                            className="text-sm text-ink-800 cursor-pointer hover:text-accent transition-colors leading-snug group flex items-center gap-1"
                            onClick={() => !isRejected && startEditScenario(row)}
                          >
                            {row.scenario || <span className="text-ink-300 italic">empty</span>}
                            {!isRejected && <span className="opacity-0 group-hover:opacity-50 transition-opacity"><IconEdit /></span>}
                          </span>
                        )}
                      </div>
                      {/* Expand toggle — only when steps or reason present */}
                      {(row.steps || row.reason) && (
                        <button
                          onClick={() => toggleExpand(row.id)}
                          className="mt-1 flex items-center gap-1 text-[10px] text-ink-400 hover:text-accent transition-colors"
                        >
                          <IconChevron open={expandedRows.has(row.id)} />
                          {expandedRows.has(row.id) ? 'Hide details' : 'Show steps & reason'}
                        </button>
                      )}
                    </td>

                    {/* Checkboxes per group value */}
                    {groups.flatMap(g =>
                      g.values.length > 0
                        ? g.values.map(v => (
                            <td key={`${row.id}-${g.name}-${v}`} className="px-2 py-2 text-center border-r border-ink-100 align-middle">
                              <input
                                type="checkbox"
                                checked={row.checks[g.name]?.[v] ?? false}
                                onChange={() => !isRejected && toggleCheck(row.id, g.name, v)}
                                disabled={isRejected}
                                className="w-3.5 h-3.5 rounded accent-accent cursor-pointer disabled:cursor-not-allowed"
                              />
                            </td>
                          ))
                        : [<td key={`${row.id}-${g.id}-empty`} className="border-r border-ink-100" />]
                    )}

                    {/* Pos/Neg */}
                    <td className="px-2 py-2 text-center border-r border-ink-100 align-middle whitespace-nowrap">
                      <button
                        onClick={() => !isRejected && togglePosNeg(row.id)}
                        disabled={isRejected}
                        className={`text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors disabled:cursor-not-allowed ${
                          row.posNeg === 'Positive'
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-red-100 text-red-700 hover:bg-red-200'
                        }`}
                      >
                        {row.posNeg === 'Positive' ? '+' : '−'}
                      </button>
                    </td>

                    {/* Priority */}
                    <td className="px-2 py-2 text-center border-r border-ink-100 align-middle">
                      <button
                        onClick={() => !isRejected && cyclePriority(row.id)}
                        disabled={isRejected}
                        className={`text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors disabled:cursor-not-allowed ${priorityColor(row.priority)}`}
                      >
                        {row.priority}
                      </button>
                    </td>

                    {/* Actions */}
                    <td className="px-2 py-2 align-middle">
                      <div className="flex flex-col gap-1 items-center">
                        {isNew && !isRejected && (
                          <div className="flex gap-1 mb-0.5">
                            <button
                              onClick={() => acceptRow(row.id)}
                              title="Accept"
                              className="text-[10px] border border-success text-success rounded px-1.5 py-0.5 hover:bg-success hover:text-white transition-colors whitespace-nowrap"
                            >
                              Accept
                            </button>
                            <button
                              onClick={() => rejectRow(row.id)}
                              title="Reject"
                              className="text-[10px] border border-ink-200 text-ink-400 rounded px-1.5 py-0.5 hover:bg-ink-100 transition-colors"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                        {isRejected && (
                          <button
                            onClick={() => acceptRow(row.id)}
                            className="text-[10px] border border-ink-200 text-ink-400 rounded px-1.5 py-0.5 hover:bg-ink-100 transition-colors mb-0.5"
                          >
                            Restore
                          </button>
                        )}
                        <div className="flex gap-1">
                          <button
                            onClick={() => moveRowUp(row.id)}
                            disabled={rowIdx === 0}
                            title="Move up"
                            className="p-1 rounded hover:bg-ink-100 text-ink-400 disabled:opacity-30 transition-colors"
                          >
                            <IconUp />
                          </button>
                          <button
                            onClick={() => moveRowDown(row.id)}
                            disabled={rowIdx === rows.length - 1}
                            title="Move down"
                            className="p-1 rounded hover:bg-ink-100 text-ink-400 disabled:opacity-30 transition-colors"
                          >
                            <IconDown />
                          </button>
                          <button
                            onClick={() => deleteRow(row.id)}
                            title="Delete row"
                            className="p-1 rounded hover:bg-red-50 text-ink-400 hover:text-danger transition-colors"
                          >
                            <IconTrash />
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                  {/* Expanded steps/reason sub-row */}
                  {expandedRows.has(row.id) && (row.steps || row.reason) && (
                    <tr className="border-b border-ink-100 bg-blue-50/40">
                      <td colSpan={totalCheckCols} className="px-4 py-2.5">
                        {row.reason && (
                          <p className="text-xs text-ink-600 mb-1.5">
                            <span className="font-semibold text-ink-700">Why: </span>{row.reason}
                          </p>
                        )}
                        {row.steps && (
                          <pre className="text-[11px] font-mono text-ink-600 whitespace-pre-wrap leading-relaxed">{row.steps}</pre>
                        )}
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                )
              })
              })()}

              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={3 + groups.reduce((s, g) => s + Math.max(g.values.length, 1), 0)}
                    className="px-4 py-8 text-center text-ink-400 text-sm"
                  >
                    No rows yet. Click &ldquo;+ Add Row&rdquo; below or import a TCM file.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Table footer */}
        <div className="px-4 py-3 border-t border-ink-100 flex items-center gap-3 flex-wrap">
          <button onClick={addRow} className="btn-ghost text-xs flex items-center gap-1.5">
            <IconPlus /> Add Row
          </button>
          <button onClick={() => setEditingGroupsModal(true)} className="btn-ghost text-xs flex items-center gap-1.5">
            <IconEdit /> Edit Groups
          </button>
          <button
            onClick={generateMissingTCs}
            disabled={generatingMissing}
            className="btn-ghost text-xs flex items-center gap-1.5 disabled:opacity-50"
          >
            {generatingMissing ? <IconSpinner /> : <span>✦</span>} Generate missing TCs
          </button>
          <button
            onClick={() => session.tcm && downloadTCMXlsx(session.tcm)}
            className="btn-ghost text-xs flex items-center gap-1.5"
            title="Download TCM as styled XLSX"
          >
            <IconDownload /> Export TCM .xlsx
          </button>
          <span className="ml-auto text-xs text-ink-400 font-mono">{activeRows.filter(r => !r.sectionLabel).length} / {rows.filter(r => !r.sectionLabel).length} rows active</span>
        </div>

        {/* Inline requirement input for "generate missing TCs" */}
        {showReqInput && (
          <div className="px-4 pb-3 border-t border-ink-100 bg-ink-50/30">
            <p className="text-xs text-ink-500 mt-3 mb-1.5">Enter the requirement for gap analysis:</p>
            <div className="flex gap-2">
              <textarea
                value={generateReq}
                onChange={e => setGenerateReq(e.target.value)}
                rows={2}
                placeholder="Describe the feature or requirement to find missing test scenarios…"
                className="flex-1 text-xs border border-ink-200 rounded px-2 py-1.5 resize-none focus:outline-none focus:border-accent"
              />
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => { if (generateReq.trim()) generateMissingTCs() }}
                  disabled={!generateReq.trim()}
                  className="btn-primary text-xs disabled:opacity-40"
                >
                  Go
                </button>
                <button onClick={() => setShowReqInput(false)} className="btn-ghost text-xs">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {generateMissingError && (
          <div className="px-4 pb-3">
            <p className="text-xs text-danger">{generateMissingError}</p>
          </div>
        )}
      </div>

      {/* ── Convert strip ─────────────────────────────────────────────────── */}
      <div className="card p-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-ink-700">
            Convert <span className="font-semibold font-mono">{activeRows.length}</span> accepted rows
            to <span className="font-semibold">{typeBadge}</span> test cases
          </p>
          {convertError && <p className="text-xs text-danger mt-1">{convertError}</p>}
        </div>
        <div className="flex gap-2 items-center">
          <button
            onClick={() => router.push('/session/generate')}
            className="btn-ghost text-sm"
          >
            ← Back to Generate
          </button>
          <button
            onClick={convertToTCs}
            disabled={converting || activeRows.length === 0}
            className="btn-primary flex items-center gap-2 disabled:opacity-40"
          >
            {converting && <IconSpinner />}
            {converting ? 'Converting…' : `Convert to Test Cases →`}
          </button>
        </div>
      </div>

      {/* Edit Groups modal */}
      {editingGroupsModal && (
        <EditGroupsModal
          groups={groups}
          onSave={handleSaveGroups}
          onClose={() => setEditingGroupsModal(false)}
        />
      )}
    </div>
  )
}
