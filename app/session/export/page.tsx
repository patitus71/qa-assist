// app/session/export/page.tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSession } from '@/lib/session-context'
import { exportTCXlsx } from '@/lib/export-xlsx'
import { exportTCMPdf } from '@/lib/export-pdf'
import { exportPostmanCollection } from '@/lib/export-postman'
import { TCMColumnEditor } from '@/app/components/TCMColumnEditor'
import type { TC, APITC } from '@/lib/types'

// ── Format row ────────────────────────────────────────────────────────────────

function FormatRow({
  icon, label, tag, onClick, href, disabled,
}: {
  icon: React.ReactNode
  label: string
  tag: string
  onClick?: () => void
  href?: string
  disabled?: boolean
}) {
  const cls = `flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-colors w-full text-left ${
    disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-ink-50 cursor-pointer'
  }`

  const inner = (
    <>
      <span className="text-ink-400 shrink-0">{icon}</span>
      <span className="text-sm text-ink-700 flex-1 whitespace-nowrap">{label}</span>
      <span className="font-mono text-[10px] bg-ink-100 text-ink-500 px-1.5 py-0.5 rounded whitespace-nowrap shrink-0">{tag}</span>
    </>
  )

  if (href && !disabled) return (
    <Link href={href} className={cls}>{inner}</Link>
  )
  return (
    <button onClick={onClick} disabled={disabled} className={cls}>{inner}</button>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────

const ExcelIcon = <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="2" y="1" width="12" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.5" /><path d="M5 5l2 3-2 3M8 5l2 3-2 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
const PdfIcon = <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="2" y="1" width="12" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.5" /><path d="M5 6h6M5 9h4M5 12h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
const RobotIcon = <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="3" y="6" width="10" height="8" rx="2" stroke="currentColor" strokeWidth="1.5" /><circle cx="6" cy="10" r="0.8" fill="currentColor" /><circle cx="10" cy="10" r="0.8" fill="currentColor" /><path d="M8 3v3M6 3h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
const JiraIcon = <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="5" height="5" rx="1" fill="currentColor" opacity="0.5" /><rect x="9" y="2" width="5" height="5" rx="1" fill="currentColor" /><rect x="2" y="9" width="5" height="5" rx="1" fill="currentColor" /><rect x="9" y="9" width="5" height="5" rx="1" fill="currentColor" opacity="0.5" /></svg>
const PostmanIcon = <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" /><path d="M5 8h6M8 5v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>

// ── Push to Jira modal ────────────────────────────────────────────────────────

interface PushResult { tcId: string; jiraKey?: string; error?: string }

function PushJiraModal({
  tcs,
  onClose,
}: {
  tcs: TC[]
  onClose: () => void
}) {
  const [projectKey, setProjectKey] = useState('')
  const [parentKey, setParentKey] = useState('')
  const [pushing, setPushing] = useState(false)
  const [results, setResults] = useState<PushResult[] | null>(null)
  const [error, setError] = useState('')

  async function push() {
    if (!projectKey.trim()) { setError('Project key is required'); return }
    setPushing(true)
    setError('')
    try {
      const res = await fetch('/api/jira/push-tcs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tcs: tcs.map(tc => ({
            id: tc.id, type: tc.type,
            title: tc.type === 'Standard' ? tc.title : tc.type === 'E2E' ? tc.title : undefined,
            steps: tc.type === 'Standard' ? tc.steps : tc.type === 'E2E' ? tc.steps.map((s, i) => `${i + 1}. ${s.keyword} ${s.args}`).join('\n') : undefined,
            expected: tc.type === 'Standard' ? tc.expected : tc.type === 'E2E' ? tc.flow : undefined,
            flow: tc.type === 'E2E' ? tc.flow : undefined,
            method: tc.type === 'API' ? tc.method : undefined,
            endpoint: tc.type === 'API' ? tc.endpoint : undefined,
            priority: tc.priority,
          })),
          projectKey: projectKey.trim().toUpperCase(),
          parentKey: parentKey.trim().toUpperCase() || undefined,
        }),
      })
      const data = await res.json() as { results?: PushResult[]; error?: string }
      if (!res.ok) { setError(data.error ?? 'Push failed'); return }
      setResults(data.results ?? [])
    } catch { setError('Network error') }
    finally { setPushing(false) }
  }

  const pushed = results?.filter(r => r.jiraKey) ?? []
  const failed = results?.filter(r => r.error) ?? []

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-card shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
          <h2 className="text-sm font-semibold text-ink-900">Push to Jira — {tcs.length} TC{tcs.length !== 1 ? 's' : ''}</h2>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-700 p-1">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        </div>

        {results ? (
          <div className="p-5 space-y-3">
            <div className="flex gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold font-mono text-success">{pushed.length}</div>
                <div className="text-xs text-ink-500">Pushed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold font-mono text-danger">{failed.length}</div>
                <div className="text-xs text-ink-500">Failed</div>
              </div>
            </div>
            {pushed.length > 0 && (
              <div className="max-h-40 overflow-y-auto text-xs space-y-1">
                {pushed.map(r => (
                  <div key={r.tcId} className="flex items-center gap-2">
                    <span className="tc-id">{r.tcId}</span>
                    <span className="text-success font-mono">{r.jiraKey}</span>
                  </div>
                ))}
              </div>
            )}
            {failed.length > 0 && (
              <div className="text-xs text-danger space-y-0.5">
                {failed.map(r => <div key={r.tcId}>{r.tcId}: {r.error}</div>)}
              </div>
            )}
            <button onClick={onClose} className="btn-ghost w-full text-sm">Close</button>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div>
              <label className="text-xs font-medium text-ink-500 uppercase tracking-wide block mb-1.5">Project Key <span className="text-danger">*</span></label>
              <input value={projectKey} onChange={e => setProjectKey(e.target.value.toUpperCase())} placeholder="PROJ"
                className="w-full font-mono text-sm border border-ink-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-500 uppercase tracking-wide block mb-1.5">Link to parent (optional)</label>
              <input value={parentKey} onChange={e => setParentKey(e.target.value.toUpperCase())} placeholder="PROJ-100"
                className="w-full font-mono text-sm border border-ink-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-accent" />
            </div>
            {error && <p className="text-xs text-danger">{error}</p>}
            <div className="flex gap-3">
              <button onClick={onClose} className="btn-ghost flex-1 text-sm">Cancel</button>
              <button onClick={push} disabled={pushing || !projectKey.trim()}
                className="btn-primary flex-1 text-sm disabled:opacity-50">
                {pushing ? 'Pushing…' : `Push ${tcs.length} TC${tcs.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Column ────────────────────────────────────────────────────────────────────

function ExportColumn({
  title, badge, tcs, onPushJira, onOpenTCM,
  showPdf, showPostman,
}: {
  title: string
  badge: number
  tcs: TC[]
  onPushJira: () => void
  onOpenTCM: () => void
  showPdf: boolean
  showPostman: boolean
}) {
  const disabled = tcs.length === 0
  const apiTCs = tcs.filter((t): t is APITC => t.type === 'API')

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-ink-100 bg-ink-50">
        <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
        <span className="font-mono text-[10px] bg-ink-200 text-ink-600 px-1.5 py-0.5 rounded-full">{badge}</span>
      </div>
      <div className="py-1">
        <FormatRow icon={ExcelIcon} label="Test Case .xlsx" tag=".xlsx" disabled={disabled} onClick={() => exportTCXlsx(tcs, `${title.toLowerCase()}-tc.xlsx`)} />
        <FormatRow icon={ExcelIcon} label="TCM .xlsx" tag=".xlsx" disabled={disabled} onClick={() => onOpenTCM()} />
        {showPdf && <FormatRow icon={PdfIcon} label="PDF Report" tag=".pdf" disabled={disabled} onClick={() => exportTCMPdf(tcs, {}, `${title.toLowerCase()}-report.pdf`)} />}
        {showPostman && <FormatRow icon={PostmanIcon} label="Postman Collection" tag=".json" disabled={disabled} onClick={() => exportPostmanCollection(apiTCs)} />}
        <FormatRow icon={RobotIcon} label="Robot .robot" tag="→ Robot" href="/session/robot" />
        <FormatRow icon={JiraIcon} label="Push to Jira" tag="Jira" disabled={disabled} onClick={onPushJira} />
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ExportPage() {
  const { standardTCs, e2eTCs, apiTCs, jiraKey } = useSession()
  const [pushModal, setPushModal] = useState<TC[] | null>(null)
  const [tcmTarget, setTcmTarget] = useState<{ tcs: TC[]; filename: string } | null>(null)

  const allTCs: TC[] = [...standardTCs, ...e2eTCs, ...apiTCs]
  const total = allTCs.length

  async function handleExportAllPdf() {
    await exportTCMPdf(allTCs, { jiraKey: jiraKey ?? undefined }, 'tcm-all.pdf')
  }

  return (
    <div className="p-8 max-w-5xl w-full">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink-900">Export / Push</h1>
        <p className="text-ink-500 text-sm mt-0.5">Download test cases in multiple formats or push to Jira.</p>
      </div>

      {/* 3-column grid */}
      <div className="grid grid-cols-3 gap-5 mb-6">
        <ExportColumn
          title="Standard"
          badge={standardTCs.length}
          tcs={standardTCs}
          onPushJira={() => setPushModal(standardTCs)}
          onOpenTCM={() => setTcmTarget({ tcs: standardTCs, filename: 'standard-tcm.xlsx' })}
          showPdf
          showPostman={false}
        />
        <ExportColumn
          title="E2E"
          badge={e2eTCs.length}
          tcs={e2eTCs}
          onPushJira={() => setPushModal(e2eTCs)}
          onOpenTCM={() => setTcmTarget({ tcs: e2eTCs, filename: 'e2e-tcm.xlsx' })}
          showPdf
          showPostman={false}
        />
        <ExportColumn
          title="API"
          badge={apiTCs.length}
          tcs={apiTCs}
          onPushJira={() => setPushModal(apiTCs)}
          onOpenTCM={() => setTcmTarget({ tcs: apiTCs, filename: 'api-tcm.xlsx' })}
          showPdf={false}
          showPostman
        />
      </div>

      {/* Export all strip */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-ink-900">Export ทั้งหมด</h2>
          <span className="font-mono text-xs text-ink-500">
            Standard + E2E + API · <span className="text-ink-700">{total}</span> TC
          </span>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => exportTCXlsx(allTCs, 'qa-assist-all-tc.xlsx')} disabled={!total}
            className="btn-ghost text-xs disabled:opacity-40">
            TC .xlsx
          </button>
          <button onClick={() => setTcmTarget({ tcs: allTCs, filename: 'qa-assist-all-tcm.xlsx' })} disabled={!total}
            className="btn-ghost text-xs disabled:opacity-40">
            TCM .xlsx
          </button>
          <button onClick={handleExportAllPdf} disabled={!total}
            className="btn-ghost text-xs disabled:opacity-40">
            PDF Report
          </button>
          <Link href="/session/robot" className="btn-ghost text-xs">
            Robot .robot →
          </Link>
          <button onClick={() => setPushModal(allTCs)} disabled={!total}
            className="btn-primary text-xs disabled:opacity-40">
            Push all → Jira
          </button>
        </div>
      </div>

      {/* Push to Jira modal */}
      {pushModal && (
        <PushJiraModal tcs={pushModal} onClose={() => setPushModal(null)} />
      )}

      {/* TCM Column Editor modal */}
      {tcmTarget && (
        <TCMColumnEditor
          tcs={tcmTarget.tcs}
          filename={tcmTarget.filename}
          onClose={() => setTcmTarget(null)}
        />
      )}
    </div>
  )
}
