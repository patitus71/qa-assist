// app/session/e2e/run/page.tsx
'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/lib/session-context'
import { RunStatusButtons } from '@/app/components/RunStatusButtons'
import { EvidenceModal } from '@/app/components/EvidenceModal'
import { BugModal } from '@/app/components/BugModal'
import type { E2ETC, TCStatus, Evidence, BugDraft } from '@/lib/types'
import { ExportResultsModal } from '@/app/components/ExportResultsModal'
import { StepEvidenceModal } from '@/app/components/StepEvidenceModal'

const EMPTY_EVIDENCE: Evidence = { screenshots: [], apiResponse: '', dbResult: '', notes: '' }

const STEP_TYPE_DOT: Record<string, string> = {
  Action: 'bg-accent',
  Verify: 'bg-success',
  Setup: 'bg-purple-500',
  DB: 'bg-orange-500',
}

interface ZephyrCycle { id: string; name: string }

export default function E2ERunPage() {
  const router = useRouter()
  const { e2eTCs, setE2eTCs, jiraKey } = useSession()

  const [evidenceMap, setEvidenceMap] = useState<Record<string, Evidence>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [showExportModal, setShowExportModal] = useState(false)
  const [stepEvidenceTarget, setStepEvidenceTarget] = useState<{ tcId: string; stepKey: string; stepLabel: string } | null>(null)
  const [evidenceTCId, setEvidenceTCId] = useState<string | null>(null)
  const [bugState, setBugState] = useState<{ tc: E2ETC; draft: BugDraft } | null>(null)
  const [bugLoading, setBugLoading] = useState(false)
  const [cycles, setCycles] = useState<ZephyrCycle[]>([])
  const [cycleId, setCycleId] = useState('')

  useEffect(() => {
    fetch('/api/zephyr/cycles')
      .then(r => r.json())
      .then((d: { cycles?: ZephyrCycle[] }) => { if (d.cycles?.length) { setCycles(d.cycles); setCycleId(d.cycles[0].id) } })
      .catch(() => {})
  }, [])

  if (e2eTCs.length === 0) {
    return (
      <div className="p-3 md:p-4 lg:p-8 max-w-3xl">
        <h1 className="text-2xl font-bold text-ink-900 mb-4">E2E Test Run</h1>
        <div className="card p-10 border-dashed text-center text-ink-400">
          <p className="text-sm mb-3">No E2E test cases to run.</p>
          <button onClick={() => router.push('/session/generate')} className="btn-primary text-sm">Generate E2E flows</button>
        </div>
      </div>
    )
  }

  const stats = useMemo(() => ({
    pass: e2eTCs.filter(t => t.status === 'Pass').length,
    fail: e2eTCs.filter(t => t.status === 'Fail').length,
    blocked: e2eTCs.filter(t => t.status === 'Blocked').length,
    skip: e2eTCs.filter(t => t.status === 'Skip').length,
    pending: e2eTCs.filter(t => t.status === 'Pending').length,
  }), [e2eTCs])

  async function setStatus(tc: E2ETC, status: TCStatus) {
    const updated: E2ETC = { ...tc, status, runDate: new Date().toISOString().slice(0, 10) }
    setE2eTCs(e2eTCs.map(t => t.id === tc.id ? updated : t))

    if (cycleId) {
      fetch('/api/zephyr/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cycleId, tcKey: tc.id, status }),
      }).catch(() => {})
    }

    if (status === 'Fail') {
      setBugLoading(true)
      try {
        const evidence = evidenceMap[tc.id] ?? EMPTY_EVIDENCE
        const stepsText = tc.steps.map(s => `${s.num}. ${s.keyword} ${s.args}${s.note ? ` — ${s.note}` : ''}`).join('\n')
        const res = await fetch('/api/generate-bug', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tcId: tc.id, tcTitle: tc.title, steps: stepsText, expected: tc.flow, actual: evidence.notes, priority: tc.priority }),
        })
        const data = await res.json() as { bug?: BugDraft }
        if (data.bug) setBugState({ tc: updated, draft: data.bug })
      } catch { /* non-fatal */ }
      finally { setBugLoading(false) }
    }
  }

  function saveStepImages(tcId: string, stepKey: string, images: string[]) {
    setEvidenceMap(m => ({
      ...m,
      [tcId]: {
        ...(m[tcId] ?? { screenshots: [], apiResponse: '', dbResult: '', notes: '' }),
        stepScreenshots: { ...(m[tcId]?.stepScreenshots ?? {}), [stepKey]: images },
      },
    }))
  }

  function updateStepNote(tcId: string, stepNum: number, note: string) {
    setE2eTCs(e2eTCs.map(t => t.id === tcId
      ? { ...t, steps: t.steps.map(s => s.num === stepNum ? { ...s, note } : s) }
      : t
    ))
  }

  function toggleExpand(id: string) {
    setExpanded(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const evidenceTC = evidenceTCId ? e2eTCs.find(t => t.id === evidenceTCId) : null

  return (
    <div className="p-3 md:p-4 lg:p-8 max-w-5xl w-full">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">E2E Test Run</h1>
          {jiraKey && <span className="tc-id mt-1 inline-block">{jiraKey}</span>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {cycles.length > 0 && (
            <select value={cycleId} onChange={e => setCycleId(e.target.value)}
              className="text-sm border border-ink-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none">
              <option value="">No Zephyr cycle</option>
              {cycles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <button onClick={() => setShowExportModal(true)} className="btn-ghost text-sm flex items-center gap-1.5">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="2" y="1" width="12" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><path d="M5 6h6M5 9h4M5 12h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            Export Results
          </button>
          <button onClick={() => router.back()} className="btn-ghost text-sm">← Back</button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {[
          { label: 'Pass', count: stats.pass, color: 'text-success' },
          { label: 'Fail', count: stats.fail, color: 'text-danger' },
          { label: 'Blocked', count: stats.blocked, color: 'text-warn' },
          { label: 'Skip', count: stats.skip, color: 'text-ink-400' },
          { label: 'Pending', count: stats.pending, color: 'text-ink-400' },
        ].map(s => (
          <div key={s.label} className="card p-3 text-center">
            <div className={`text-2xl font-bold font-mono ${s.color}`}>{s.count}</div>
            <div className="text-[10px] text-ink-500 uppercase tracking-wide mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* TC list */}
      <div className="flex flex-col gap-3">
        {e2eTCs.map(tc => {
          const isExpanded = expanded.has(tc.id)
          const ev = evidenceMap[tc.id] ?? EMPTY_EVIDENCE
          const hasEvidence = ev.screenshots.length > 0 || ev.apiResponse || ev.notes

          return (
            <div key={tc.id} className={`card overflow-hidden ${tc.status === 'Fail' ? 'border-danger/30 bg-red-50/20' : ''}`}>
              <div className="flex items-start gap-3 p-4">
                <span className="tc-id shrink-0 mt-0.5">{tc.id}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink-900">{tc.title}</p>
                  <p className="text-xs text-ink-500 mt-0.5 truncate">{tc.flow}</p>
                  {tc.bugTicket && (
                    <span className="font-mono text-[10px] text-danger bg-red-50 border border-red-200 px-1.5 py-0.5 rounded mt-1 inline-block">
                      Bug: {tc.bugTicket}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={tc.priority === 'High' ? 'badge-priority-high' : tc.priority === 'Low' ? 'badge-priority-low' : 'badge-priority-med'}>
                    {tc.priority}
                  </span>
                  <RunStatusButtons status={tc.status} onChange={s => setStatus(tc, s)} disabled={bugLoading} />
                  <button onClick={() => setEvidenceTCId(tc.id)}
                    className={`text-xs transition-colors ${hasEvidence ? 'text-accent' : 'text-ink-400 hover:text-ink-600'}`} title="Evidence">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M13.5 8.5l-6 6a4 4 0 0 1-5.657-5.657l6-6a2.5 2.5 0 0 1 3.536 3.536l-6 6A1 1 0 0 1 3.964 11L10 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                  </button>
                  <button onClick={() => toggleExpand(tc.id)}
                    className={`text-xs p-1 rounded transition-colors ${isExpanded ? 'text-accent bg-accent/10' : 'text-ink-400 hover:bg-ink-100'}`}>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Step notes (expanded) */}
              {isExpanded && tc.steps.length > 0 && (
                <div className="border-t border-ink-100 bg-ink-50/50 px-4 py-3">
                  <p className="text-[10px] font-medium text-ink-500 uppercase tracking-wide mb-2">Step notes</p>
                  <div className="flex flex-col gap-2">
                    {tc.steps.map(step => {
                      const stepKey = String(step.num)
                      const ev = evidenceMap[tc.id]
                      const stepImgs = ev?.stepScreenshots?.[stepKey] ?? []
                      return (
                        <div key={step.num} className="flex items-start gap-2 group/step">
                          <div className={`w-5 h-5 rounded-full shrink-0 mt-0.5 flex items-center justify-center ${STEP_TYPE_DOT[step.type] ?? 'bg-ink-300'}`}>
                            <span className="text-white font-mono text-[9px]">{step.num}</span>
                          </div>
                          <div className="flex-1">
                            <p className="font-mono text-xs text-ink-700">{step.keyword} <span className="text-ink-400">{step.args}</span></p>
                            <input
                              value={step.note}
                              onChange={e => updateStepNote(tc.id, step.num, e.target.value)}
                              placeholder="Note what happened at this step…"
                              className="w-full mt-1 text-xs border border-ink-200 rounded px-2 py-1 bg-white focus:outline-none focus:border-accent placeholder:text-ink-300"
                            />
                            {/* Per-step screenshots */}
                            {stepImgs.length > 0 && (
                              <div className="flex gap-1.5 mt-1.5 flex-wrap">
                                {stepImgs.map((src, i) => (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    key={i}
                                    src={src}
                                    alt=""
                                    className="h-8 w-12 object-cover rounded border border-ink-200 cursor-pointer hover:opacity-80"
                                    onClick={() => setStepEvidenceTarget({ tcId: tc.id, stepKey, stepLabel: `Step ${step.num}` })}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                          {/* Camera button */}
                          <button
                            onClick={() => setStepEvidenceTarget({ tcId: tc.id, stepKey, stepLabel: `Step ${step.num}` })}
                            className={`mt-0.5 p-1 rounded transition-colors shrink-0 ${stepImgs.length > 0 ? 'text-accent' : 'text-ink-300 hover:text-ink-600 opacity-0 group-hover/step:opacity-100'}`}
                            title={`Add screenshot for Step ${step.num}`}
                          >
                            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                              <path d="M1 5a1 1 0 0 1 1-1h1.5l1-2h5l1 2H14a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V5z" stroke="currentColor" strokeWidth="1.5"/>
                              <circle cx="8" cy="8.5" r="2" stroke="currentColor" strokeWidth="1.5"/>
                            </svg>
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {isExpanded && tc.steps.length === 0 && (
                <div className="border-t border-ink-100 px-4 py-2 text-xs text-ink-400">No steps defined.</div>
              )}
            </div>
          )
        })}
      </div>

      {/* Modals */}
      {evidenceTC && (
        <EvidenceModal
          tc={{ id: evidenceTC.id, title: evidenceTC.title }}
          evidence={evidenceMap[evidenceTC.id] ?? EMPTY_EVIDENCE}
          onSave={(tcId, ev) => setEvidenceMap(m => ({ ...m, [tcId]: ev }))}
          onClose={() => setEvidenceTCId(null)}
        />
      )}

      {stepEvidenceTarget && (
        <StepEvidenceModal
          stepLabel={stepEvidenceTarget.stepLabel}
          images={evidenceMap[stepEvidenceTarget.tcId]?.stepScreenshots?.[stepEvidenceTarget.stepKey] ?? []}
          onSave={imgs => saveStepImages(stepEvidenceTarget.tcId, stepEvidenceTarget.stepKey, imgs)}
          onClose={() => setStepEvidenceTarget(null)}
        />
      )}

      {showExportModal && (
        <ExportResultsModal
          tcs={e2eTCs}
          evidenceMap={evidenceMap}
          jiraKey={jiraKey ?? undefined}
          onClose={() => setShowExportModal(false)}
        />
      )}

      {bugState && (
        <BugModal
          tcId={bugState.tc.id}
          tcTitle={bugState.tc.title}
          draft={bugState.draft}
          evidence={evidenceMap[bugState.tc.id] ?? EMPTY_EVIDENCE}
          jiraKey={jiraKey ?? undefined}
          onClose={() => setBugState(null)}
          onCreated={key => { setE2eTCs(e2eTCs.map(t => t.id === bugState.tc.id ? { ...t, bugTicket: key } : t)); setBugState(null) }}
        />
      )}
    </div>
  )
}
