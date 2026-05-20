// app/session/standard/run/page.tsx
'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/lib/session-context'
import { RunStatusButtons } from '@/app/components/RunStatusButtons'
import { EvidenceModal } from '@/app/components/EvidenceModal'
import { BugModal } from '@/app/components/BugModal'
import type { StandardTC, TCStatus, Evidence, BugDraft } from '@/lib/types'
import { ExportResultsModal } from '@/app/components/ExportResultsModal'

const EMPTY_EVIDENCE: Evidence = { screenshots: [], apiResponse: '', dbResult: '', notes: '' }

interface ZephyrCycle { id: string; name: string }

export default function StandardRunPage() {
  const router = useRouter()
  const { standardTCs, setStandardTCs, jiraKey } = useSession()

  const [evidenceMap, setEvidenceMap] = useState<Record<string, Evidence>>({})
  const [evidenceTCId, setEvidenceTCId] = useState<string | null>(null)
  const [showExportModal, setShowExportModal] = useState(false)
  const [bugState, setBugState] = useState<{ tc: StandardTC; draft: BugDraft } | null>(null)
  const [bugLoading, setBugLoading] = useState(false)
  const [cycles, setCycles] = useState<ZephyrCycle[]>([])
  const [cycleId, setCycleId] = useState('')

  useEffect(() => {
    fetch('/api/zephyr/cycles')
      .then(r => r.json())
      .then((d: { cycles?: ZephyrCycle[] }) => { if (d.cycles?.length) { setCycles(d.cycles); setCycleId(d.cycles[0].id) } })
      .catch(() => {})
  }, [])

  if (standardTCs.length === 0) {
    return (
      <div className="p-8 max-w-3xl">
        <h1 className="text-2xl font-bold text-ink-900 mb-4">Standard Test Run</h1>
        <div className="card p-10 border-dashed text-center text-ink-400">
          <p className="text-sm mb-3">No Standard test cases to run.</p>
          <button onClick={() => router.push('/session/generate')} className="btn-primary text-sm">Generate test cases</button>
        </div>
      </div>
    )
  }

  const stats = useMemo(() => ({
    pass: standardTCs.filter(t => t.status === 'Pass').length,
    fail: standardTCs.filter(t => t.status === 'Fail').length,
    blocked: standardTCs.filter(t => t.status === 'Blocked').length,
    skip: standardTCs.filter(t => t.status === 'Skip').length,
    pending: standardTCs.filter(t => t.status === 'Pending').length,
  }), [standardTCs])

  const total = standardTCs.length
  const done = stats.pass + stats.fail + stats.blocked + stats.skip
  const passRate = done > 0 ? Math.round((stats.pass / done) * 100) : 0

  async function setStatus(tc: StandardTC, status: TCStatus) {
    const updated: StandardTC = { ...tc, status, runDate: new Date().toISOString().slice(0, 10) }
    setStandardTCs(standardTCs.map(t => t.id === tc.id ? updated : t))

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
        const res = await fetch('/api/generate-bug', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tcId: tc.id, tcTitle: tc.title, steps: tc.steps,
            expected: tc.expected, actual: evidence.notes, priority: tc.priority,
          }),
        })
        const data = await res.json() as { bug?: BugDraft }
        if (data.bug) setBugState({ tc: updated, draft: data.bug })
      } catch { /* non-fatal */ }
      finally { setBugLoading(false) }
    }
  }

  function saveEvidence(tcId: string, ev: Evidence) {
    setEvidenceMap(m => ({ ...m, [tcId]: ev }))
  }

  function onBugCreated(tc: StandardTC, bugKey: string) {
    setStandardTCs(standardTCs.map(t => t.id === tc.id ? { ...t, bugTicket: bugKey } : t))
    setBugState(null)
  }

  const evidenceTC = evidenceTCId ? standardTCs.find(t => t.id === evidenceTCId) : null

  return (
    <div className="p-8 max-w-5xl w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Standard Test Run</h1>
          {jiraKey && <span className="tc-id mt-1 inline-block">{jiraKey}</span>}
        </div>
        <div className="flex items-center gap-3">
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
          <button onClick={() => router.back()} className="btn-ghost text-sm">← Back to list</button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-5 gap-3 mb-6">
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

      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex justify-between text-xs text-ink-500 mb-1">
          <span>{done} / {total} executed</span>
          <span className="font-mono">{passRate}% pass rate</span>
        </div>
        <div className="h-2 bg-ink-100 rounded-full overflow-hidden">
          <div className="h-full bg-success transition-all" style={{ width: `${(stats.pass / total) * 100}%` }} />
        </div>
      </div>

      {/* TC list */}
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-ink-50 border-b border-ink-100">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-500 uppercase tracking-wide w-24">ID</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-500 uppercase tracking-wide">Title</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-500 uppercase tracking-wide w-16">Priority</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-500 uppercase tracking-wide">Status</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-500 uppercase tracking-wide w-32">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-50">
            {standardTCs.map(tc => {
              const ev = evidenceMap[tc.id] ?? EMPTY_EVIDENCE
              const hasEvidence = ev.screenshots.length > 0 || ev.apiResponse || ev.dbResult || ev.notes
              return (
                <tr key={tc.id} className={`group transition-colors ${tc.status === 'Fail' ? 'bg-red-50/30' : 'hover:bg-ink-50/50'}`}>
                  <td className="px-4 py-3 w-24"><span className="tc-id">{tc.id}</span></td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-ink-800 font-medium">{tc.title}</p>
                    {tc.bugTicket && (
                      <span className="font-mono text-[10px] text-danger bg-red-50 border border-red-200 px-1.5 py-0.5 rounded mt-0.5 inline-block">
                        Bug: {tc.bugTicket}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 w-16">
                    <span className={tc.priority === 'High' ? 'badge-priority-high' : tc.priority === 'Low' ? 'badge-priority-low' : 'badge-priority-med'}>
                      {tc.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <RunStatusButtons status={tc.status} onChange={s => setStatus(tc, s)} disabled={bugLoading} />
                  </td>
                  <td className="px-4 py-3 w-32">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEvidenceTCId(tc.id)}
                        className={`text-xs flex items-center gap-1 transition-colors ${hasEvidence ? 'text-accent' : 'text-ink-400 hover:text-ink-700'}`}
                        title="Attach evidence"
                      >
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M13.5 8.5l-6 6a4 4 0 0 1-5.657-5.657l6-6a2.5 2.5 0 0 1 3.536 3.536l-6 6A1 1 0 0 1 3.964 11L10 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                        {hasEvidence ? 'Evidence' : 'Add'}
                      </button>
                      {bugLoading && tc.status !== 'Fail' && null}
                      {tc.status === 'Fail' && !tc.bugTicket && (
                        <button
                          onClick={async () => {
                            setBugLoading(true)
                            try {
                              const evidence = evidenceMap[tc.id] ?? EMPTY_EVIDENCE
                              const res = await fetch('/api/generate-bug', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ tcId: tc.id, tcTitle: tc.title, steps: tc.steps, expected: tc.expected, actual: evidence.notes, priority: tc.priority }),
                              })
                              const data = await res.json() as { bug?: BugDraft }
                              if (data.bug) setBugState({ tc, draft: data.bug })
                            } finally { setBugLoading(false) }
                          }}
                          className="text-xs text-danger hover:underline whitespace-nowrap"
                        >
                          {bugLoading ? '…' : 'File bug'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      {evidenceTC && (
        <EvidenceModal
          tc={{ id: evidenceTC.id, title: evidenceTC.title, expected: evidenceTC.expected }}
          evidence={evidenceMap[evidenceTC.id] ?? EMPTY_EVIDENCE}
          onSave={saveEvidence}
          onClose={() => setEvidenceTCId(null)}
        />
      )}

      {showExportModal && (
        <ExportResultsModal
          tcs={standardTCs}
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
          onCreated={(key) => onBugCreated(bugState.tc, key)}
        />
      )}
    </div>
  )
}
