// app/session/standard/page.tsx
'use client'

import { useState, Fragment, useRef } from 'react'
import Link from 'next/link'
import { useSession } from '@/lib/session-context'
import { importTCsFromXlsx } from '@/lib/import-excel'
import type { StandardTC, TCPriority, StandardStep } from '@/lib/types'

interface Draft {
  title: string
  scenario: string
  tcDescription: string
  expected: string
  priority: TCPriority
  positiveNegative: 'Positive' | 'Negative'
  testData: string
  prerequisite: string
  automationStatus: string
  standardSteps: StandardStep[]
}

function initDraft(tc: StandardTC): Draft {
  let standardSteps: StandardStep[]
  if (tc.standardSteps?.length) {
    standardSteps = tc.standardSteps
  } else if (tc.steps) {
    const lines = tc.steps.split('\n').filter(Boolean)
    standardSteps = lines.map((line, i) => ({
      no: i + 1,
      description: line.trim(),
      // Seed tc.expected into the first step so it isn't lost
      expected: i === 0 ? (tc.expected || undefined) : undefined,
    }))
  } else {
    standardSteps = []
  }
  return {
    title: tc.title,
    scenario: tc.scenario ?? '',
    tcDescription: tc.tcDescription ?? '',
    expected: tc.expected,
    priority: tc.priority,
    positiveNegative: tc.positiveNegative ?? 'Positive',
    testData: tc.testData ?? '',
    prerequisite: tc.prerequisite ?? '',
    automationStatus: tc.automationStatus ?? '',
    standardSteps,
  }
}

// ── Pos/Neg pill ──────────────────────────────────────────────────────────────

function PosNegPill({
  value,
  onChange,
}: {
  value: 'Positive' | 'Negative'
  onChange: (v: 'Positive' | 'Negative') => void
}) {
  const isPos = value === 'Positive'
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => onChange('Positive')}
        style={{
          background: isPos ? '#ECFDF5' : '#F4F4F6',
          color: isPos ? '#0B7A51' : '#6B6B75',
          borderRadius: 100,
          border: isPos ? '1.5px solid #0B7A51' : '1.5px solid transparent',
          padding: '4px 14px',
          fontSize: 12,
          fontWeight: isPos ? 600 : 400,
          cursor: 'pointer',
          transition: 'all 0.15s',
        }}
      >
        Positive
      </button>
      <button
        type="button"
        onClick={() => onChange('Negative')}
        style={{
          background: !isPos ? '#FEF2F2' : '#F4F4F6',
          color: !isPos ? '#C0392B' : '#6B6B75',
          borderRadius: 100,
          border: !isPos ? '1.5px solid #C0392B' : '1.5px solid transparent',
          padding: '4px 14px',
          fontSize: 12,
          fontWeight: !isPos ? 600 : 400,
          cursor: 'pointer',
          transition: 'all 0.15s',
        }}
      >
        Negative
      </button>
    </div>
  )
}

// ── Step Editor ───────────────────────────────────────────────────────────────

function StepEditor({ steps, onChange }: {
  steps: StandardStep[]
  onChange: (steps: StandardStep[]) => void
}) {
  function add() {
    onChange([...steps, { no: steps.length + 1, description: '', expected: '' }])
  }
  function remove(i: number) {
    onChange(steps.filter((_, j) => j !== i).map((s, j) => ({ ...s, no: j + 1 })))
  }
  function update(i: number, field: 'description' | 'expected', val: string) {
    onChange(steps.map((s, j) => j === i ? { ...s, [field]: val } : s))
  }

  return (
    <div onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-medium text-ink-500 uppercase tracking-wide">Steps</p>
        <button type="button" onClick={add} className="text-xs text-accent hover:underline">+ Add step</button>
      </div>
      {steps.length === 0 ? (
        <p className="text-xs text-ink-400 italic py-1">No steps — click &quot;+ Add step&quot; to add one.</p>
      ) : (
        <div className="space-y-2">
          <div className="grid gap-x-2 mb-1" style={{ gridTemplateColumns: '24px 1fr 28% 20px' }}>
            <div />
            <p className="text-[10px] text-ink-400 font-medium">Description</p>
            <p className="text-[10px] text-ink-400 font-medium">Expected (per step)</p>
            <div />
          </div>
          {steps.map((s, i) => (
            <div key={i} className="grid gap-x-2 items-start" style={{ gridTemplateColumns: '24px 1fr 28% 20px' }}>
              <span className="text-xs text-ink-400 font-mono mt-2.5 text-right">{i + 1}.</span>
              <textarea
                className="border border-ink-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-accent resize-none"
                placeholder="Step description…"
                rows={2}
                value={s.description}
                onChange={e => update(i, 'description', e.target.value)}
              />
              <textarea
                className="border border-ink-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-accent resize-none"
                placeholder="Expected…"
                rows={2}
                value={s.expected ?? ''}
                onChange={e => update(i, 'expected', e.target.value)}
              />
              <button
                type="button"
                onClick={() => remove(i)}
                className="text-ink-300 hover:text-danger text-sm mt-2.5 leading-none"
              >✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

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
    const stepsString = draft.standardSteps.map(s => s.description).filter(Boolean).join('\n')
    updateTC({
      ...tc,
      title: draft.title,
      scenario: draft.scenario || undefined,
      tcDescription: draft.tcDescription || undefined,
      expected: draft.expected,
      priority: draft.priority,
      positiveNegative: draft.positiveNegative,
      testData: draft.testData || undefined,
      prerequisite: draft.prerequisite || undefined,
      automationStatus: draft.automationStatus || undefined,
      standardSteps: draft.standardSteps,
      stepItems: draft.standardSteps.map(s => ({ keyword: s.description, args: '', note: '' })),
      steps: stepsString,
    })
    setExpandedId(null)
  }

  function cancel(id: string) {
    setExpandedId(null)
    setDrafts(d => { const n = { ...d }; delete n[id]; return n })
  }

  const labelCls = 'text-[10px] font-medium text-ink-500 uppercase tracking-wide mb-1.5 block'
  const inputCls = 'w-full border border-ink-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-accent'
  const textareaCls = `${inputCls} resize-none`

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
      <div className="p-3 md:p-4 lg:p-8 w-full">
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
    <div className="p-3 md:p-4 lg:p-8 w-full">
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
                      <td colSpan={6} className="px-6 py-5">
                        <div
                          className="grid gap-6"
                          style={{ gridTemplateColumns: '3fr 2fr' }}
                          onClick={e => e.stopPropagation()}
                        >

                          {/* ── Left column ─────────────────────────────── */}
                          <div className="space-y-4">

                            {/* Section 1: Identification */}
                            <div>
                              <label className={labelCls}>Title</label>
                              <textarea
                                className={textareaCls}
                                rows={2}
                                value={draft.title}
                                onChange={e => setDraft(tc.id, d => ({ ...d, title: e.target.value }))}
                              />
                            </div>

                            <div>
                              <label className={labelCls}>Scenario</label>
                              <textarea
                                className={textareaCls}
                                rows={2}
                                value={draft.scenario}
                                placeholder="Test scenario description…"
                                onChange={e => setDraft(tc.id, d => ({ ...d, scenario: e.target.value }))}
                              />
                            </div>

                            {/* Section 2: Overall expected */}
                            <div>
                              <label className={labelCls}>Expected Result</label>
                              <textarea
                                className={textareaCls}
                                rows={3}
                                value={draft.expected}
                                onChange={e => setDraft(tc.id, d => ({ ...d, expected: e.target.value }))}
                              />
                            </div>

                            {/* Section 3: Steps */}
                            <StepEditor
                              steps={draft.standardSteps}
                              onChange={steps => setDraft(tc.id, d => ({ ...d, standardSteps: steps }))}
                            />

                          </div>

                          {/* ── Right column ─────────────────────────────── */}
                          <div className="space-y-4">

                            <div>
                              <label className={labelCls}>Priority</label>
                              <select
                                className={inputCls}
                                value={draft.priority}
                                onChange={e => setDraft(tc.id, d => ({ ...d, priority: e.target.value as TCPriority }))}
                              >
                                <option value="High">High</option>
                                <option value="Med">Med</option>
                                <option value="Low">Low</option>
                              </select>
                            </div>

                            <div>
                              <label className={labelCls}>Positive / Negative</label>
                              <PosNegPill
                                value={draft.positiveNegative}
                                onChange={v => setDraft(tc.id, d => ({ ...d, positiveNegative: v }))}
                              />
                            </div>

                            <div>
                              <label className={labelCls}>Test Data</label>
                              <textarea
                                className={textareaCls}
                                rows={3}
                                style={{ minHeight: 80 }}
                                value={draft.testData}
                                onChange={e => setDraft(tc.id, d => ({ ...d, testData: e.target.value }))}
                                placeholder="e.g. username=test@bank.com"
                              />
                            </div>

                            <div>
                              <label className={labelCls}>Prerequisite</label>
                              <textarea
                                className={textareaCls}
                                rows={3}
                                style={{ minHeight: 80 }}
                                value={draft.prerequisite}
                                onChange={e => setDraft(tc.id, d => ({ ...d, prerequisite: e.target.value }))}
                                placeholder="e.g. User must be logged in"
                              />
                            </div>

                            <div>
                              <label className={labelCls}>TC Description</label>
                              <textarea
                                className={textareaCls}
                                rows={2}
                                value={draft.tcDescription}
                                placeholder="Optional test case description…"
                                onChange={e => setDraft(tc.id, d => ({ ...d, tcDescription: e.target.value }))}
                              />
                            </div>

                            <div>
                              <label className={labelCls}>Automation Status</label>
                              <input
                                type="text"
                                className={inputCls}
                                value={draft.automationStatus}
                                placeholder="Manual"
                                onChange={e => setDraft(tc.id, d => ({ ...d, automationStatus: e.target.value }))}
                              />
                            </div>

                            <div className="flex gap-2 pt-1">
                              <button type="button" onClick={() => save(tc)} className="btn-primary text-sm px-5">Save</button>
                              <button type="button" onClick={() => cancel(tc.id)} className="btn-ghost text-sm px-5">Cancel</button>
                            </div>

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
