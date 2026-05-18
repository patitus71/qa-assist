// app/session/api/run/page.tsx
'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/lib/session-context'
import { BugModal } from '@/app/components/BugModal'
import type { APITC, APIRunResult, TCStatus, BugDraft } from '@/lib/types'

type Env = 'dev' | 'staging' | 'uat'

interface ZephyrCycle { id: string; name: string }

const METHOD_COLORS: Record<string, string> = {
  GET: 'text-green-700 bg-green-50 border-green-200',
  POST: 'text-blue-700 bg-blue-50 border-blue-200',
  PUT: 'text-amber-700 bg-amber-50 border-amber-200',
  DELETE: 'text-red-700 bg-red-50 border-red-200',
}

export default function APIRunPage() {
  const router = useRouter()
  const { apiTCs, setApiTCs, jiraKey } = useSession()

  const [environment, setEnvironment] = useState<Env>('dev')
  const [results, setResults] = useState<Record<string, APIRunResult>>({})
  const [running, setRunning] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [bugState, setBugState] = useState<{ tc: APITC; draft: BugDraft } | null>(null)
  const [cycles, setCycles] = useState<ZephyrCycle[]>([])
  const [cycleId, setCycleId] = useState('')

  useEffect(() => {
    fetch('/api/zephyr/cycles')
      .then(r => r.json())
      .then((d: { cycles?: ZephyrCycle[] }) => { if (d.cycles?.length) { setCycles(d.cycles); setCycleId(d.cycles[0].id) } })
      .catch(() => {})
  }, [])

  if (apiTCs.length === 0) {
    return (
      <div className="p-8 max-w-3xl">
        <h1 className="text-2xl font-bold text-ink-900 mb-4">API Test Run</h1>
        <div className="card p-10 border-dashed text-center text-ink-400">
          <p className="text-sm mb-3">No API test cases to run.</p>
          <button onClick={() => router.push('/session/generate')} className="btn-primary text-sm">Generate API tests</button>
        </div>
      </div>
    )
  }

  const stats = useMemo(() => ({
    pass: apiTCs.filter(t => t.status === 'Pass').length,
    fail: apiTCs.filter(t => t.status === 'Fail').length,
    pending: apiTCs.filter(t => t.status === 'Pending').length,
  }), [apiTCs])

  async function runTC(tc: APITC) {
    setRunning(prev => { const n = new Set(prev); n.add(tc.id); return n })
    try {
      const res = await fetch('/api/run-api-tc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tc, environment }),
      })
      const result = await res.json() as APIRunResult
      setResults(prev => ({ ...prev, [tc.id]: result }))

      const passed = !result.error && result.assertionResults.every(r => r.passed)
      const status: TCStatus = result.error ? 'Fail' : (passed ? 'Pass' : 'Fail')
      const updated: APITC = { ...tc, status, runDate: new Date().toISOString().slice(0, 10) }
      setApiTCs(apiTCs.map(t => t.id === tc.id ? updated : t))

      if (cycleId) {
        fetch('/api/zephyr/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cycleId, tcKey: tc.id, status }),
        }).catch(() => {})
      }

      if (!passed) {
        const failed = result.assertionResults.filter(r => !r.passed)
        const actual = result.error
          ? result.error
          : failed.map(r => `${r.assertion.type} ${r.assertion.operator} ${r.assertion.expected} → got ${r.actual}`).join('\n')

        const bugRes = await fetch('/api/generate-bug', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tcId: tc.id, tcTitle: `${tc.method} ${tc.endpoint}`,
            steps: `Call ${tc.method} ${tc.endpoint}`,
            expected: tc.assertions.map(a => `${a.type} ${a.operator} ${a.expected}`).join('\n'),
            actual, priority: tc.priority,
          }),
        })
        const bugData = await bugRes.json() as { bug?: BugDraft }
        if (bugData.bug) setBugState({ tc: updated, draft: bugData.bug })
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Request failed'
      setResults(prev => ({ ...prev, [tc.id]: { statusCode: 0, responseBody: null, responseTimeMs: 0, assertionResults: [], error } }))
    } finally {
      setRunning(prev => { const n = new Set(prev); n.delete(tc.id); return n })
    }
  }

  async function runAll() {
    for (const tc of apiTCs) {
      await runTC(tc)
    }
  }

  function toggleExpand(id: string) {
    setExpanded(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const allRunning = running.size === apiTCs.length
  const someRunning = running.size > 0

  return (
    <div className="p-8 max-w-5xl w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">API Test Run</h1>
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
          <button onClick={() => router.back()} className="btn-ghost text-sm">← Back</button>
        </div>
      </div>

      {/* Environment + Run All */}
      <div className="card p-4 mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-ink-500 uppercase tracking-wide">Environment</span>
          <div className="flex gap-1">
            {(['dev', 'staging', 'uat'] as Env[]).map(env => (
              <button key={env} onClick={() => setEnvironment(env)}
                className={`font-mono text-xs px-3 py-1.5 rounded border transition-all capitalize ${
                  environment === env
                    ? 'bg-accent text-white border-accent'
                    : 'border-ink-200 text-ink-600 hover:border-ink-300'
                }`}>
                {env}
              </button>
            ))}
          </div>
        </div>
        <button onClick={runAll} disabled={someRunning}
          className="btn-primary flex items-center gap-2 disabled:opacity-50">
          {someRunning && (
            <svg className="animate-spin" width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6" stroke="white" strokeWidth="2" strokeOpacity="0.4" />
              <path d="M8 2a6 6 0 0 1 6 6" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
          {someRunning ? `Running (${running.size}/${apiTCs.length})…` : 'Run All'}
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: 'Pass', count: stats.pass, color: 'text-success' },
          { label: 'Fail', count: stats.fail, color: 'text-danger' },
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
        {apiTCs.map(tc => {
          const result = results[tc.id]
          const isRunning = running.has(tc.id)
          const isExpanded = expanded.has(tc.id)

          return (
            <div key={tc.id} className={`card overflow-hidden ${tc.status === 'Fail' ? 'border-danger/30' : ''}`}>
              <div className="flex items-center gap-3 p-4">
                <span className="tc-id shrink-0">{tc.id}</span>
                <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${METHOD_COLORS[tc.method] ?? ''}`}>{tc.method}</span>
                <span className="font-mono text-sm text-ink-700 flex-1 truncate">{tc.endpoint}</span>
                <span className={tc.priority === 'High' ? 'badge-priority-high shrink-0' : tc.priority === 'Low' ? 'badge-priority-low shrink-0' : 'badge-priority-med shrink-0'}>
                  {tc.priority}
                </span>

                {/* Status */}
                {tc.status !== 'Pending' && (
                  <span className={`badge-status-${tc.status.toLowerCase()} shrink-0`}>{tc.status}</span>
                )}
                {result && (
                  <span className="font-mono text-[10px] text-ink-500 shrink-0">
                    {result.statusCode > 0 && `HTTP ${result.statusCode} · `}{result.responseTimeMs}ms
                  </span>
                )}

                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => runTC(tc)} disabled={isRunning}
                    className="btn-ghost text-xs py-1 disabled:opacity-40 flex items-center gap-1">
                    {isRunning && <svg className="animate-spin" width="11" height="11" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeOpacity="0.3" /><path d="M8 2a6 6 0 0 1 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>}
                    {isRunning ? 'Running…' : 'Run'}
                  </button>
                  {result && (
                    <button onClick={() => toggleExpand(tc.id)}
                      className={`p-1 rounded text-xs transition-colors ${isExpanded ? 'text-accent bg-accent/10' : 'text-ink-400 hover:bg-ink-100'}`}>
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                        <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              {/* Results */}
              {isExpanded && result && (
                <div className="border-t border-ink-100 bg-ink-50/50 px-4 py-3 space-y-3">
                  {result.error && (
                    <p className="text-xs text-danger font-mono bg-red-50 border border-red-200 rounded px-2 py-1">{result.error}</p>
                  )}

                  {/* Assertions */}
                  {result.assertionResults.length > 0 && (
                    <div>
                      <p className="text-[10px] font-medium text-ink-500 uppercase tracking-wide mb-2">Assertions</p>
                      <div className="flex flex-col gap-1">
                        {result.assertionResults.map((ar, i) => (
                          <div key={i} className={`flex items-center gap-2 font-mono text-xs px-2 py-1.5 rounded ${ar.passed ? 'bg-green-50 text-success' : 'bg-red-50 text-danger'}`}>
                            <span>{ar.passed ? '✓' : '✗'}</span>
                            <span className="text-ink-600">{ar.assertion.type}</span>
                            <span>{ar.assertion.operator}</span>
                            <span className="font-medium">{ar.assertion.expected}</span>
                            {!ar.passed && <span className="ml-auto text-ink-500">got: {ar.actual}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Response preview */}
                  {result.responseBody !== null && (
                    <div>
                      <p className="text-[10px] font-medium text-ink-500 uppercase tracking-wide mb-1">Response</p>
                      <pre className="font-mono text-xs bg-ink-900 text-green-400 rounded p-2 overflow-x-auto max-h-32">
                        {typeof result.responseBody === 'string'
                          ? result.responseBody.slice(0, 500)
                          : JSON.stringify(result.responseBody, null, 2).slice(0, 500)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {bugState && (
        <BugModal
          tcId={bugState.tc.id}
          tcTitle={`${bugState.tc.method} ${bugState.tc.endpoint}`}
          draft={bugState.draft}
          evidence={{ screenshots: [], apiResponse: results[bugState.tc.id] ? JSON.stringify(results[bugState.tc.id].responseBody) : '', dbResult: '', notes: '' }}
          jiraKey={jiraKey ?? undefined}
          onClose={() => setBugState(null)}
          onCreated={key => { setApiTCs(apiTCs.map(t => t.id === bugState.tc.id ? { ...t, bugTicket: key } : t)); setBugState(null) }}
        />
      )}
    </div>
  )
}
