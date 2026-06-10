// app/components/BugModal.tsx
'use client'

import { useState, useEffect } from 'react'
import type { BugDraft, Evidence } from '@/lib/types'

interface TCLink { key: string; type: string }

interface Sprint { id: string; name: string; state: string }
interface ZephyrCycle { id: string; name: string }

interface Props {
  tcId: string
  tcTitle: string
  draft: BugDraft
  evidence: Evidence
  jiraKey?: string
  onClose: () => void
  onCreated: (bugKey: string, bugUrl: string) => void
}

const LINK_TYPES = ['caused by', 'related to', 'blocks']

export function BugModal({ tcId, tcTitle, draft: initialDraft, evidence, jiraKey, onClose, onCreated }: Props) {
  const [draft, setDraft] = useState<BugDraft>({ ...initialDraft })
  const [projectKey, setProjectKey] = useState(jiraKey?.split('-')[0] ?? '')
  const [tcLinks, setTcLinks] = useState<TCLink[]>([{ key: jiraKey ?? '', type: 'caused by' }])
  const [storyKey, setStoryKey] = useState('')
  const [showStory, setShowStory] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [sprints, setSprints] = useState<Sprint[]>([])
  const [sprintId, setSprintId] = useState('')
  const [cycles, setCycles] = useState<ZephyrCycle[]>([])
  const [cycleId, setCycleId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<{ key: string; url: string } | null>(null)

  useEffect(() => {
    fetch('/api/jira/sprints')
      .then(r => r.json())
      .then((d: { sprints?: Sprint[] }) => { if (d.sprints?.length) { setSprints(d.sprints); setSprintId(d.sprints[0].id) } })
      .catch(() => {})

    fetch('/api/zephyr/cycles')
      .then(r => r.json())
      .then((d: { cycles?: ZephyrCycle[] }) => { if (d.cycles?.length) { setCycles(d.cycles); setCycleId(d.cycles[0].id) } })
      .catch(() => {})
  }, [])

  function addLabel() {
    const l = newLabel.trim()
    if (!l || draft.labels.includes(l)) return
    setDraft(d => ({ ...d, labels: [...d.labels, l] }))
    setNewLabel('')
  }

  function removeLabel(l: string) {
    setDraft(d => ({ ...d, labels: d.labels.filter(x => x !== l) }))
  }

  function addTCLink() {
    setTcLinks(links => [...links, { key: '', type: 'caused by' }])
  }

  async function submit() {
    if (!projectKey.trim()) { setError('Project key is required'); return }
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/jira/create-issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectKey,
          title: draft.title,
          steps: draft.steps,
          expected: draft.expected,
          actual: draft.actual,
          priority: draft.priority,
          labels: draft.labels,
          tcLinks: tcLinks.filter(l => l.key.trim()),
          sprintId: sprintId || undefined,
          zephyrCycleId: cycleId || undefined,
          storyKey: storyKey.trim() || undefined,
          evidenceNotes: evidence.notes || undefined,
        }),
      })
      const data = await res.json() as { key?: string; url?: string; error?: string }
      if (!res.ok) { setError(data.error ?? 'Failed to create issue'); return }
      setSuccess({ key: data.key!, url: data.url! })
      onCreated(data.key!, data.url!)
    } catch {
      setError('Network error — check connection')
    } finally {
      setSubmitting(false)
    }
  }

  const inputCls = 'w-full text-sm border border-ink-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20'
  const labelCls = 'text-xs font-medium text-ink-500 uppercase tracking-wide block mb-1.5'

  if (success) {
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-card shadow-xl w-full max-w-md p-8 text-center">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L19 7" stroke="#0B7A51" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <h2 className="text-lg font-semibold text-ink-900 mb-1">Bug created</h2>
          <p className="text-ink-500 text-sm mb-4">
            <span className="tc-id">{success.key}</span> has been created in Jira.
          </p>
          <div className="flex gap-3 justify-center">
            <a href={success.url} target="_blank" rel="noopener noreferrer" className="btn-primary text-sm">Open in Jira</a>
            <button onClick={onClose} className="btn-ghost text-sm">Close</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-card shadow-xl w-[90vw] md:w-full max-w-2xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-ink-900">Create Bug — <span className="tc-id">{tcId}</span></h2>
            <p className="text-xs text-ink-500 mt-0.5 truncate max-w-md">{tcTitle}</p>
          </div>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-700 p-1">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Title */}
          <div>
            <label className={labelCls}>Title</label>
            <input value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} className={inputCls} />
          </div>

          {/* Steps / Expected / Actual grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Steps to Reproduce</label>
              <textarea value={draft.steps} onChange={e => setDraft(d => ({ ...d, steps: e.target.value }))} rows={4} className={`${inputCls} resize-none`} />
            </div>
            <div>
              <label className={labelCls}>Expected Result</label>
              <textarea value={draft.expected} onChange={e => setDraft(d => ({ ...d, expected: e.target.value }))} rows={4} className={`${inputCls} resize-none`} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Actual Result</label>
            <textarea value={draft.actual} onChange={e => setDraft(d => ({ ...d, actual: e.target.value }))} rows={3} className={`${inputCls} resize-none`} />
          </div>

          {/* Priority + Project row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Priority</label>
              <select value={draft.priority} onChange={e => setDraft(d => ({ ...d, priority: e.target.value as BugDraft['priority'] }))}
                className={inputCls}>
                {(['Critical', 'High', 'Med', 'Low'] as const).map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Project Key <span className="text-danger">*</span></label>
              <input value={projectKey} onChange={e => setProjectKey(e.target.value.toUpperCase())} placeholder="PROJ" className={inputCls} />
            </div>
          </div>

          {/* Labels */}
          <div>
            <label className={labelCls}>Labels</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {draft.labels.map(l => (
                <span key={l} className="inline-flex items-center gap-1 font-mono text-xs bg-ink-100 text-ink-600 px-2 py-0.5 rounded-full">
                  {l}
                  <button onClick={() => removeLabel(l)} className="text-ink-400 hover:text-danger leading-none">×</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={newLabel} onChange={e => setNewLabel(e.target.value)} onKeyDown={e => e.key === 'Enter' && addLabel()}
                placeholder="Add label…" className="flex-1 text-sm border border-ink-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:border-accent" />
              <button onClick={addLabel} className="btn-ghost text-xs py-1.5">Add</button>
            </div>
          </div>

          {/* TC Links */}
          <div>
            <label className={labelCls}>TC Links <span className="text-danger">*</span></label>
            <div className="space-y-2">
              {tcLinks.map((link, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input value={link.key} onChange={e => setTcLinks(ls => ls.map((l, j) => j === i ? { ...l, key: e.target.value } : l))}
                    placeholder="PROJ-123" className="flex-1 font-mono text-sm border border-ink-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-accent" />
                  <select value={link.type} onChange={e => setTcLinks(ls => ls.map((l, j) => j === i ? { ...l, type: e.target.value } : l))}
                    className="text-xs border border-ink-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none">
                    {LINK_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                  {i > 0 && (
                    <button onClick={() => setTcLinks(ls => ls.filter((_, j) => j !== i))} className="text-danger hover:bg-red-50 rounded p-1 text-xs">✕</button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={addTCLink} className="text-xs text-ink-500 hover:text-accent mt-1.5 transition-colors">+ Add TC link</button>
          </div>

          {/* Sprint */}
          {sprints.length > 0 && (
            <div>
              <label className={labelCls}>Sprint</label>
              <select value={sprintId} onChange={e => setSprintId(e.target.value)} className={inputCls}>
                <option value="">No sprint</option>
                {sprints.map(s => <option key={s.id} value={s.id}>{s.name} ({s.state})</option>)}
              </select>
            </div>
          )}

          {/* Zephyr cycle */}
          {cycles.length > 0 && (
            <div>
              <label className={labelCls}>Zephyr Test Cycle</label>
              <select value={cycleId} onChange={e => setCycleId(e.target.value)} className={inputCls}>
                <option value="">No cycle</option>
                {cycles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

          {/* Story link (collapsible) */}
          <div>
            <button
              onClick={() => setShowStory(s => !s)}
              className={`w-full text-xs text-left px-3 py-2 rounded-lg border-2 border-dashed transition-colors ${showStory ? 'border-accent/40 bg-accent/5' : 'border-ink-200 text-ink-500 hover:border-ink-300'}`}
            >
              {showStory ? '▾ Story link (optional)' : '▸ Story link (optional) — ทีมส่วนใหญ่ไม่ได้ link กับ Story — เพิ่มได้ถ้าต้องการ'}
            </button>
            {showStory && (
              <input value={storyKey} onChange={e => setStoryKey(e.target.value.toUpperCase())}
                placeholder="PROJ-100"
                className={`${inputCls} mt-2 font-mono`} />
            )}
          </div>

          {/* Evidence summary */}
          {(evidence.screenshots.length > 0 || evidence.apiResponse || evidence.notes) && (
            <div className="bg-ink-50 rounded-lg p-3 text-xs text-ink-500 space-y-1">
              <p className="font-medium text-ink-600">Evidence attached:</p>
              {evidence.screenshots.length > 0 && <p>• {evidence.screenshots.length} screenshot{evidence.screenshots.length !== 1 ? 's' : ''}</p>}
              {evidence.apiResponse && <p>• API response attached</p>}
              {evidence.notes && <p>• Notes: {evidence.notes.slice(0, 80)}{evidence.notes.length > 80 ? '…' : ''}</p>}
            </div>
          )}

          {error && <p className="text-xs text-danger">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-ink-100 shrink-0">
          <button onClick={onClose} className="btn-ghost text-sm">Cancel</button>
          <button onClick={submit} disabled={submitting}
            className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50">
            {submitting && (
              <svg className="animate-spin" width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="white" strokeWidth="2" strokeOpacity="0.4" /><path d="M8 2a6 6 0 0 1 6 6" stroke="white" strokeWidth="2" strokeLinecap="round" /></svg>
            )}
            Confirm & create in Jira
          </button>
        </div>
      </div>
    </div>
  )
}
