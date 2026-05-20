// app/session/standard/page.tsx
'use client'

import { useState, Fragment, useRef } from 'react'
import Link from 'next/link'
import { useSession } from '@/lib/session-context'
import { importTCsFromXlsx } from '@/lib/import-excel'
import type { StandardTC, TCPriority, StepItem } from '@/lib/types'

interface Draft {
  title: string
  expected: string
  priority: TCPriority
  positiveNegative: 'Positive' | 'Negative'
  testData: string
  prerequisite: string
  stepItems: StepItem[]
}

function initDraft(tc: StandardTC): Draft {
  const stepItems: StepItem[] = tc.stepItems?.length
    ? tc.stepItems
    : tc.steps
      ? tc.steps.split('\n').filter(Boolean).map(line => ({ keyword: line.trim(), args: '', note: '' }))
      : []
  return {
    title: tc.title,
    expected: tc.expected,
    priority: tc.priority,
    positiveNegative: tc.positiveNegative ?? 'Positive',
    testData: tc.testData ?? '',
    prerequisite: tc.prerequisite ?? '',
    stepItems,
  }
}

function StepEditor({ steps, onChange }: {
  steps: StepItem[]
  onChange: (steps: StepItem[]) => void
}) {
  function add() { onChange([...steps, { keyword: '', args: '', note: '' }]) }
  function remove(i: number) { onChange(steps.filter((_, j) => j !== i)) }
  function update(i: number, field: keyof StepItem, val: string) {
    onChange(steps.map((s, j) => j === i ? { ...s, [field]: val } : s))
  }

  return (
    <div onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] font-medium text-ink-500 uppercase tracking-wide">Steps</p>
        <button type="button" onClick={add} className="text-xs text-accent hover:underline">+ Add step</button>
      </div>
      {steps.length > 0 && (
        <div className="grid gap-x-1.5 mb-1" style={{ gridTemplateColumns: '20px 1fr 1fr 1fr 18px' }}>
          <div />
          <p className="text-[10px] text-ink-400">Keyword</p>
          <p className="text-[10px] text-ink-400">Args</p>
          <p className="text-[10px] text-ink-400">Note</p>
          <div />
        </div>
      )}
      <div className="space-y-1.5">
        {steps.map((s, i) => (
          <div key={i} className="grid gap-x-1.5 items-center" style={{ gridTemplateColumns: '20px 1fr 1fr 1fr 18px' }}>
            <span className="text-[10px] text-ink-400 font-mono text-right">{i + 1}.</span>
            <input
              className="border border-ink-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-accent"
              placeholder="e.g. Click Element"
              value={s.keyword}
              onChange={e => update(i, 'keyword', e.target.value)}
            />
            <input
              className="border border-ink-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-accent"
              placeholder="e.g. id=btn"
              value={s.args}
              onChange={e => update(i, 'args', e.target.value)}
            />
            <input
              className="border border-ink-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-accent"
              placeholder="note"
              value={s.note}
              onChange={e => update(i, 'note', e.target.value)}
            />
            <button type="button" onClick={() => remove(i)} className="text-ink-300 hover:text-danger text-xs leading-none">✕</button>
          </div>
        ))}
        {steps.length === 0 && (
          <p className="text-xs text-ink-400 italic py-1">No steps — click "+ Add step" to add one.</p>
        )}
      </div>
    </div>
  )
}

export default function StandardPage() {
  const { standardTCs, setStandardTCs, updateTC } = useSession()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [importMsg, setImportMsg] = useState('')
  const importRef = useRef<HTMLInputElement>(null)

  async function handleImport(file: File) {
    const { tcs, warnings } = await importTCsFromXlsx(file)
    const imported = tcs.filter(t => t.type === 'Standard') as StandardTC[]
    if (imported.length === 0) { setImportMsg('No Standard TCs found in file'); return }
    const existingIds = new Set(standardTCs.map(t => t.id))
    const merged = [
      ...standardTCs.filter(t => !imported.some(i => i.id === t.id)),
      ...imported,
    ]
    setStandardTCs(merged)
    const warnStr = warnings.length > 0 ? ` (${warnings.length} warning${warnings.length > 1 ? 's' : ''})` : ''
    const newCount = imported.filter(t => !existingIds.has(t.id)).length
    const updCount = imported.length - newCount
    setImportMsg(`Imported ${newCount} new + ${updCount} updated${warnStr}`)
    setTimeout(() => setImportMsg(''), 4000)
  }

  function toggle(tc: StandardTC) {
    if (expandedId === tc.id) {
      setExpandedId(null)
    } else {
      setExpandedId(tc.id)
      setDrafts(d => d[tc.id] ? d : { ...d, [tc.id]: initDraft(tc) })
    }
  }

  function setDraft(id: string, updater: (d: Draft) => Draft) {
    setDrafts(d => ({ ...d, [id]: updater(d[id]) }))
  }

  function save(tc: StandardTC) {
    const draft = drafts[tc.id]
    if (!draft) return
    const stepsString = draft.stepItems
      .map(s => [s.keyword, s.args].filter(Boolean).join(' '))
      .join('\n')
    updateTC({
      ...tc,
      title: draft.title,
      expected: draft.expected,
      priority: draft.priority,
      positiveNegative: draft.positiveNegative,
      testData: draft.testData,
      prerequisite: draft.prerequisite,
      stepItems: draft.stepItems,
      steps: stepsString,
    })
    setExpandedId(null)
  }

  function cancel(id: string) {
    setExpandedId(null)
    setDrafts(d => { const n = { ...d }; delete n[id]; return n })
  }

  const importButton = (
    <>
      <input
        ref={importRef} type="file" accept=".xlsx" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = '' }}
      />
      <button onClick={() => importRef.current?.click()} className="btn-ghost text-sm flex items-center gap-1.5">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <path d="M8 2v9M4 7l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M2 13h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        Import .xlsx
      </button>
    </>
  )

  if (standardTCs.length === 0) {
    return (
      <div className="p-8 max-w-5xl w-full">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-ink-900">Standard Test Cases</h1>
          {importButton}
        </div>
        <div className="card p-10 border-dashed text-center text-ink-400">
          <p className="text-sm mb-3">Generate or import Standard test cases to begin.</p>
          <Link href="/session/generate" className="btn-primary text-sm">Generate test cases</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-5xl w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Standard Test Cases</h1>
          <p className="text-ink-500 text-sm mt-0.5">
            {standardTCs.length} test cases — click a row to edit
            {importMsg && <span className="ml-2 text-success font-mono text-xs">✓ {importMsg}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {importButton}
          <Link href="/session/standard/run" className="btn-primary">Run Tests →</Link>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-ink-50 border-b border-ink-100">
            <tr>
              {['ID', 'Title', 'Priority', 'Status', 'Bug'].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-ink-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {standardTCs.map(tc => {
              const isOpen = expandedId === tc.id
              const draft = drafts[tc.id]
              return (
                <Fragment key={tc.id}>
                  <tr
                    onClick={() => toggle(tc)}
                    className={`cursor-pointer border-b border-ink-50 transition-colors ${isOpen ? 'bg-accent/5 border-accent/20' : 'hover:bg-ink-50'}`}
                  >
                    <td className="px-4 py-3"><span className="tc-id">{tc.id}</span></td>
                    <td className="px-4 py-3 text-ink-700 max-w-xs">
                      <span className={`truncate block ${isOpen ? 'text-accent font-medium' : ''}`}>{tc.title}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={tc.priority === 'High' ? 'badge-priority-high' : tc.priority === 'Low' ? 'badge-priority-low' : 'badge-priority-med'}>
                        {tc.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge-status-${tc.status.toLowerCase()}`}>{tc.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      {tc.bugTicket
                        ? <span className="font-mono text-xs text-danger">{tc.bugTicket}</span>
                        : <span className="text-ink-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right pr-4">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
                        className={`text-ink-400 transition-transform inline-block ${isOpen ? 'rotate-180' : ''}`}>
                        <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </td>
                  </tr>

                  {isOpen && draft && (
                    <tr className="border-b border-ink-100 bg-accent/5">
                      <td colSpan={6} className="px-5 py-4">
                        <div className="space-y-4 max-w-3xl" onClick={e => e.stopPropagation()}>

                          {/* Title + Priority + Pos/Neg */}
                          <div className="flex gap-3 items-end">
                            <div className="flex-1">
                              <p className="text-[10px] font-medium text-ink-500 uppercase tracking-wide mb-1">Title</p>
                              <input
                                className="w-full border border-ink-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent"
                                value={draft.title}
                                onChange={e => setDraft(tc.id, d => ({ ...d, title: e.target.value }))}
                              />
                            </div>
                            <div>
                              <p className="text-[10px] font-medium text-ink-500 uppercase tracking-wide mb-1">Priority</p>
                              <select
                                className="border border-ink-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-accent bg-white"
                                value={draft.priority}
                                onChange={e => setDraft(tc.id, d => ({ ...d, priority: e.target.value as TCPriority }))}
                              >
                                <option value="High">High</option>
                                <option value="Med">Med</option>
                                <option value="Low">Low</option>
                              </select>
                            </div>
                            <div>
                              <p className="text-[10px] font-medium text-ink-500 uppercase tracking-wide mb-1">Pos/Neg</p>
                              <select
                                className="border border-ink-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-accent bg-white"
                                value={draft.positiveNegative}
                                onChange={e => setDraft(tc.id, d => ({ ...d, positiveNegative: e.target.value as 'Positive' | 'Negative' }))}
                              >
                                <option value="Positive">Positive</option>
                                <option value="Negative">Negative</option>
                              </select>
                            </div>
                          </div>

                          {/* Expected */}
                          <div>
                            <p className="text-[10px] font-medium text-ink-500 uppercase tracking-wide mb-1">Expected Result</p>
                            <textarea
                              className="w-full border border-ink-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent resize-none"
                              rows={2}
                              value={draft.expected}
                              onChange={e => setDraft(tc.id, d => ({ ...d, expected: e.target.value }))}
                            />
                          </div>

                          {/* Test Data + Prerequisite */}
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <p className="text-[10px] font-medium text-ink-500 uppercase tracking-wide mb-1">Test Data</p>
                              <textarea
                                className="w-full border border-ink-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent resize-none"
                                rows={2}
                                value={draft.testData}
                                onChange={e => setDraft(tc.id, d => ({ ...d, testData: e.target.value }))}
                                placeholder="e.g. username=test@bank.com"
                              />
                            </div>
                            <div>
                              <p className="text-[10px] font-medium text-ink-500 uppercase tracking-wide mb-1">Prerequisite</p>
                              <textarea
                                className="w-full border border-ink-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent resize-none"
                                rows={2}
                                value={draft.prerequisite}
                                onChange={e => setDraft(tc.id, d => ({ ...d, prerequisite: e.target.value }))}
                                placeholder="e.g. User must be logged in"
                              />
                            </div>
                          </div>

                          {/* Steps */}
                          <StepEditor
                            steps={draft.stepItems}
                            onChange={steps => setDraft(tc.id, d => ({ ...d, stepItems: steps }))}
                          />

                          {/* Actions */}
                          <div className="flex gap-2 pt-1">
                            <button type="button" onClick={() => save(tc)} className="btn-primary text-sm px-5">Save</button>
                            <button type="button" onClick={() => cancel(tc.id)} className="btn-ghost text-sm px-5">Cancel</button>
                          </div>

                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
