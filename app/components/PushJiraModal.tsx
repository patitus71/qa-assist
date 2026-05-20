'use client'

// app/components/PushJiraModal.tsx
import { useState, useEffect, type KeyboardEvent, type ReactNode } from 'react'
import type { TC } from '@/lib/types'
import { useSession } from '@/lib/session-context'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PushMeta {
  projectKey: string
  workStream: string
  release: string
  squad: string
  sprintId: string
  createdBy: string
  labels: string[]
  components: string
  epicLink: string
  parentKey: string
}

interface ParentChip {
  key: string
  summary: string
  type: string
}

interface PushResult {
  tcId: string
  jiraKey?: string
  error?: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const LS_KEY = 'qa-assist-push-meta'

const DEFAULT_META: PushMeta = {
  projectKey: '',
  workStream: '',
  release: '',
  squad: '',
  sprintId: '',
  createdBy: '',
  labels: ['AI-generated'],
  components: '',
  epicLink: '',
  parentKey: '',
}

// ── localStorage ──────────────────────────────────────────────────────────────

function loadMeta(): PushMeta {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(LS_KEY) : null
    const saved = raw ? (JSON.parse(raw) as Partial<PushMeta>) : {}
    return {
      ...DEFAULT_META,
      ...saved,
      labels: Array.isArray(saved.labels) && saved.labels.length > 0
        ? saved.labels
        : ['AI-generated'],
    }
  } catch {
    return { ...DEFAULT_META }
  }
}

function saveMeta(meta: PushMeta) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(meta)) } catch {}
}

// ── Shared small components ───────────────────────────────────────────────────

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <span className="text-[10px] font-semibold text-ink-400 uppercase tracking-widest whitespace-nowrap">
        {label}
      </span>
      <div className="flex-1 h-px bg-ink-100" />
    </div>
  )
}

function Field({
  label, required, error, children, row,
}: {
  label: string
  required?: boolean
  error?: string
  children: ReactNode
  row?: boolean
}) {
  return (
    <div className={row ? 'flex-1 min-w-0' : ''}>
      <label className="block text-[11px] font-medium text-ink-500 mb-1.5">
        {label}
        {required && <span className="text-danger ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-[11px] text-danger mt-1">{error}</p>}
    </div>
  )
}

function TextInput({
  value, onChange, placeholder, mono, error, uppercase,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  mono?: boolean
  error?: boolean
  uppercase?: boolean
}) {
  return (
    <input
      value={value}
      onChange={e => onChange(uppercase ? e.target.value.toUpperCase() : e.target.value)}
      placeholder={placeholder}
      className={`w-full text-sm border rounded-lg px-3 py-2 bg-white focus:outline-none transition-colors
        ${mono ? 'font-mono' : ''}
        ${error ? 'border-danger focus:border-danger' : 'border-ink-200 focus:border-accent'}`}
    />
  )
}

function JiraIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="5" height="5" rx="1" fill="currentColor" opacity="0.5" />
      <rect x="9" y="2" width="5" height="5" rx="1" fill="currentColor" />
      <rect x="2" y="9" width="5" height="5" rx="1" fill="currentColor" />
      <rect x="9" y="9" width="5" height="5" rx="1" fill="currentColor" opacity="0.5" />
    </svg>
  )
}

function CloseIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function tcDisplayTitle(tc: TC): string {
  if (tc.type === 'API') return `${tc.method} ${tc.endpoint}`
  return tc.title
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  tcs: TC[]
  onClose: () => void
}

export function PushJiraModal({ tcs, onClose }: Props) {
  const { jiraKey } = useSession()

  // Only push TCs that are ai/manual — skip anything sourced from Jira
  const pushable = tcs.filter(tc => tc.source !== 'jira')
  const skipped = tcs.length - pushable.length

  const [meta, setMeta] = useState<PushMeta>(loadMeta)
  const [parentChip, setParentChip] = useState<ParentChip | null>(null)
  const [labelInput, setLabelInput] = useState('')
  const [errors, setErrors] = useState<Partial<Record<keyof PushMeta, string>>>({})
  const [loadingJira, setLoadingJira] = useState(false)
  const [jiraError, setJiraError] = useState('')
  const [stage, setStage] = useState<'form' | 'pushing' | 'done'>('form')
  const [pushResults, setPushResults] = useState<PushResult[]>([])

  useEffect(() => { saveMeta(meta) }, [meta])

  // Project key is derived from parent key when one is set; otherwise manual
  const hasParent = !!meta.parentKey.trim()
  const effectiveProjectKey = hasParent
    ? meta.parentKey.trim().split('-')[0].toUpperCase()
    : meta.projectKey.trim().toUpperCase()

  function update<K extends keyof PushMeta>(key: K, value: PushMeta[K]) {
    setMeta(m => ({ ...m, [key]: value }))
    setErrors(e => ({ ...e, [key]: undefined }))
  }

  function addLabel() {
    const val = labelInput.trim()
    if (!val || meta.labels.includes(val)) { setLabelInput(''); return }
    update('labels', [...meta.labels, val])
    setLabelInput('')
  }

  function removeLabel(lbl: string) {
    if (lbl === 'AI-generated') return
    update('labels', meta.labels.filter(l => l !== lbl))
  }

  function clearAll() {
    setMeta({ ...DEFAULT_META })
    setParentChip(null)
    setErrors({})
    setJiraError('')
  }

  async function loadFromJira() {
    if (!jiraKey) return
    setLoadingJira(true)
    setJiraError('')
    try {
      const res = await fetch(`/api/jira/xlsx-meta?key=${encodeURIComponent(jiraKey)}`)
      const data = await res.json() as {
        sprint?: string; release?: string; components?: string
        epicLink?: string; reporter?: string; labels?: string[]
        parentKey?: string; parentSummary?: string; parentType?: string
        error?: string
      }
      if (!res.ok) { setJiraError(data.error ?? 'Failed to load from Jira'); return }

      setMeta(m => {
        const next = { ...m }
        if (data.sprint)      next.sprintId    = data.sprint
        if (data.release)     next.release     = data.release
        if (data.components)  next.components  = data.components
        if (data.epicLink)    next.epicLink    = data.epicLink
        if (data.reporter)    next.createdBy   = data.reporter
        if (data.parentKey)   next.parentKey   = data.parentKey
        if (data.labels?.length) {
          next.labels = [...new Set([...next.labels, ...data.labels])]
        }
        return next
      })

      // Show parent chip when Jira issue has a parent
      if (data.parentKey) {
        setParentChip({
          key: data.parentKey,
          summary: data.parentSummary ?? '',
          type: data.parentType || 'Parent',
        })
      }
    } catch {
      setJiraError('Network error — could not reach Jira')
    } finally {
      setLoadingJira(false)
    }
  }

  function validate(): boolean {
    const e: Partial<Record<keyof PushMeta, string>> = {}
    if (!hasParent && !meta.projectKey.trim()) e.projectKey = 'Required'
    if (!meta.workStream.trim()) e.workStream = 'Required'
    if (!meta.release.trim())    e.release    = 'Required'
    if (!meta.squad.trim())      e.squad      = 'Required'
    if (Object.keys(e).length > 0) { setErrors(e); return false }
    return true
  }

  async function handlePush() {
    if (!validate() || pushable.length === 0) return
    setStage('pushing')
    setJiraError('')

    try {
      const res = await fetch('/api/jira/push-tcs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tcs: pushable.map(tc => ({
            id: tc.id,
            type: tc.type,
            title:    tc.type !== 'API' ? tc.title : undefined,
            steps:    tc.type === 'Standard' ? tc.steps
                    : tc.type === 'E2E'
                      ? tc.steps.map((s, i) => `${i + 1}. [${s.type}] ${s.keyword}${s.args ? ' ' + s.args : ''}`).join('\n')
                    : undefined,
            expected: tc.type === 'Standard' ? tc.expected
                    : tc.type === 'E2E'      ? tc.flow
                    : tc.type === 'API'
                      ? tc.assertions.map(a => `${a.type} ${a.operator} ${a.expected}`).join('; ')
                    : undefined,
            flow:     tc.type === 'E2E'  ? tc.flow     : undefined,
            method:   tc.type === 'API'  ? tc.method   : undefined,
            endpoint: tc.type === 'API'  ? tc.endpoint : undefined,
            priority: tc.priority,
            aiGenerated: tc.aiGenerated ?? false,
          })),
          projectKey:  effectiveProjectKey,
          parentKey:   meta.parentKey.trim().toUpperCase() || undefined,
          workStream:  meta.workStream.trim()  || undefined,
          release:     meta.release.trim()     || undefined,
          squad:       meta.squad.trim()       || undefined,
          sprintId:    meta.sprintId.trim()    || undefined,
          createdBy:   meta.createdBy.trim()   || undefined,
          labels:      meta.labels,
          components:  meta.components.trim()  || undefined,
          epicLink:    meta.epicLink.trim()    || undefined,
        }),
      })

      const data = await res.json() as { results?: PushResult[]; error?: string }
      if (!res.ok) {
        setJiraError(data.error ?? 'Push failed')
        setStage('form')
        return
      }
      setPushResults(data.results ?? [])
      setStage('done')
    } catch {
      setJiraError('Network error')
      setStage('form')
    }
  }

  // ── Preview data ──────────────────────────────────────────────────────────

  const preview: { label: string; value: string; req?: boolean }[] = [
    { label: 'Project Key', value: effectiveProjectKey, req: true },
    { label: 'Work Stream', value: meta.workStream, req: true },
    { label: 'Release',     value: meta.release,    req: true },
    { label: 'Squad',       value: meta.squad,      req: true },
    { label: 'Sprint ID',   value: meta.sprintId },
    { label: 'Labels',      value: meta.labels.join(', ') },
    { label: 'Components',  value: meta.components },
    { label: 'Epic Link',   value: meta.epicLink },
    { label: 'Parent',      value: meta.parentKey },
    { label: 'Created by',  value: meta.createdBy },
  ]

  const requiredStatus = [
    { label: `Project Key${hasParent ? ' (auto)' : ''}`, ok: !!effectiveProjectKey },
    { label: 'Work Stream', ok: !!meta.workStream.trim() },
    { label: 'Release',     ok: !!meta.release.trim() },
    { label: 'Squad',       ok: !!meta.squad.trim() },
  ]

  // ── Results view ──────────────────────────────────────────────────────────

  if (stage === 'done') {
    const pushedCount = pushResults.filter(r => r.jiraKey).length
    const failedCount = pushResults.filter(r => r.error).length

    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-ink-800 rounded-card shadow-2xl w-full max-w-lg">
          <div className="flex items-center justify-between px-6 py-4 border-b border-ink-100">
            <h2 className="text-sm font-semibold text-ink-900">Push Results</h2>
            <button onClick={onClose} className="text-ink-400 hover:text-ink-700 p-1 rounded transition-colors">
              <CloseIcon />
            </button>
          </div>

          <div className="p-6 space-y-5">
            {/* Summary counters */}
            <div className="flex gap-8">
              <div className="text-center">
                <div className="text-3xl font-bold font-mono text-success">{pushedCount}</div>
                <div className="text-xs text-ink-500 mt-0.5">Pushed</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold font-mono text-danger">{failedCount}</div>
                <div className="text-xs text-ink-500 mt-0.5">Failed</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold font-mono text-ink-700">{pushResults.length}</div>
                <div className="text-xs text-ink-500 mt-0.5">Total</div>
              </div>
            </div>

            {/* Result list */}
            <div className="max-h-64 overflow-y-auto border border-ink-100 rounded-lg divide-y divide-ink-50">
              {pushResults.map(r => (
                <div key={r.tcId} className="flex items-center gap-2.5 px-3 py-2">
                  <span className="tc-id shrink-0">{r.tcId}</span>
                  {r.jiraKey
                    ? <span className="font-mono text-xs text-success font-medium">{r.jiraKey}</span>
                    : <span className="text-xs text-danger truncate">{r.error}</span>
                  }
                </div>
              ))}
            </div>

            <button onClick={onClose} className="btn-ghost w-full text-sm">Close</button>
          </div>
        </div>
      </div>
    )
  }

  // ── Form / pushing view ───────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && stage !== 'pushing' && onClose()}
    >
      <div className="bg-white dark:bg-ink-800 rounded-card shadow-2xl w-full max-w-4xl flex flex-col max-h-[92vh]">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-ink-100 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-ink-900">
              Push to Jira
              {stage === 'pushing' && (
                <span className="text-ink-400 font-normal ml-2 text-xs">pushing…</span>
              )}
            </h2>
            <p className="text-xs text-ink-500 mt-0.5">
              {pushable.length} TC{pushable.length !== 1 ? 's' : ''} will be pushed
              {skipped > 0 && (
                <span className="ml-1.5 text-ink-400">
                  · {skipped} skipped (sourced from Jira)
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={stage === 'pushing'}
            className="text-ink-400 hover:text-ink-700 p-1 rounded transition-colors disabled:opacity-30"
          >
            <CloseIcon />
          </button>
        </div>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden min-h-0">

          {/* Left: form */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 border-r border-ink-100">

            {/* ── TC list ────────────────────────────────────────────────── */}
            <SectionDivider label={`TCs to push — ${pushable.length}`} />

            <div className="max-h-36 overflow-y-auto rounded-lg border border-ink-100 bg-ink-50 divide-y divide-ink-100">
              {pushable.length === 0 ? (
                <p className="text-xs text-ink-400 text-center py-4">
                  No TCs to push — all selected TCs were sourced from Jira
                </p>
              ) : pushable.map(tc => (
                <div key={tc.id} className="flex items-center gap-2 px-3 py-1.5">
                  <span className="tc-id shrink-0">{tc.id}</span>
                  <span className="text-xs text-ink-700 truncate flex-1">{tcDisplayTitle(tc)}</span>
                  {tc.aiGenerated && (
                    <span className="font-mono text-[9px] bg-accent/10 text-accent border border-accent/20 px-1.5 py-0.5 rounded-full shrink-0 leading-none">
                      AI
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* ── Required fields ────────────────────────────────────────── */}
            <SectionDivider label="Required fields" />

            {/* Project Key — only shown when no parent key is set */}
            {!hasParent && (
              <Field label="Project Key" required error={errors.projectKey}>
                <TextInput
                  value={meta.projectKey}
                  onChange={v => update('projectKey', v)}
                  placeholder="PROJ"
                  mono uppercase
                  error={!!errors.projectKey}
                />
              </Field>
            )}

            <div className="flex gap-3">
              <Field label="Work Stream" required error={errors.workStream} row>
                <TextInput
                  value={meta.workStream}
                  onChange={v => update('workStream', v)}
                  placeholder="e.g. Deposit, Lending"
                  error={!!errors.workStream}
                />
              </Field>
              <Field label="Squad" required error={errors.squad} row>
                <TextInput
                  value={meta.squad}
                  onChange={v => update('squad', v)}
                  placeholder="e.g. Squad Alpha"
                  error={!!errors.squad}
                />
              </Field>
            </div>

            <Field label="Release" required error={errors.release}>
              <TextInput
                value={meta.release}
                onChange={v => update('release', v)}
                placeholder="e.g. v1.4.0, 2024-Q3"
                error={!!errors.release}
              />
            </Field>

            {/* ── Optional fields ────────────────────────────────────────── */}
            <SectionDivider label="Optional fields" />

            <div className="flex gap-3">
              <Field label="Sprint ID" row>
                <TextInput
                  value={meta.sprintId}
                  onChange={v => update('sprintId', v)}
                  placeholder="e.g. Sprint 42"
                />
              </Field>
              <Field label="Created by" row>
                <TextInput
                  value={meta.createdBy}
                  onChange={v => update('createdBy', v)}
                  placeholder="e.g. john.doe"
                />
              </Field>
            </div>

            {/* Labels tag input */}
            <Field label="Labels">
              <div className="space-y-2">
                {meta.labels.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {meta.labels.map(lbl => (
                      <span
                        key={lbl}
                        className="inline-flex items-center gap-1 font-mono text-[11px] bg-accent/10 text-accent border border-accent/20 px-2 py-0.5 rounded-full"
                      >
                        {lbl}
                        {lbl !== 'AI-generated' && (
                          <button
                            type="button"
                            onClick={() => removeLabel(lbl)}
                            className="hover:text-danger leading-none ml-0.5 text-xs"
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                )}
                <input
                  value={labelInput}
                  onChange={e => setLabelInput(e.target.value)}
                  onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                    if (e.key === 'Enter') { e.preventDefault(); addLabel() }
                  }}
                  placeholder="Type tag and press Enter to add…"
                  className="w-full font-mono text-xs border border-dashed border-ink-300 rounded-lg px-3 py-2 bg-transparent focus:outline-none focus:border-accent text-ink-700 placeholder:text-ink-400"
                />
              </div>
            </Field>

            <div className="flex gap-3">
              <Field label="Components" row>
                <TextInput
                  value={meta.components}
                  onChange={v => update('components', v)}
                  placeholder="e.g. UI, Backend"
                />
              </Field>
              <Field label="Epic Link" row>
                <TextInput
                  value={meta.epicLink}
                  onChange={v => update('epicLink', v)}
                  placeholder="e.g. PROJ-100"
                  mono
                />
              </Field>
            </div>

            {/* ── Link to parent ──────────────────────────────────────────── */}
            <SectionDivider label="Link to parent (sub-task)" />

            {parentChip ? (
              /* Chip mode — parent detected from Jira */
              <div className="flex items-start gap-2">
                <div className="flex items-center gap-2 flex-1 bg-accent/5 border border-accent/20 rounded-lg px-3 py-2.5">
                  <span className="font-mono text-xs font-semibold text-accent shrink-0">
                    {parentChip.key}
                  </span>
                  <span className="text-[10px] text-ink-500 bg-ink-100 px-1.5 py-0.5 rounded shrink-0">
                    {parentChip.type}
                  </span>
                  {parentChip.summary && (
                    <span className="text-xs text-ink-600 truncate">
                      {parentChip.summary}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => { setParentChip(null); update('parentKey', '') }}
                  className="p-2 text-ink-400 hover:text-danger rounded-lg border border-ink-200 hover:border-danger/30 transition-colors shrink-0"
                  title="Remove parent"
                >
                  <CloseIcon size={14} />
                </button>
              </div>
            ) : (
              /* Plain input mode */
              <Field label="Parent Issue Key">
                <TextInput
                  value={meta.parentKey}
                  onChange={v => update('parentKey', v)}
                  placeholder="e.g. PROJ-100 (optional)"
                  mono uppercase
                />
              </Field>
            )}

            {/* ── Actions ────────────────────────────────────────────────── */}
            <div className="flex items-center gap-2 pt-1">
              {jiraKey && (
                <button
                  type="button"
                  onClick={loadFromJira}
                  disabled={loadingJira || stage === 'pushing'}
                  className="btn-ghost text-xs flex items-center gap-1.5 disabled:opacity-50"
                >
                  <JiraIcon />
                  {loadingJira ? 'Loading…' : `Load from ${jiraKey}`}
                </button>
              )}
              <button
                type="button"
                onClick={clearAll}
                disabled={stage === 'pushing'}
                className="btn-ghost text-xs disabled:opacity-50"
              >
                Clear all
              </button>
              {jiraError && (
                <span className="text-xs text-danger ml-1">{jiraError}</span>
              )}
            </div>
          </div>

          {/* ── Right: Preview panel ──────────────────────────────────────── */}
          <div className="w-60 shrink-0 overflow-y-auto bg-ink-50 rounded-br-card">
            <div className="p-4">
              <p className="text-[10px] font-semibold text-ink-400 uppercase tracking-widest mb-3">
                Preview
              </p>

              {/* Dark preview block */}
              <div className="bg-ink-900 rounded-xl p-3.5 space-y-2">
                {preview.map(({ label, value, req }) => (
                  <div key={label}>
                    <div className="text-[9px] font-mono text-ink-500 uppercase tracking-wide leading-none mb-0.5">
                      {label}{req ? ' *' : ''}
                    </div>
                    <div className={`text-[11px] font-mono break-all leading-snug ${
                      value ? 'text-green-300' : 'text-ink-600'
                    }`}>
                      {value || '—'}
                    </div>
                  </div>
                ))}

                <div className="border-t border-ink-700 pt-2 mt-1">
                  <div className="text-[9px] font-mono text-ink-500 uppercase tracking-wide mb-0.5">
                    Pushing
                  </div>
                  <div className="text-[11px] font-mono text-green-300">
                    {pushable.length} TC{pushable.length !== 1 ? 's' : ''}
                    {skipped > 0 && (
                      <span className="text-ink-600 ml-1">({skipped} skip)</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Required status dots */}
              <div className="mt-3 space-y-1">
                {requiredStatus.map(({ label, ok }) => (
                  <div key={label} className="flex items-center gap-1.5 text-[11px]">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      ok ? 'bg-success' : 'bg-ink-300'
                    }`} />
                    <span className={ok ? 'text-success' : 'text-ink-400'}>{label}</span>
                  </div>
                ))}
              </div>

              {/* Pushing spinner overlay hint */}
              {stage === 'pushing' && (
                <div className="mt-4 flex items-center gap-2 text-xs text-ink-500">
                  <svg className="animate-spin w-3.5 h-3.5 text-accent shrink-0" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2.5" strokeDasharray="22 16" />
                  </svg>
                  Pushing TCs to Jira…
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="px-6 py-4 border-t border-ink-100 flex items-center justify-between shrink-0">
          <p className="text-[11px] text-ink-400 font-mono">
            ค่าที่กรอกจะถูกบันทึกไว้ใช้ครั้งต่อไป
          </p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={stage === 'pushing'}
              className="btn-ghost text-sm disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={handlePush}
              disabled={stage === 'pushing' || pushable.length === 0}
              className="btn-primary text-sm disabled:opacity-50 flex items-center gap-2"
            >
              {stage === 'pushing' ? (
                <>
                  <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2.5" strokeDasharray="22 16" />
                  </svg>
                  Pushing…
                </>
              ) : (
                `Push ${pushable.length} TC${pushable.length !== 1 ? 's' : ''}`
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
