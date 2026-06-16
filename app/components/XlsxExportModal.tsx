'use client'

// app/components/XlsxExportModal.tsx
import { useState, useEffect, type KeyboardEvent, type ReactNode } from 'react'
import type { TC, StandardTC } from '@/lib/types'
import { exportTCXlsx, type XlsxMeta } from '@/lib/export-xlsx'
import { useSession } from '@/lib/session-context'

// ── Constants ─────────────────────────────────────────────────────────────────

const LS_KEY = 'qa-assist-xlsx-meta'

const LINK_TYPES = ['Relates To', 'Blocks', 'Is Blocked By', 'Duplicates', 'Caused By'] as const

const DEFAULT_META: XlsxMeta = {
  workStream: '',
  release: '',
  squad: '',
  sprintId: '',
  createdBy: '',
  labels: ['AI-generated'],
  components: '',
  epicLink: '',
  linkType: 'Relates To',
  issueKey: '',
}

// ── localStorage helpers ──────────────────────────────────────────────────────

function loadMeta(): XlsxMeta {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(LS_KEY) : null
    if (!raw) return { ...DEFAULT_META }
    const p = JSON.parse(raw) as Partial<XlsxMeta>
    return {
      ...DEFAULT_META,
      ...p,
      labels: Array.isArray(p.labels) && p.labels.length > 0 ? p.labels : ['AI-generated'],
    }
  } catch {
    return { ...DEFAULT_META }
  }
}

function saveMeta(meta: XlsxMeta) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(meta)) } catch {}
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <span className="text-[10px] font-semibold text-ink-400 uppercase tracking-widest whitespace-nowrap">{label}</span>
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
    <div className={row ? 'flex-1' : ''}>
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
  value, onChange, placeholder, mono, error,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  mono?: boolean
  error?: boolean
}) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full text-sm border rounded-lg px-3 py-2 bg-white focus:outline-none transition-colors
        ${mono ? 'font-mono' : ''}
        ${error
          ? 'border-danger focus:border-danger'
          : 'border-ink-200 focus:border-accent'
        }`}
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

// ── Main modal ────────────────────────────────────────────────────────────────

interface Props {
  tcs: TC[]
  filename?: string
  onClose: () => void
}

export function XlsxExportModal({ tcs, filename = 'test-cases.xlsx', onClose }: Props) {
  const { jiraKey } = useSession()
  const [meta, setMeta] = useState<XlsxMeta>(() => {
    const ls = loadMeta()
    // Pre-fill from exportMeta only when localStorage has no required fields saved
    if (!ls.workStream && !ls.release && !ls.squad) {
      const first = tcs.find(t => t.type === 'Standard') as StandardTC | undefined
      const em = first?.exportMeta
      if (em) {
        const labelsFromMeta = em.labels ? em.labels.split(',').map(s => s.trim()).filter(Boolean) : []
        return {
          ...ls,
          workStream: em.workStream  ?? ls.workStream,
          release:    em.release     ?? ls.release,
          squad:      em.squad       ?? ls.squad,
          sprintId:   em.sprintId    ?? ls.sprintId,
          createdBy:  em.createdBy   ?? ls.createdBy,
          components: em.component   ?? ls.components,
          epicLink:   em.epicLink    ?? ls.epicLink,
          issueKey:   em.issueKey    ?? ls.issueKey,
          labels:     labelsFromMeta.length > 0
            ? [...new Set([...labelsFromMeta, ...ls.labels])]
            : ls.labels,
        }
      }
    }
    return ls
  })
  const [labelInput, setLabelInput] = useState('')
  const [errors, setErrors] = useState<Partial<Record<keyof XlsxMeta, string>>>({})
  const [loadingJira, setLoadingJira] = useState(false)
  const [jiraError, setJiraError] = useState('')

  // Persist on every change
  useEffect(() => { saveMeta(meta) }, [meta])

  function update<K extends keyof XlsxMeta>(key: K, value: XlsxMeta[K]) {
    setMeta(m => ({ ...m, [key]: value }))
    setErrors(e => ({ ...e, [key]: undefined }))
  }

  function addLabel() {
    const val = labelInput.trim()
    if (!val) return
    if (!meta.labels.includes(val)) update('labels', [...meta.labels, val])
    setLabelInput('')
  }

  function removeLabel(lbl: string) {
    if (lbl === 'AI-generated') return
    update('labels', meta.labels.filter(l => l !== lbl))
  }

  function clearAll() {
    setMeta({ ...DEFAULT_META })
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
        epicLink?: string; reporter?: string; labels?: string[]; error?: string
      }
      if (!res.ok) { setJiraError(data.error ?? 'Failed to load from Jira'); return }
      setMeta(m => {
        const base = { ...m }
        if (data.sprint) base.sprintId = data.sprint
        if (data.release) base.release = data.release
        if (data.components) base.components = data.components
        if (data.epicLink) base.epicLink = data.epicLink
        if (data.reporter) base.createdBy = data.reporter
        if (data.labels?.length) {
          const merged = [...new Set([...base.labels, ...data.labels])]
          base.labels = merged
        }
        return base
      })
    } catch {
      setJiraError('Network error — could not reach Jira')
    } finally {
      setLoadingJira(false)
    }
  }

  function validate(): boolean {
    const e: Partial<Record<keyof XlsxMeta, string>> = {}
    if (!meta.workStream.trim()) e.workStream = 'Required'
    if (!meta.release.trim()) e.release = 'Required'
    if (!meta.squad.trim()) e.squad = 'Required'
    if (Object.keys(e).length > 0) { setErrors(e); return false }
    return true
  }

  function handleExport() {
    if (!validate()) return
    exportTCXlsx(tcs, filename, meta)
    onClose()
  }

  // ── Preview data ──────────────────────────────────────────────────────────

  const preview: { label: string; value: string; req?: boolean }[] = [
    { label: 'Work Stream', value: meta.workStream, req: true },
    { label: 'Sprint ID',   value: meta.sprintId },
    { label: 'Release',     value: meta.release, req: true },
    { label: 'Squad',       value: meta.squad, req: true },
    { label: 'Labels',      value: meta.labels.join(', ') },
    { label: 'Components',  value: meta.components },
    { label: 'Epic Link',   value: meta.epicLink },
    { label: 'Link Type',   value: meta.linkType },
    { label: 'Issue Key',   value: meta.issueKey },
    { label: 'Created by',  value: meta.createdBy },
  ]

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white dark:bg-ink-800 rounded-card shadow-2xl w-full max-w-4xl flex flex-col max-h-[92vh]">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-ink-100 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-ink-900">Export Test Cases .xlsx</h2>
            <p className="text-xs text-ink-500 mt-0.5">
              {tcs.length} TC · กรอกข้อมูล Zephyr ก่อน export
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-ink-400 hover:text-ink-700 p-1 rounded transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden min-h-0">

          {/* Left: form */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 border-r border-ink-100">

            {/* ── Required ───────────────────────────────────────────────── */}
            <SectionDivider label="Required fields" />

            <Field label="Work Stream" required error={errors.workStream}>
              <TextInput
                value={meta.workStream}
                onChange={v => update('workStream', v)}
                placeholder="e.g. Deposit, Lending, Cards"
                error={!!errors.workStream}
              />
            </Field>

            <div className="flex gap-3">
              <Field label="Release" required error={errors.release} row>
                <TextInput
                  value={meta.release}
                  onChange={v => update('release', v)}
                  placeholder="e.g. v1.4.0, 2024-Q3"
                  error={!!errors.release}
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

            {/* ── Optional ───────────────────────────────────────────────── */}
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

            {/* ── Issues to link ─────────────────────────────────────────── */}
            <SectionDivider label="Issues to link" />

            <div className="flex gap-3">
              <Field label="Link Type" row>
                <select
                  value={meta.linkType}
                  onChange={e => update('linkType', e.target.value)}
                  className="w-full text-sm border border-ink-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-accent text-ink-700"
                >
                  {LINK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Issue Key" row>
                <TextInput
                  value={meta.issueKey}
                  onChange={v => update('issueKey', v)}
                  placeholder="e.g. PROJ-999"
                  mono
                />
              </Field>
            </div>

            {/* ── Actions ────────────────────────────────────────────────── */}
            <div className="flex items-center gap-2 pt-1">
              {jiraKey && (
                <button
                  type="button"
                  onClick={loadFromJira}
                  disabled={loadingJira}
                  className="btn-ghost text-xs flex items-center gap-1.5 disabled:opacity-50"
                >
                  <JiraIcon />
                  {loadingJira ? 'Loading…' : `Load from ${jiraKey}`}
                </button>
              )}
              <button
                type="button"
                onClick={clearAll}
                className="btn-ghost text-xs"
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
              <div className="bg-ink-900 rounded-xl p-3.5 space-y-2">
                {preview.map(({ label, value, req }) => (
                  <div key={label}>
                    <div className="text-[9px] font-mono text-ink-500 uppercase tracking-wide leading-none mb-0.5">
                      {label}{req ? ' *' : ''}
                    </div>
                    <div
                      className={`text-[11px] font-mono break-all leading-snug ${
                        value ? 'text-green-300' : 'text-ink-600'
                      }`}
                    >
                      {value || '—'}
                    </div>
                  </div>
                ))}
                <div className="border-t border-ink-700 pt-2 mt-1">
                  <div className="text-[9px] font-mono text-ink-500 uppercase tracking-wide mb-0.5">TCs</div>
                  <div className="text-[11px] font-mono text-green-300">{tcs.length} rows</div>
                </div>
              </div>

              {/* Required field status */}
              <div className="mt-3 space-y-1">
                {[
                  { label: 'Work Stream', ok: !!meta.workStream.trim() },
                  { label: 'Release', ok: !!meta.release.trim() },
                  { label: 'Squad', ok: !!meta.squad.trim() },
                ].map(({ label, ok }) => (
                  <div key={label} className="flex items-center gap-1.5 text-[11px]">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${ok ? 'bg-success' : 'bg-ink-300'}`} />
                    <span className={ok ? 'text-success' : 'text-ink-400'}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="px-6 py-4 border-t border-ink-100 flex items-center justify-between shrink-0">
          <p className="text-[11px] text-ink-400 font-mono">
            ค่าที่กรอกจะถูกบันทึกไว้ใช้ครั้งต่อไป
          </p>
          <div className="flex gap-3">
            <button onClick={onClose} className="btn-ghost text-sm">
              Cancel
            </button>
            <button
              onClick={handleExport}
              className="btn-primary text-sm"
            >
              Export .xlsx
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
