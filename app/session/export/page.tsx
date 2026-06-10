// app/session/export/page.tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSession } from '@/lib/session-context'
import { exportTCMPdf } from '@/lib/export-pdf'
import { exportPostmanCollection } from '@/lib/export-postman'
import { TCMColumnEditor } from '@/app/components/TCMColumnEditor'
import { XlsxExportModal } from '@/app/components/XlsxExportModal'
import { PushJiraModal } from '@/app/components/PushJiraModal'
import { ExportResultsModal } from '@/app/components/ExportResultsModal'
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
const ResultIcon  = <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="2" y="1" width="12" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><path d="M5 5.5h2M5 8.5h6M5 11.5h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="8.5" cy="5.5" r="1" fill="currentColor"/></svg>

// ── Column ────────────────────────────────────────────────────────────────────

function ExportColumn({
  title, badge, tcs, onPushJira, onOpenTCM, onOpenXlsx,
  onExportResults, showPdf, showPostman,
}: {
  title: string
  badge: number
  tcs: TC[]
  onPushJira: () => void
  onOpenTCM: () => void
  onOpenXlsx: () => void
  onExportResults: () => void
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
        <FormatRow icon={ExcelIcon} label="Test Case .xlsx" tag=".xlsx" disabled={disabled} onClick={onOpenXlsx} />
        <FormatRow icon={ExcelIcon} label="TCM .xlsx" tag=".xlsx" disabled={disabled} onClick={() => onOpenTCM()} />
        {showPdf && <FormatRow icon={PdfIcon} label="PDF Report" tag=".pdf" disabled={disabled} onClick={() => exportTCMPdf(tcs, {}, `${title.toLowerCase()}-report.pdf`)} />}
        <FormatRow icon={ResultIcon} label="Test Result PDF" tag=".pdf" disabled={disabled} onClick={onExportResults} />
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
  const [xlsxTarget, setXlsxTarget] = useState<{ tcs: TC[]; filename: string } | null>(null)
  const [resultsTarget, setResultsTarget] = useState<TC[] | null>(null)

  const allTCs: TC[] = [...standardTCs, ...e2eTCs, ...apiTCs]
  const total = allTCs.length

  async function handleExportAllPdf() {
    await exportTCMPdf(allTCs, { jiraKey: jiraKey ?? undefined }, 'tcm-all.pdf')
  }

  return (
    <div className="p-3 md:p-4 lg:p-8 max-w-5xl w-full">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink-900">Export / Push</h1>
        <p className="text-ink-500 text-sm mt-0.5">Download test cases in multiple formats or push to Jira.</p>
      </div>

      {/* 3-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
        <ExportColumn
          title="Standard"
          badge={standardTCs.length}
          tcs={standardTCs}
          onPushJira={() => setPushModal(standardTCs)}
          onOpenTCM={() => setTcmTarget({ tcs: standardTCs, filename: 'standard-tcm.xlsx' })}
          onOpenXlsx={() => setXlsxTarget({ tcs: standardTCs, filename: 'standard-tc.xlsx' })}
          onExportResults={() => setResultsTarget(standardTCs)}
          showPdf
          showPostman={false}
        />
        <ExportColumn
          title="E2E"
          badge={e2eTCs.length}
          tcs={e2eTCs}
          onPushJira={() => setPushModal(e2eTCs)}
          onOpenTCM={() => setTcmTarget({ tcs: e2eTCs, filename: 'e2e-tcm.xlsx' })}
          onOpenXlsx={() => setXlsxTarget({ tcs: e2eTCs, filename: 'e2e-tc.xlsx' })}
          onExportResults={() => setResultsTarget(e2eTCs)}
          showPdf
          showPostman={false}
        />
        <ExportColumn
          title="API"
          badge={apiTCs.length}
          tcs={apiTCs}
          onPushJira={() => setPushModal(apiTCs)}
          onOpenTCM={() => setTcmTarget({ tcs: apiTCs, filename: 'api-tcm.xlsx' })}
          onOpenXlsx={() => setXlsxTarget({ tcs: apiTCs, filename: 'api-tc.xlsx' })}
          onExportResults={() => setResultsTarget(apiTCs)}
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
          <button
            onClick={() => setXlsxTarget({ tcs: allTCs, filename: 'qa-assist-all-tc.xlsx' })}
            disabled={!total}
            className="btn-ghost text-xs disabled:opacity-40"
          >
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
          <button onClick={() => setResultsTarget(allTCs)} disabled={!total}
            className="btn-ghost text-xs disabled:opacity-40">
            Test Result PDF
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

      {/* Test Result PDF modal */}
      {resultsTarget && (
        <ExportResultsModal
          tcs={resultsTarget}
          jiraKey={jiraKey ?? undefined}
          onClose={() => setResultsTarget(null)}
        />
      )}

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

      {/* xlsx pre-export modal */}
      {xlsxTarget && (
        <XlsxExportModal
          tcs={xlsxTarget.tcs}
          filename={xlsxTarget.filename}
          onClose={() => setXlsxTarget(null)}
        />
      )}
    </div>
  )
}
